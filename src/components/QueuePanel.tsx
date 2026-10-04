import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Dimensions,
  Platform, Alert, InteractionManager, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Text, useTheme, IconButton, Portal, Dialog, TextInput, Button } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { EqualizerAnimation } from './EqualizerAnimation';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming,
  runOnJS, interpolate, Extrapolation, clamp,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useUISettingsStore } from '../store/uiSettingsStore';
import { SPRING, TIMING, EASE_OUT, SHEET_PROJECTION, useReduceMotion } from '../theme/motion';
import { RADIUS } from '../theme/radius';

const ITEM_HEIGHT = 68;
const ITEM_SEPARATOR = 1;
const SWIPE_THRESHOLD = -50;
const SWIPE_REVEAL = -80;
const PEEK_HEIGHT = 340;
/**
 * Height of the collapsed bar, excluding the bottom safe-area inset.
 *
 * The handle area stacks: 14 top padding + 5 bar + 12 bar margin + ~22 label
 * line + 2 + ~16 meta line + 12 bottom padding = ~83. At 76 the content
 * overflowed its own container and the bar sat flush against the system
 * gesture bar.
 */
const COLLAPSED_HEIGHT = 88;
export { COLLAPSED_HEIGHT };

const ITEM_HEIGHT_WITH_SEP = ITEM_HEIGHT + ITEM_SEPARATOR;

/**
 * Hoisted so the list receives stable references. Inline arrow props create a
 * new function identity every render, which forces the virtualised list to
 * re-evaluate its cells on each pass.
 */
const getItemLayout = (_data: ArrayLike<any> | null | undefined, index: number) => ({
  length: ITEM_HEIGHT_WITH_SEP,
  offset: ITEM_HEIGHT_WITH_SEP * index,
  index,
});

const ItemSeparator = () => <View style={{ height: ITEM_SEPARATOR }} />;

/**
 * Height of the queue's mini player, excluding the top safe-area inset.
 *
 * Must match PlayerScreen's mini player styles (paddingTop 12 + artwork 48 +
 * paddingBottom 16). The `full` stop derives from this so the expanded sheet
 * cannot slide underneath the mini player when either one is resized.
 */
export const MINI_PLAYER_HEIGHT = 76;

/** Corner radius on the sheet's top edge. */
export const PANEL_RADIUS = RADIUS.lg;

/** Base top padding of the drag handle area, at the collapsed stop. */
const BASE_HANDLE_PADDING = 14;

/**
 * Breathing room between the mini player and the expanded sheet.
 *
 * Zero on purpose: any positive gap exposes the player screen between the two
 * surfaces as a stray band.
 */
const MINI_PLAYER_GAP = 0;

export interface PanelStops {
  collapsed: number;
  peek: number;
  full: number;
}

/**
 * Panel stops, in "points below the top of the screen".
 *
 * `bottomInset` lifts the collapsed bar clear of the system gesture bar, which
 * otherwise sat directly under it. It is deliberately not applied to `peek` or
 * `full`: those stops are tall enough that the inset would only make the sheet
 * feel loose.
 */
export const getPanelStops = (
  windowHeight: number,
  topInset: number,
  bottomInset = 0,
): PanelStops => ({
  collapsed: windowHeight - COLLAPSED_HEIGHT - bottomInset,
  peek: windowHeight - PEEK_HEIGHT,
  /**
   * The sheet tucks up behind the mini player by exactly its corner radius.
   * Stopping at the mini player's bottom edge would leave the two rounded
   * corners showing the player screen through the arcs.
   */
  full: topInset + MINI_PLAYER_HEIGHT + MINI_PLAYER_GAP - PANEL_RADIUS,
});

// Back-compat exports: other modules import these as static constants.
const INITIAL_WINDOW_HEIGHT = Dimensions.get('window').height;
export const COLLAPSED_Y = INITIAL_WINDOW_HEIGHT - COLLAPSED_HEIGHT;
export const PEEK_Y = INITIAL_WINDOW_HEIGHT - PEEK_HEIGHT;
export const FULL_Y = 97;

interface QueueItemData {
  id: string;
  queueItemId?: string;
  name: string;
  artist: string;
  album?: string;
  imageUrl?: string;
  durationMillis?: number;
}

const QueueItem = React.memo(({
  item, drag, isActive, isCurrent, onPress, onRemove, isPlaying, reduceMotion, theme, isAmoled,
}: {
  item: QueueItemData; drag: () => void; isActive: boolean;
  isCurrent: boolean; onPress: (item: any) => void; onRemove: (id: string) => void;
  isPlaying: boolean; reduceMotion: boolean; theme: any; isAmoled: boolean;
}) => {
  const translateX = useSharedValue(0);
  /**
   * Resting scale MUST be 1. This was initialised to 0 while `rowStyle` applied
   * `scale: lift.value`, which scaled every row to zero: the rows still laid
   * out and stayed tappable, but painted nothing.
   */
  const lift = useSharedValue(1);
  const startX = useSharedValue(0);
  const isOpen = useSharedValue(false);
  const removed = useSharedValue(false);

  const itemId = item.queueItemId || item.id;

  const close = useCallback(() => {
    isOpen.value = false;
    translateX.value = withSpring(0, SPRING.ROW);
  }, [isOpen, translateX]);

  const handleRemove = useCallback((id: string) => {
    if (removed.value) return;
    removed.value = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRemove(id);
  }, [onRemove, removed]);

  /**
   * Swipe is locked to a horizontal axis (`activeOffsetX`) and fails on
   * vertical movement, so it can never be confused with the list scrolling or
   * with the sheet's own vertical drag.
   */
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-12, 12])
        .failOffsetY([-14, 14])
        .onStart(() => {
          startX.value = isOpen.value ? SWIPE_REVEAL : 0;
        })
        .onUpdate((e) => {
          translateX.value = clamp(startX.value + e.translationX, SWIPE_REVEAL, 0);
        })
        .onEnd((e) => {
          'worklet';
          const projected = translateX.value + e.velocityX * 0.08;
          const shouldOpen = e.velocityX < -450 || projected < SWIPE_THRESHOLD;
          const shouldDismiss =
            isOpen.value && e.velocityX > 450;

          if (shouldDismiss) {
            // Fling right past the edge dismisses without a second tap.
            isOpen.value = false;
            translateX.value = withSpring(0, SPRING.ROW, () => {
              runOnJS(handleRemove)(itemId);
            });
            return;
          }

          isOpen.value = shouldOpen;
          translateX.value = withSpring(shouldOpen ? SWIPE_REVEAL : 0, SPRING.ROW);
        }),
    [handleRemove, isOpen, itemId, startX, translateX],
  );

  const deleteOpacity = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [SWIPE_REVEAL, -20, 0], [1, 0, 0], Extrapolation.CLAMP),
  }));

  const rowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { scale: lift.value },
    ],
  }));

  const startDrag = useCallback(() => {
    if (isOpen.value) close();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    lift.value = withSpring(1.015, SPRING.ROW);
    drag();
  }, [close, drag, isOpen, lift]);

  const durationStr = item.durationMillis
    ? `${Math.floor(item.durationMillis / 60000)}:${Math.floor((item.durationMillis % 60000) / 1000).toString().padStart(2, '0')}`
    : null;

  const primaryText = '#ffffff';
  const secondaryText = 'rgba(255,255,255,0.68)';

  return (
    <View style={styles.itemShell}>
      {/* Destructive action sits behind the row and is revealed by the swipe. */}
      <Animated.View style={[styles.deleteActionContainer, deleteOpacity]}>
        <TouchableOpacity
          onPress={() => handleRemove(itemId)}
          style={styles.deleteActionButton}
          activeOpacity={0.7}
          accessibilityLabel={`Remove ${item.name} from queue`}
        >
          <Icon name="trash-can-outline" size={20} color={theme.colors.error} />
          <Text style={[styles.deleteActionText, { color: theme.colors.error }]}>Remove</Text>
        </TouchableOpacity>
      </Animated.View>

      <GestureDetector gesture={swipe}>
        <Animated.View
          style={[
            styles.itemOuter,
            isCurrent && {
              backgroundColor: isAmoled ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.10)',
            },
            isActive && { backgroundColor: 'rgba(255,255,255,0.16)' },
            rowStyle,
          ]}
        >
          <TouchableOpacity
            style={styles.itemBody}
            onPress={() => onPress(item)}
            activeOpacity={0.7}
            accessibilityLabel={`Play ${item.name} by ${item.artist}`}
          >
            <View style={styles.artworkWrapper}>
              {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={styles.artwork} transition={150} />
              ) : (
                <View style={[styles.artwork, styles.artworkFallback, { backgroundColor: theme.colors.surfaceVariant }]}>
                  <Icon name="music-note" size={22} color={secondaryText} />
                </View>
              )}
              {isCurrent && (
                <View style={styles.equalizerOverlay}>
                  <EqualizerAnimation color="#ffffff" size={20} isPlaying={isPlaying} />
                </View>
              )}
            </View>

            <View style={styles.trackInfo}>
              <Text
                numberOfLines={1}
                style={[styles.trackName, { color: isCurrent ? theme.colors.primary : primaryText }]}
              >
                {item.name}
              </Text>
              <Text numberOfLines={1} style={[styles.trackSubtitle, { color: secondaryText }]}>
                {item.artist}{durationStr ? ` · ${durationStr}` : ''}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dragHandle}
            onLongPress={startDrag}
            onPressOut={() => { lift.value = withSpring(1, SPRING.ROW); }}
            delayLongPress={140}
            activeOpacity={0.5}
            accessibilityLabel={`Reorder ${item.name}. Long press and drag.`}
            accessibilityRole="adjustable"
          >
            <Icon name="drag-vertical" size={24} color={secondaryText} />
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}, (prev, next) => (
  prev.item.queueItemId === next.item.queueItemId &&
  prev.item.id === next.item.id &&
  prev.item.name === next.item.name &&
  prev.item.artist === next.item.artist &&
  prev.item.imageUrl === next.item.imageUrl &&
  // NOTE: intentionally does NOT compare `index`. Comparing it (as the previous
  // implementation did) forced every row to re-render on any reorder, which is
  // the exact opposite of what memo is here to do.
  prev.isActive === next.isActive &&
  prev.isCurrent === next.isCurrent &&
  prev.isPlaying === next.isPlaying &&
  prev.theme === next.theme &&
  prev.isAmoled === next.isAmoled
));

const EmptyState = React.memo(({ secondaryText, accent }: { secondaryText: string; accent: string }) => (
  <View style={styles.emptyState}>
    <Icon name="playlist-music-outline" size={64} color={accent} />
    <Text variant="titleMedium" style={[styles.emptyTitle, { color: '#ffffff' }]}>
      Your queue is empty
    </Text>
    <Text variant="bodyMedium" style={{ color: secondaryText, textAlign: 'center' }}>
      Songs you play will appear here
    </Text>
  </View>
));

const PlayingFromSection = React.memo(({
  queueSource, queueLength, clearQueue, onSave, theme, secondaryText,
}: {
  queueSource: string; queueLength: number; clearQueue: () => void; onSave: () => void;
  theme: any; secondaryText: string;
}) => (
  <View style={[styles.playingFromSection, { borderBottomColor: 'rgba(255,255,255,0.10)' }]}>
    <View style={{ flex: 1 }}>
      <Text style={[styles.playingFromLabel, { color: secondaryText }]}>Playing from</Text>
      <Text numberOfLines={1} style={[styles.sourceName, { color: '#ffffff' }]}>{queueSource}</Text>
    </View>
    <View style={styles.actionRow}>
      {queueLength > 1 && (
        <TouchableOpacity
          style={styles.saveButton}
          activeOpacity={0.6}
          onPress={clearQueue}
          accessibilityLabel="Clear queue"
        >
          <Icon name="delete-sweep-outline" size={20} color="#ffffff" />
          <Text style={styles.saveButtonText}>Clear</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.saveButton}
        activeOpacity={0.6}
        onPress={onSave}
        accessibilityLabel="Save queue as playlist"
      >
        <Icon name="playlist-plus" size={20} color="#ffffff" />
        <Text style={styles.saveButtonText}>Save</Text>
      </TouchableOpacity>
    </View>
  </View>
));

interface QueuePanelProps {
  translateY: SharedValue<number>;
  isQueueOpen: boolean;
  onQueueOpenChange: (open: boolean) => void;
  queue: any[];
  currentTrack: any | null;
  isPlaying: boolean;
  reorderQueue: (from: number, to: number) => void;
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
  playTrack: (track: any) => void;
  queueSource: string;
  panelGradientColors: [string, string];
  onSavePlaylist?: (name: string) => Promise<void>;
}

type PanelMode = 'collapsed' | 'peek' | 'full';

function QueuePanel({
  translateY, isQueueOpen, onQueueOpenChange, queue, currentTrack, isPlaying,
  reorderQueue, removeFromQueue, clearQueue, playTrack, queueSource,
  panelGradientColors, onSavePlaylist,
}: QueuePanelProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isAmoled = useUISettingsStore((s) => s.isAmoledMode);
  const reduceMotion = useReduceMotion();

  const listRef = useRef<any>(null);
  const [listReady, setListReady] = useState(false);
  const [mode, setMode] = useState<PanelMode>('collapsed');
  const [saveDialogVisible, setSaveDialogVisible] = useState(false);
  const [savePlaylistName, setSavePlaylistName] = useState('');

  // Live window metrics, so rotation and insets are handled correctly.
  const [{ height: windowHeight }, setWindowMetrics] = useState(() => Dimensions.get('window'));
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => setWindowMetrics(window));
    return () => sub?.remove?.();
  }, []);
  const stops = useMemo(
    () => getPanelStops(windowHeight, insets.top, insets.bottom),
    [windowHeight, insets.top, insets.bottom],
  );

  /**
   * Panel stops as shared values.
   *
   * These were previously read through a ref that was reassigned on every
   * render (`stopsRef.current = stops`), which Reanimated warns about:
   * "Tried to modify key `current` of an object which has been already passed
   * to a worklet". Mutating a captured ref means the UI thread can observe a
   * half-written object mid-gesture. Shared values are the supported way to
   * publish render-time numbers to a worklet.
   */
  const stopsShared = useSharedValue(stops);
  useEffect(() => {
    stopsShared.value = stops;
  }, [stops, stopsShared]);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const hasAutoScrolledRef = useRef(false);

  /**
   * Handle padding, animated continuously from the drag position.
   *
   * The sheet tucks `PANEL_RADIUS` behind the mini player when open, so the
   * handle needs extra top padding to clear it. That padding was previously
   * applied as a discrete ternary on `isCollapsed`, which flips only after the
   * spring settles - so the "Queue" title and its subtext jumped 20px at the
   * end of every expand and collapse, breaking the transition.
   *
   * Deriving it from `translateY` instead makes it track the finger: at the
   * collapsed stop it is the base 14, and by the time the sheet has risen
   * `PANEL_RADIUS` above it the full offset has been added, with everything in
   * between interpolated on the UI thread.
   */
  const handleAreaStyle = useAnimatedStyle(() => {
    const { collapsed } = stopsShared.value;
    return {
      paddingTop: interpolate(
        translateY.value,
        // Ascending input range: interpolate requires it.
        [collapsed - PANEL_RADIUS, collapsed],
        [BASE_HANDLE_PADDING + PANEL_RADIUS, BASE_HANDLE_PADDING],
        Extrapolation.CLAMP,
      ),
    };
  });

  // Content fades in as the panel rises above the peek stop; derived from the
  // same shared value that drives position, so it never steps.
  //
  // `interpolate` requires an ASCENDING input range. Passing
  // [collapsed, collapsed - 40] (descending) silently produces an invalid
  // mapping, which rendered the whole content area invisible. Keep the range
  // ascending and invert the output instead.
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [stopsShared.value.collapsed - 40, stopsShared.value.collapsed],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const settle = useCallback((
    targetMode: PanelMode,
    targetY: number,
    open?: boolean,
  ) => {
    modeRef.current = targetMode;
    const done = () => {
      setMode(targetMode);
      if (open !== undefined) onQueueOpenChange(open);
    };

    if (reduceMotion) {
      translateY.value = withTiming(targetY, { duration: 0 });
      done();
      return;
    }

    translateY.value = withSpring(targetY, SPRING.SHEET, (finished) => {
      if (finished) runOnJS(done)();
    });
  }, [onQueueOpenChange, reduceMotion, translateY]);

  // Respond to external open/close. Reads the shared value rather than the
  // (possibly stale) `mode` state so an interrupted animation can't desync.
  useEffect(() => {
    if (isQueueOpen && modeRef.current === 'collapsed') {
      settle('peek', stops.peek);
    } else if (!isQueueOpen && modeRef.current !== 'collapsed') {
      settle('collapsed', stops.collapsed);
    }
  }, [isQueueOpen, settle, stops.peek, stops.collapsed]);

  // Keep the panel pinned to the correct stop when the window resizes.
  useEffect(() => {
    const target = modeRef.current === 'full' ? stops.full
      : modeRef.current === 'peek' ? stops.peek
      : stops.collapsed;
    translateY.value = withTiming(target, { duration: reduceMotion ? 0 : TIMING.BASE });
  }, [stops.collapsed, stops.peek, stops.full, translateY, reduceMotion]);

  /**
   * Snap the list so the current track sits at the top, before the sheet is
   * visible.
   *
   * Three things were wrong with the previous behaviour:
   *
   *  1. It used `scrollToIndex(..., viewPosition: 0.3)`, which places the row
   *     30% down the viewport rather than at the top, so at the peek stop the
   *     current track was still partly cut off.
   *  2. It was gated on `mode !== 'collapsed'`, and `mode` only becomes 'peek'
   *     after the opening spring settles - so the list scrolled *after* the
   *     sheet was already on screen, which is what made it feel like a
   *     correction rather than part of the transition.
   *  3. It animated the scroll (`animated: true`) inside
   *     `InteractionManager.runAfterInteractions`, so a scroll animation ran
   *     concurrently with the sheet spring. Two animations on the same thread
   *     is the expensive part, and on a long queue it is the visible jank.
   *
   * Snapping with `animated: false` costs a single layout pass instead of a
   * scroll animation, and running it while the sheet is still collapsed means
   * the correct rows are already in place by the time it becomes visible.
   */
  useEffect(() => {
    if (!currentTrack) {
      setListReady(true);
      return;
    }

    const identifier = currentTrack.queueItemId || currentTrack.id;
    const currentIndex = queue.findIndex(
      (t) => (t.queueItemId || t.id) === identifier,
    );
    if (currentIndex < 0) {
      setListReady(true);
      return;
    }

    // Wait for the list to have measured before jumping.
    const task = InteractionManager.runAfterInteractions(() => {
      if (!hasAutoScrolledRef.current) {
        /**
         * Snap via offset rather than `scrollToIndex`.
         *
         * Every row is a fixed ITEM_HEIGHT_WITH_SEP, so the target offset is
         * arithmetic - which avoids `scrollToIndex`'s async measurement
         * failure path entirely (it can throw for unmeasured rows, which is
         * why the old code carried a try/catch and an
         * `onScrollToIndexFailed` handler).
         */
        listRef.current?.scrollToOffset?.({
          offset: Math.max(0, currentIndex * ITEM_HEIGHT_WITH_SEP),
          animated: false,
        });
        hasAutoScrolledRef.current = true;
      }
      setListReady(true);
    });

    return () => task.cancel();
  }, [
    // Deliberately not gated on `mode`: the snap should happen as the sheet
    // starts to open, not after it has settled.
    isQueueOpen,
    currentTrack?.queueItemId,
    currentTrack?.id,
    queue.length,
  ]);

  /**
   * Re-arm the snap when the track changes, so the list re-positions for the
   * next song.
   *
   * This deliberately does NOT re-arm on `isQueueOpen`. Doing so raced with
   * the snap effect above: closing the sheet cleared the flag, and the flag
   * was then re-set during the *opening* render - so on every open the list
   * re-snapped after the sheet was already visible, which is exactly the
   * late-correction behaviour we are removing.
   *
   * Because the list stays mounted while collapsed, the snap performed on
   * close is still in place on the next open. Nothing needs to run at open
   * time at all.
   */
  useEffect(() => {
    hasAutoScrolledRef.current = false;
    setListReady(false);
  }, [currentTrack?.queueItemId, currentTrack?.id]);

  /**
   * Snap once on mount so the list is already positioned before the sheet is
   * ever opened. The sheet mounts collapsed, so this runs off-screen.
   */
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => {
      if (!hasAutoScrolledRef.current && currentTrack) {
        const identifier = currentTrack.queueItemId || currentTrack.id;
        const index = queue.findIndex((t) => (t.queueItemId || t.id) === identifier);
        if (index > 0) {
          listRef.current?.scrollToOffset?.({
            offset: index * ITEM_HEIGHT_WITH_SEP,
            animated: false,
          });
        }
        hasAutoScrolledRef.current = true;
      }
      setListReady(true);
    });
    return () => task.cancel();
    // Mount-only: later track changes are handled by the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const currentTrackId = currentTrack?.id;

  const totalMs = queue.reduce((acc, t) => acc + (t.durationMillis || 0), 0);
  const hours = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

  const handleClearQueue = useCallback(() => {
    Alert.alert(
      'Clear Queue',
      'Are you sure you want to clear the queue? Only the current song will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear', style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            clearQueue();
          },
        },
      ],
    );
  }, [clearQueue]);

  const handleSavePlaylist = useCallback(async () => {
    if (!savePlaylistName.trim() || !onSavePlaylist) return;
    try {
      await onSavePlaylist(savePlaylistName.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      // Surfaced by the caller.
    }
    setSaveDialogVisible(false);
    setSavePlaylistName('');
  }, [savePlaylistName, onSavePlaylist]);

  /**
   * `drag`/`isActive` come from DraggableFlatList and carry the authoritative
   * flatlist index via the second renderItem argument, so we no longer
   * recompute it with an O(n) findIndex per row (which was also feeding wrong
   * indices to reorderQueue).
   */
  const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<any>) => {
    return (
      <QueueItem
        item={item}
        drag={drag}
        isActive={isActive}
        isCurrent={(item.queueItemId || item.id) === (currentTrack?.queueItemId || currentTrackId)}
        onPress={playTrack}
        onRemove={removeFromQueue}
        isPlaying={isPlaying}
        reduceMotion={reduceMotion}
        theme={theme}
        isAmoled={isAmoled}
      />
    );
  }, [
    currentTrackId,
    currentTrack?.queueItemId,
    playTrack,
    removeFromQueue,
    isPlaying,
    reduceMotion,
    theme,
    isAmoled,
  ]);

  const handleDragEnd = useCallback(({ from, to }: { from: number; to: number }) => {
    if (from === to) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    reorderQueue(from, to);
  }, [reorderQueue]);

  /** Stable identity: never fall back to an index-based key. */
  const keyExtractor = useCallback(
    (item: any) => item.queueItemId || `q-${item.id}`,
    [],
  );

  const renderEmpty = useCallback(
    () => <EmptyState secondaryText="rgba(255,255,255,0.68)" accent="rgba(255,255,255,0.4)" />,
    [],
  );

  /**
   * Memoised so the array identity is stable across renders. Building it inline
   * made the list treat its content style as changed on every parent render,
   * including every position tick.
   */
  const listContentStyle = useMemo(
    () => [
      styles.listContent,
      { paddingBottom: insets.bottom + 100 },
      queue.length === 0 && styles.listContentEmpty,
    ],
    [insets.bottom, queue.length],
  );

  // Separate listener so the gesture handler itself is not recreated per move.
  const dragStartY = useSharedValue(0);
  const lastModeRef = useRef<PanelMode>('collapsed');

  useEffect(() => { lastModeRef.current = mode; }, [mode]);

  /** Called from the UI thread once the sheet has settled on a stop. */
  const onSettle = useCallback((target: PanelMode) => {
    const changed = lastModeRef.current !== target;
    lastModeRef.current = target;
    setMode(target);
    if (changed) onQueueOpenChange(target !== 'collapsed');
  }, [onQueueOpenChange]);

  const sheetGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-8, 8])
        .onStart(() => {
          dragStartY.value = translateY.value;
        })
        .onUpdate((e) => {
          translateY.value = clamp(
            dragStartY.value + e.translationY,
            stopsShared.value.full,
            stopsShared.value.collapsed,
          );
        })
        .onEnd((e) => {
          'worklet';
          // Project where the gesture was heading instead of snapping from
          // where the finger stopped - this is the difference between a
          // physical sheet and a threshold check.
          const projected = translateY.value + e.velocityY * SHEET_PROJECTION;
          const { full, peek, collapsed } = stopsShared.value;
          const candidates: { mode: PanelMode; y: number }[] = [
            { mode: 'full', y: full },
            { mode: 'peek', y: peek },
            { mode: 'collapsed', y: collapsed },
          ];
          let best = candidates[0];
          let bestDist = Math.abs(projected - candidates[0].y);
          for (const c of candidates) {
            const d = Math.abs(projected - c.y);
            if (d < bestDist) { bestDist = d; best = c; }
          }

          translateY.value = withSpring(best.y, SPRING.SHEET, (finished) => {
            if (finished) runOnJS(onSettle)(best.mode);
          });
        }),
    [dragStartY, onSettle, translateY],
  );

  const isCollapsed = mode === 'collapsed';

  /**
   * The panel is positioned absolutely at the top of the parent and sized to
   * the FULL stop, then moved down by `translateY`.
   *
   * Note `position: 'absolute'` is required here. Dropping
   * `StyleSheet.absoluteFill` without restoring it left the panel in normal
   * flow, so it rendered as an opaque block at the top of the screen instead
   * of a sheet anchored to the bottom.
   */
  const panelHeight = windowHeight - stops.full;

  return (
    <Animated.View
      style={[
        styles.panelContainer,
        { position: 'absolute', top: 0, left: 0, right: 0, height: panelHeight },
        { transform: [{ translateY }] },
      ]}
      pointerEvents={isCollapsed ? 'box-none' : 'auto'}
    >
      <View style={[StyleSheet.absoluteFill, { backgroundColor: isAmoled ? '#000000' : '#1a1a1a' }]} />
      <LinearGradient
        colors={isAmoled ? ['#0a0a0a', '#000000'] : [panelGradientColors[0], panelGradientColors[1]]}
        style={StyleSheet.absoluteFill}
      />

      {/* Collapsed state must not eat touches outside its own height. */}
      {isCollapsed && (
        <View
          style={[styles.collapsedBlocker, { height: COLLAPSED_HEIGHT + insets.bottom }]}
          pointerEvents="box-only"
        />
      )}

      <GestureDetector gesture={sheetGesture}>
        <Animated.View
          style={[styles.handleArea, handleAreaStyle]}
          accessibilityLabel="Queue. Drag to expand or collapse."
        >
          <View style={[styles.handleBar, { backgroundColor: 'rgba(255,255,255,0.45)' }]} />
          <View style={styles.handleRow}>
            {/* The source is named in PlayingFromSection below; repeating it
                here just crowded the collapsed state. */}
            <Text style={[styles.sourceLabel, { color: 'rgba(255,255,255,0.72)' }]}>
              Queue
            </Text>
            {queue.length > 0 && (
              <Text style={[styles.handleMeta, { color: 'rgba(255,255,255,0.62)' }]}>
                {queue.length} {queue.length === 1 ? 'song' : 'songs'} · {durationStr}
              </Text>
            )}
          </View>
        </Animated.View>
      </GestureDetector>

      <Animated.View
        style={[{ flex: 1 }, contentStyle]}
        pointerEvents={isCollapsed ? 'none' : 'auto'}
      >
        <PlayingFromSection
          queueSource={queueSource}
          queueLength={queue.length}
          clearQueue={handleClearQueue}
          onSave={() => setSaveDialogVisible(true)}
          theme={theme}
          secondaryText="rgba(255,255,255,0.68)"
        />

        <View style={{ flex: 1 }}>
          {!listReady && (
            <View style={styles.loaderContainer} pointerEvents="none">
              <ActivityIndicator size="large" color="#ffffff" />
            </View>
          )}
          <DraggableFlatList
            ref={listRef}
            data={queue}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            onDragEnd={handleDragEnd}
            contentContainerStyle={listContentStyle}
            ListEmptyComponent={renderEmpty}
            showsVerticalScrollIndicator={false}
            /**
             * Virtualisation tuned for a 69dp row.
             *
             * `windowSize` 11 kept ~760dp of rows mounted, which is most of a
             * large queue, so every scroll frame laid out far more cells than
             * were visible. 7 covers the viewport plus a screen of overscan.
             * `initialNumToRender` is low because the list is snapped straight
             * to the current track before it is ever shown, so the rows above
             * it never need to be built; `updateCellsBatchingPeriod` gives the
             * UI thread room between batches while flinging.
             */
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            updateCellsBatchingPeriod={50}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
            getItemLayout={getItemLayout}
            activationDistance={15}
            containerStyle={styles.listContainer}
            ItemSeparatorComponent={ItemSeparator}
          />
        </View>
      </Animated.View>

      <Portal>
        <Dialog
          visible={saveDialogVisible}
          onDismiss={() => setSaveDialogVisible(false)}
          style={{ backgroundColor: theme.colors.surfaceVariant }}
        >
          <Dialog.Title>Save Queue as Playlist</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Playlist Name"
              value={savePlaylistName}
              onChangeText={setSavePlaylistName}
              mode="outlined"
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSaveDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleSavePlaylist} disabled={!savePlaylistName.trim()}>Create</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Animated.View>
  );
}

/**
 * Memoised.
 *
 * Without this, every PlayerScreen re-render (buffering toggles, play/pause,
 * queue mutations) re-rendered this component and its virtualised list, even
 * when nothing the panel displays had changed. `translateY` is a shared value
 * and is intentionally excluded: it is stable by identity and drives the sheet
 * on the UI thread without a React render.
 */
export default React.memo(QueuePanel, (prev, next) =>
  prev.isQueueOpen === next.isQueueOpen &&
  prev.queue === next.queue &&
  prev.currentTrack === next.currentTrack &&
  prev.isPlaying === next.isPlaying &&
  prev.queueSource === next.queueSource &&
  prev.panelGradientColors === next.panelGradientColors &&
  prev.translateY === next.translateY &&
  prev.onQueueOpenChange === next.onQueueOpenChange &&
  prev.reorderQueue === next.reorderQueue &&
  prev.removeFromQueue === next.removeFromQueue &&
  prev.clearQueue === next.clearQueue &&
  prev.playTrack === next.playTrack &&
  prev.onSavePlaylist === next.onSavePlaylist,
);

const styles = StyleSheet.create({
  panelContainer: {
    zIndex: 100,
    borderTopLeftRadius: PANEL_RADIUS,
    borderTopRightRadius: PANEL_RADIUS,
    overflow: 'hidden',
  },
  collapsedBlocker: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
  handleArea: {
    /**
     * `paddingTop` is animated in `handleAreaStyle` rather than set here: the
     * sheet tucks PANEL_RADIUS behind the mini player when open, so the handle
     * needs extra top padding that tracks the drag continuously instead of
     * snapping when the settle completes.
     */
    paddingBottom: 12,
  },
  handleBar: {
    width: 40,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 12,
  },
  handleRow: {
    paddingHorizontal: 20,
  },
  sourceLabel: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  handleMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  listContent: {
    paddingTop: 6,
  },
  listContentEmpty: {
    flex: 1,
  },
  listContainer: {
    flex: 1,
  },
  itemShell: {
    overflow: 'hidden',
    borderRadius: RADIUS.sm,
    marginHorizontal: 8,
  },
  itemOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ITEM_HEIGHT,
    paddingRight: 2,
    borderRadius: RADIUS.sm,
  },
  itemBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dragHandle: {
    width: 44,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  artworkWrapper: {
    position: 'relative',
    marginHorizontal: 10,
  },
  artwork: {
    width: 50,
    height: 50,
    borderRadius: RADIUS.sm,
  },
  artworkFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  equalizerOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.42)',
    borderRadius: RADIUS.sm,
  },
  trackInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  trackName: {
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  trackSubtitle: {
    fontSize: 12.5,
    marginTop: 2,
  },
  deleteActionContainer: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    width: Math.abs(SWIPE_REVEAL),
    borderRadius: RADIUS.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteActionButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  deleteActionText: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  playingFromSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  playingFromLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    fontWeight: '600',
  },
  sourceName: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 3,
    letterSpacing: -0.2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 5,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  emptyTitle: {
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 8,
  },
});
