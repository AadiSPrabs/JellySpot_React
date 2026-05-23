import React, { useRef, useEffect, useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, StatusBar, Alert, InteractionManager, Animated, PanResponder, LayoutAnimation } from 'react-native';
import { Image } from 'expo-image';
import { Text, useTheme, IconButton } from 'react-native-paper';
import { usePlayerStore } from '../store/playerStore';
import { useShallow } from 'zustand/react/shallow';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EqualizerAnimation } from '../components/EqualizerAnimation';

const ITEM_HEIGHT = 68;
const ITEM_SEPARATOR = 1;
const SWIPE_THRESHOLD = -50;
const SWIPE_REVEAL = -80;

interface QueueItemData {
  id: string;
  queueItemId?: string;
  name: string;
  artist: string;
  album?: string;
  imageUrl?: string;
  durationMillis?: number;
}

// --- Swipe-to-delete Queue Item ---
const QueueItem = React.memo(({
  item,
  index,
  drag,
  isActive,
  isCurrent,
  onPress,
  onRemove,
  isDragging,
}: {
  item: QueueItemData;
  index: number;
  drag: () => void;
  isActive: boolean;
  isCurrent: boolean;
  onPress: (item: any) => void | Promise<void>;
  onRemove: (id: string) => void;
  isDragging: boolean;
}) => {
  const theme = useTheme();

  const swipeAnim = useRef(new Animated.Value(0)).current;
  const exitAnim = useRef(new Animated.Value(1)).current;
  const isSwipedOpen = useRef(false);

  const isDraggingRef = useRef(false);
  isDraggingRef.current = isDragging;
  const isActiveRef = useRef(false);
  isActiveRef.current = isActive;
  const onRemoveRef = useRef(onRemove);
  onRemoveRef.current = onRemove;
  const itemIdRef = useRef(item.queueItemId || item.id);
  itemIdRef.current = item.queueItemId || item.id;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => {
        if (isDraggingRef.current || isActiveRef.current) return false;
        return Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.2;
      },
      onPanResponderGrant: () => {},
      onPanResponderMove: (_, gs) => {
        let val: number;
        if (isSwipedOpen.current) {
          val = Math.max(SWIPE_REVEAL, Math.min(0, SWIPE_REVEAL + gs.dx));
        } else {
          val = Math.max(SWIPE_REVEAL, Math.min(0, gs.dx));
        }
        swipeAnim.setValue(val);
      },
      onPanResponderRelease: (_, gs) => {
        if (isSwipedOpen.current) {
          if (gs.dx > 30) {
            Animated.spring(swipeAnim, {
              toValue: 0,
              useNativeDriver: true,
              tension: 100,
              friction: 10,
            }).start();
            isSwipedOpen.current = false;
          } else {
            Animated.spring(swipeAnim, {
              toValue: SWIPE_REVEAL,
              useNativeDriver: true,
              tension: 80,
              friction: 12,
            }).start();
          }
        } else {
          if (gs.dx < SWIPE_THRESHOLD) {
            Animated.spring(swipeAnim, {
              toValue: SWIPE_REVEAL,
              useNativeDriver: true,
              tension: 80,
              friction: 12,
            }).start();
            isSwipedOpen.current = true;
          } else {
            Animated.spring(swipeAnim, {
              toValue: 0,
              useNativeDriver: true,
              tension: 100,
              friction: 10,
            }).start();
          }
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(swipeAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }).start();
        isSwipedOpen.current = false;
      },
    })
  ).current;

  const handleDelete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Animated.parallel([
      Animated.timing(swipeAnim, {
        toValue: -500,
        duration: 280,
        useNativeDriver: true,
      }),
      Animated.timing(exitAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onRemoveRef.current(itemIdRef.current);
    });
  }, [swipeAnim, exitAnim]);

  const durationStr = item.durationMillis
    ? `${Math.floor(item.durationMillis / 60000)}:${Math.floor((item.durationMillis % 60000) / 1000).toString().padStart(2, '0')}`
    : null;

  return (
    <View style={{ overflow: 'hidden', borderRadius: 8, marginHorizontal: 4 }}>
      <View style={[styles.deleteActionContainer, { backgroundColor: theme.colors.error }]}>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteActionButton} activeOpacity={0.7}>
          <Icon name="trash-can-outline" size={22} color="#fff" />
          <Text style={styles.deleteActionText}>Remove</Text>
        </TouchableOpacity>
      </View>

      <Animated.View
        style={[
          styles.itemOuter,
          { backgroundColor: isActive ? theme.colors.elevation.level2 : theme.colors.background },
          {
            transform: [
              { translateX: swipeAnim },
              { scale: exitAnim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
            ],
            opacity: exitAnim,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.dragHandle}
          onLongPress={() => {
            if (isSwipedOpen.current) {
              isSwipedOpen.current = false;
              Animated.spring(swipeAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 100,
                friction: 10,
              }).start();
            }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            drag();
          }}
          delayLongPress={100}
          activeOpacity={0.5}
        >
          <Icon name="drag" size={22} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>

        {!isCurrent && (
          <View style={styles.indexBadge}>
            <Text style={[styles.indexText, { color: theme.colors.onSurfaceVariant }]}>
              {index + 1}
            </Text>
          </View>
        )}

        <View style={styles.artworkWrapper}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.artwork} />
          ) : (
            <View style={[styles.artwork, styles.artworkFallback, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Icon name="music-note" size={20} color={theme.colors.onSurfaceVariant} />
            </View>
          )}
          {isCurrent && (
            <View style={styles.equalizerOverlay}>
              <EqualizerAnimation color={theme.colors.primary} size={18} isPlaying={true} />
            </View>
          )}
        </View>

        <TouchableOpacity
          style={styles.trackInfo}
          onPress={() => onPress(item)}
          activeOpacity={0.7}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.trackName,
              { color: isCurrent ? theme.colors.primary : theme.colors.onSurface },
            ]}
          >
            {item.name}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.trackSubtitle, { color: theme.colors.onSurfaceVariant }]}
          >
            {item.artist}
            {item.album ? ` · ${item.album}` : ''}
          </Text>
        </TouchableOpacity>

        {durationStr && (
          <Text style={[styles.duration, { color: theme.colors.onSurfaceVariant }]}>
            {durationStr}
          </Text>
        )}
      </Animated.View>
    </View>
  );
}, (prev, next) => (
  prev.item.queueItemId === next.item.queueItemId &&
  prev.item.id === next.item.id &&
  prev.item.name === next.item.name &&
  prev.item.artist === next.item.artist &&
  prev.isActive === next.isActive &&
  prev.isCurrent === next.isCurrent &&
  prev.isDragging === next.isDragging &&
  prev.index === next.index
));

// --- Section Header ---
const SectionHeader = React.memo(({ label, count }: { label: string; count: number }) => {
  const theme = useTheme();
  return (
    <View style={[styles.sectionHeader, { borderBottomColor: theme.colors.outlineVariant }]}>
      <Text variant="titleSmall" style={[styles.sectionHeaderText, { color: theme.colors.onSurface }]}>
        {label}
      </Text>
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {count}
      </Text>
    </View>
  );
});

// --- Empty State ---
const EmptyState = React.memo(({ theme }: { theme: any }) => (
  <View style={styles.emptyState}>
    <Icon name="playlist-music-outline" size={64} color={theme.colors.onSurfaceVariant} />
    <Text variant="titleMedium" style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>
      Your queue is empty
    </Text>
    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
      Songs you play will appear here
    </Text>
  </View>
));

// --- Now Playing Card (fixed, no stats) ---
const NowPlayingCard = React.memo(({
  currentTrack,
  onPress,
}: {
  currentTrack: QueueItemData | null;
  onPress: () => void;
}) => {
  const theme = useTheme();
  if (!currentTrack) return null;

  return (
    <TouchableOpacity
      style={[styles.nowPlayingCard, { backgroundColor: theme.colors.elevation.level1 }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.nowPlayingArtwork}>
        {currentTrack.imageUrl ? (
          <Image source={{ uri: currentTrack.imageUrl }} style={styles.nowPlayingImage} />
        ) : (
          <View style={[styles.nowPlayingImage, styles.artworkFallback, { backgroundColor: theme.colors.surfaceVariant }]}>
            <Icon name="music-note" size={24} color={theme.colors.onSurfaceVariant} />
          </View>
        )}
      </View>
      <View style={styles.nowPlayingInfo}>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 1 }}>
          NOW PLAYING
        </Text>
        <Text variant="titleMedium" numberOfLines={1} style={[styles.nowPlayingTitle, { color: theme.colors.primary }]}>
          {currentTrack.name}
        </Text>
        <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
          {currentTrack.artist}
        </Text>
      </View>
      <View style={styles.nowPlayingMeta}>
        <EqualizerAnimation color={theme.colors.primary} size={16} isPlaying={true} />
      </View>
    </TouchableOpacity>
  );
});

// --- Stats row (separate line below the card) ---
const QueueStats = React.memo(({
  trackCount,
  totalDuration,
}: {
  trackCount: number;
  totalDuration: string;
}) => {
  const theme = useTheme();
  return (
    <View style={[styles.statsRow, { borderBottomColor: theme.colors.outlineVariant }]}>
      <Icon name="clock-outline" size={14} color={theme.colors.onSurfaceVariant} />
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
        {trackCount} {trackCount === 1 ? 'song' : 'songs'}
      </Text>
      {totalDuration && (
        <>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginHorizontal: 6 }}>
            ·
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {totalDuration}
          </Text>
        </>
      )}
    </View>
  );
});

const ITEM_HEIGHT_WITH_SEP = ITEM_HEIGHT + ITEM_SEPARATOR;

// --- Main Screen ---
export default function QueueScreen() {
  const theme = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const listRef = useRef<any>(null);
  const hasScrolledRef = useRef(false);

  const { queue, currentTrack, reorderQueue, clearQueue, removeFromQueue } = usePlayerStore(useShallow(state => ({
    queue: state.queue,
    currentTrack: state.currentTrack,
    reorderQueue: state.reorderQueue,
    clearQueue: state.clearQueue,
    removeFromQueue: state.removeFromQueue,
  })));

  const playTrack = usePlayerStore.getState().playTrack;

  const handleRemoveFromQueue = useCallback((id: string) => {
    LayoutAnimation.configureNext({
      duration: 300,
      update: { type: 'easeInEaseOut', springDamping: 0.7 },
      delete: { type: 'easeInEaseOut', duration: 250 },
    });
    removeFromQueue(id);
  }, [removeFromQueue]);

  const [listReady, setListReady] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Scroll to current track on mount
  useEffect(() => {
    if (hasScrolledRef.current || !currentTrack || queue.length === 0) {
      setListReady(true);
      return;
    }
    const currentIndex = queue.findIndex(
      t => (t.queueItemId || t.id) === (currentTrack.queueItemId || currentTrack.id)
    );
    if (currentIndex < 0) {
      setListReady(true);
      return;
    }

    const task = InteractionManager.runAfterInteractions(() => {
      try {
        listRef.current?.scrollToIndex({
          index: currentIndex,
          animated: false,
          viewPosition: 0.1,
        });
      } catch (_) { /* fallback */ }
      setListReady(true);
      hasScrolledRef.current = true;
    });
    return () => task.cancel();
  }, [currentTrack?.queueItemId, currentTrack?.id, queue.length]);

  const currentTrackId = currentTrack?.id;
  const nextUpCount = currentTrack ? Math.max(0, queue.length - 1) : queue.length;

  // Stats calculation
  const totalMs = queue.reduce((acc, t) => acc + (t.durationMillis || 0), 0);
  const hours = Math.floor(totalMs / 3600000);
  const mins = Math.floor((totalMs % 3600000) / 60000);
  const durationStr = hours > 0 ? `${hours}h ${mins}m` : `${mins} min`;

  const renderItem = useCallback(({ item, drag, isActive }: RenderItemParams<any>) => {
    const idx = queue.findIndex(
      t => (t.queueItemId || t.id) === (item.queueItemId || item.id)
    );
    return (
      <QueueItem
        item={item}
        index={idx}
        drag={drag}
        isActive={isActive}
        isCurrent={item.id === currentTrackId}
        onPress={playTrack}
        onRemove={handleRemoveFromQueue}
        isDragging={isDragging}
      />
    );
  }, [currentTrackId, playTrack, handleRemoveFromQueue, isDragging, queue]);

  const handleDragEnd = useCallback(({ from, to }: { from: number; to: number }) => {
    if (from === to) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    reorderQueue(from, to);
  }, [reorderQueue]);

  const keyExtractor = useCallback(
    (item: any, index: number) => item.queueItemId || `queue-${index}-${item.id}`,
    []
  );

  const handleClearQueue = useCallback(() => {
    Alert.alert(
      'Clear Queue',
      'Are you sure you want to clear the queue? Only the current song will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            clearQueue();
          },
        },
      ]
    );
  }, [clearQueue]);

  const renderEmpty = useCallback(() => (
    <EmptyState theme={theme} />
  ), [theme]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle="light-content" />

      {/* Header — always visible */}
      <View style={styles.header}>
        <IconButton
          icon="chevron-left"
          size={28}
          onPress={() => navigation.goBack()}
        />
        <View style={styles.headerTitleContainer}>
          <Text variant="titleLarge" style={styles.headerTitle}>Queue</Text>
        </View>
        {queue.length > 1 && (
          <TouchableOpacity onPress={handleClearQueue} style={styles.clearButton}>
            <Icon name="delete-sweep-outline" size={22} color={theme.colors.error} />
          </TouchableOpacity>
        )}
      </View>

      {/* Now Playing Card + Stats — always visible when tracks exist */}
      {currentTrack && (
        <View>
          <NowPlayingCard
            currentTrack={currentTrack as QueueItemData}
            onPress={() => navigation.goBack()}
          />
          <QueueStats trackCount={queue.length} totalDuration={durationStr} />
        </View>
      )}

      {/* Scrollable list area */}
      <View style={{ flex: 1 }}>
        {!listReady && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        )}

        {nextUpCount > 0 && (
          <SectionHeader label="Next Up" count={nextUpCount} />
        )}

        <DraggableFlatList
          ref={listRef}
          data={queue}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          onDragBegin={() => setIsDragging(true)}
          onDragEnd={(params) => {
            setIsDragging(false);
            handleDragEnd(params);
          }}
          contentContainerStyle={[
            styles.listContent,
            { opacity: listReady ? 1 : 0 },
            queue.length === 0 && { flex: 1 },
          ]}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={true}
          initialNumToRender={15}
          maxToRenderPerBatch={10}
          windowSize={11}
          removeClippedSubviews={Platform.OS === 'android'}
          getItemLayout={(_data, index) => ({
            length: ITEM_HEIGHT_WITH_SEP,
            offset: ITEM_HEIGHT_WITH_SEP * index,
            index,
          })}
          activationDistance={15}
          containerStyle={{ flex: 1 }}
          ItemSeparatorComponent={() => <View style={{ height: ITEM_SEPARATOR }} />}
        />
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    height: 56,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: 8,
  },
  headerTitle: {
    fontWeight: 'bold',
  },
  clearButton: {
    padding: 8,
    marginRight: 4,
  },
  // Loader
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  // List
  listContent: {
    paddingBottom: 100,
  },
  // Section Header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 4,
    marginHorizontal: 4,
    borderBottomWidth: 0.5,
  },
  sectionHeaderText: {
    fontWeight: '600',
  },
  // Track Item
  itemOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ITEM_HEIGHT,
    paddingRight: 4,
  },
  dragHandle: {
    width: 36,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  indexBadge: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    fontSize: 13,
    fontWeight: '500',
  },
  artworkWrapper: {
    position: 'relative',
    marginHorizontal: 8,
  },
  artwork: {
    width: 44,
    height: 44,
    borderRadius: 6,
  },
  artworkFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  equalizerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 6,
  },
  trackInfo: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  trackName: {
    fontSize: 14,
    fontWeight: '600',
  },
  trackSubtitle: {
    fontSize: 12,
    marginTop: 2,
    opacity: 0.7,
  },
  duration: {
    fontSize: 12,
    marginRight: 12,
    opacity: 0.6,
    minWidth: 36,
    textAlign: 'right',
  },
  // Swipe-to-delete
  deleteActionContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: Math.abs(SWIPE_REVEAL),
    borderRadius: 8,
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
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  // Now Playing Card
  nowPlayingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginTop: 4,
    padding: 12,
    borderRadius: 14,
  },
  nowPlayingArtwork: {
    marginRight: 12,
  },
  nowPlayingImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
  },
  nowPlayingInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  nowPlayingTitle: {
    fontWeight: 'bold',
    marginVertical: 2,
  },
  nowPlayingMeta: {
    alignItems: 'center',
    marginLeft: 8,
  },
  // Stats row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginHorizontal: 12,
    borderBottomWidth: 0.5,
  },
  // Bottom Bar
  // Empty State
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 80,
  },
  emptyTitle: {
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
});
