import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, Keyboard, FlatList, ListRenderItemInfo } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Text, useTheme, Portal, Button, IconButton, List, TextInput } from 'react-native-paper';
import { jellyfinApi } from '../api/jellyfin';
import { usePlayerStore } from '../store/playerStore';
import { usePlaybackSettingsStore } from '../store/playbackSettingsStore';
import { useSettingsStore } from '../store/settingsStore';
import ActionSheet from './ActionSheet';
import ScrollMeter from './ScrollMeter';
import { lyricsService } from '../services/LyricsService';
import { fetchJson } from '../services/http';
import { useShallow } from 'zustand/react/shallow';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  Extrapolate,
  Easing,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

/**
 * How far the translate / options buttons slide outward when the player
 * chrome hides. Larger than the icon (20dp) so the travel is still readable
 * once the fade has taken most of the opacity.
 */
const ACTION_BUTTON_SLIDE = 48;

interface LyricsViewProps {
  itemId: string;
  activeColor?: string;
  inactiveColor?: string;
  localLyrics?: string;
  /**
   * True while the player chrome is hidden in immersive lyrics mode.
   *
   * The translate and options buttons are positioned inside this component,
   * so they cannot be reached by the parent's chrome animation and are faded
   * out here instead.
   */
  chromeHidden?: boolean;
}

interface LyricLine {
  time: number; // milliseconds (-1 for unsynced)
  text: string;
  translation?: string;
}

// Animated Lyric Line Component for smooth transitions
const LYRIC_ITEM_HEIGHT = 130;

const AnimatedLyricLine = React.memo(
  ({
    item,
    isActive,
    activeColor,
    inactiveColor,
    onPress,
    scrollY,
    index,
    containerHeight,
  }: {
    item: LyricLine;
    isActive: boolean;
    activeColor: string;
    inactiveColor: string;
    onPress: () => void;
    scrollY: SharedValue<number>;
    index: number;
    containerHeight: number;
  }) => {
    const progress = useSharedValue(isActive ? 1 : 0);

    useEffect(() => {
      progress.value = withTiming(isActive ? 1 : 0, { duration: 400 });
    }, [isActive]);

    const animatedStyle = useAnimatedStyle(() => {
      // Correct position calculation:
      // The list starts with a header of height: (containerHeight / 2) - (LYRIC_ITEM_HEIGHT / 2)
      const headerHeight = Math.max(
        0,
        containerHeight / 2 - LYRIC_ITEM_HEIGHT / 2,
      );
      const itemPosInList = index * LYRIC_ITEM_HEIGHT + headerHeight;
      const itemPosOnScreen = itemPosInList - scrollY.value;

      // Fade out at edges (relative to container height)
      const edgeFade = interpolate(
        itemPosOnScreen,
        [
          0,
          LYRIC_ITEM_HEIGHT,
          containerHeight - LYRIC_ITEM_HEIGHT,
          containerHeight,
        ],
        [0, 1, 1, 0],
        Extrapolate.CLAMP,
      );

      return {
        opacity: interpolate(progress.value, [0, 1], [0.6, 1]) * edgeFade,
        transform: [
          { scale: interpolate(progress.value, [0, 1], [0.92, 1.05]) },
        ],
      };
    });

    const animatedTextStyle = useAnimatedStyle(() => {
      return {
        color: interpolateColor(
          progress.value,
          [0, 1],
          [inactiveColor, activeColor],
        ),
      };
    });

    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={item.time === -1}
        activeOpacity={0.7}
        style={{ height: LYRIC_ITEM_HEIGHT, justifyContent: "center" }}
      >
        <Animated.View style={[styles.line, animatedStyle]}>
          <Animated.Text
            style={[
              animatedTextStyle,
              {
                fontSize: 24,
                fontWeight: "bold",
                textAlign: "center",
                lineHeight: 30,
              },
            ]}
            numberOfLines={2}
          >
            {item.text}
          </Animated.Text>
          {!!item.translation && (
            <Text
              variant="bodyMedium"
              style={{
                color: isActive ? activeColor : inactiveColor,
                textAlign: "center",
                opacity: isActive ? 0.8 : 0.4,
                marginTop: 2,
                fontStyle: "italic",
              }}
            >
              {item.translation}
            </Text>
          )}
        </Animated.View>
      </TouchableOpacity>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.isActive === nextProps.isActive &&
      prevProps.activeColor === nextProps.activeColor &&
      prevProps.inactiveColor === nextProps.inactiveColor &&
      prevProps.containerHeight === nextProps.containerHeight &&
      prevProps.item.text === nextProps.item.text &&
      prevProps.item.translation === nextProps.item.translation &&
      prevProps.scrollY === nextProps.scrollY // Shared values have stable references
    );
  },
);

export default function LyricsView({ itemId, activeColor, inactiveColor, localLyrics, chromeHidden = false }: LyricsViewProps) {
    const { positionMillis, currentTrack, seek } = usePlayerStore(useShallow(state => ({
        positionMillis: state.positionMillis,
        currentTrack: state.currentTrack,
        seek: state.seek,
    })));
    const { lyricsOffsets, setLyricsOffset, translationLanguages, setTranslationLanguage } = usePlaybackSettingsStore();
    const currentOffset = lyricsOffsets[itemId] || 0;
    const currentTranslationLanguage = translationLanguages[itemId] || 'none';

  const theme = useTheme();
  const activeTextColor = activeColor || theme.colors.primary;
  /**
   * 0.62 rather than 0.5. At 0.5 this composited to #8C8C8C on the dark
   * background - 4.38:1, just under the 4.5:1 WCAG AA floor. A dimmer inactive
   * line is the right hierarchy, but it has to stay readable to be useful.
   */
  const inactiveTextColor = inactiveColor || "rgba(255,255,255,0.62)";

  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSource, setCurrentSource] = useState<
    "jellyfin" | "lrclib" | null
  >(null);
  const [showOffsetDialog, setShowOffsetDialog] = useState(false);
  const [showTranslateDialog, setShowTranslateDialog] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showSearchDialog, setShowSearchDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [sourceOverride, setSourceOverride] = useState<'jellyfin' | 'lrclib' | null>(null);
  const lyricsSourcePreference = useSettingsStore((state) => state.lyricsSourcePreference);

  const [tempOffset, setTempOffset] = useState(currentOffset);
  const flatListRef = useRef<FlatList<LyricLine>>(null);
  const lastActiveIndexRef = useRef<number>(-1);
  const isUserScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const scrollY = useSharedValue(0);
  const [containerHeight, setContainerHeight] = useState(600);

  /**
   * Fade for the two action buttons as the player chrome hides.
   *
   * They are absolutely positioned at opposite bottom corners - `translate`
   * on the left, `dots-horizontal` on the right - so each slides toward its
   * own edge rather than both drifting the same way.
   *
   * The square root front-loads the travel. On a linear ramp the icon covers
   * most of its distance while already faint, which reads as a blink instead
   * of movement: measured, at 75% opacity a linear ramp had moved only 7dp
   * against 28dp on this curve.
   */
  const buttonFade = useSharedValue(chromeHidden ? 1 : 0);
  useEffect(() => {
    buttonFade.value = withTiming(chromeHidden ? 1 : 0, {
      duration: 320,
      easing: Easing.out(Easing.cubic),
    });
  }, [chromeHidden, buttonFade]);

  const translateButtonStyle = useAnimatedStyle(() => ({
    opacity: 1 - buttonFade.value,
    transform: [
      { translateX: -Math.sqrt(buttonFade.value) * ACTION_BUTTON_SLIDE },
      { translateY: Math.sqrt(buttonFade.value) * ACTION_BUTTON_SLIDE * 0.35 },
    ],
  }));

  const optionsButtonStyle = useAnimatedStyle(() => ({
    opacity: 1 - buttonFade.value,
    transform: [
      { translateX: Math.sqrt(buttonFade.value) * ACTION_BUTTON_SLIDE },
      { translateY: Math.sqrt(buttonFade.value) * ACTION_BUTTON_SLIDE * 0.35 },
    ],
  }));

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Auto-scroll logic with "pause on manual scroll"
  const handleScrollBeginDrag = () => {
    isUserScrollingRef.current = true;
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
  };

  const handleScrollEndDrag = () => {
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = setTimeout(() => {
      isUserScrollingRef.current = false;
    }, 3000); // Wait 3 seconds before resuming auto-scroll
  };

  // Parse LRC format lyrics
  const parseLRC = (lrcString: string): LyricLine[] => {
    const lines = lrcString.split("\n");
    const result: LyricLine[] = [];
    const timeRegExp = /\[(\d{1,3}):(\d{2})[\.:](\d{2,3})\]/;

    lines.forEach((line) => {
      const match = timeRegExp.exec(line);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const milliseconds =
          parseInt(match[3], 10) * (match[3].length === 2 ? 10 : 1);
        const time = minutes * 60 * 1000 + seconds * 1000 + milliseconds;
        const text = line.replace(timeRegExp, "").trim();
        if (text) result.push({ time, text });
      }
    });

    if (result.length === 0 && lrcString.trim().length > 0) {
      return lrcString
        .split("\n")
        .map((text) => ({
          time: -1,
          text: text.trim(),
        }))
        .filter((l) => l.text);
    }

    return result;
  };

  // Fetch/Parse Lyrics
  useEffect(() => {
    let isMounted = true;

    if (localLyrics) {
      const parsedLyrics = parseLRC(localLyrics);
      if (isMounted) {
        setLyrics(parsedLyrics);
        setCurrentSource(null);
        setError(parsedLyrics.length === 0 ? "No lyrics found" : null);
        setLoading(false);
      }
      return;
    }

    const fetchLyrics = async () => {
      if (!currentTrack || currentTrack.id !== itemId) {
        if (isMounted) {
          setLyrics([]);
          setError(null);
        }
        return;
      }

      try {
        if (isMounted) setLoading(true);
        const response = await lyricsService.getLyrics(currentTrack, sourceOverride || undefined);

        if (isMounted) {
          if (response.type === "none" || !response.lyrics) {
            setLyrics([]);
            setError("No lyrics found");
          } else {
            let parsedLyrics: LyricLine[] = [];
            if (response.type === "plain") {
              parsedLyrics = response.lyrics
                .split("\n")
                .map((text) => ({
                  time: -1,
                  text: text.trim(),
                }))
                .filter((l) => l.text);
            } else if (response.type === "synced") {
              parsedLyrics = parseLRC(response.lyrics);
            }

            if (
              parsedLyrics.length > 0 &&
              currentTranslationLanguage !== "none"
            ) {
              try {
                parsedLyrics = await lyricsService.translateLyrics(
                  currentTrack.id,
                  parsedLyrics,
                  currentTranslationLanguage,
                );
              } catch (err) {
                console.error("Failed to apply lyrics translation:", err);
              }
            }

            if (isMounted) {
              setLyrics(parsedLyrics);
              setCurrentSource(response.source);
              setError(parsedLyrics.length === 0 ? "No lyrics found" : null);
            }
          }
        }
      } catch (err) {
        if (isMounted) setError("Failed to load lyrics");
        console.warn("Lyrics fetch failed", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchLyrics();
    return () => {
      isMounted = false;
    };
  }, [
    itemId,
    currentTrack,
    localLyrics,
    currentTranslationLanguage,
    refreshTrigger,
    sourceOverride,
  ]);

  // Reset source override when track changes
  useEffect(() => {
    setSourceOverride(null);
  }, [itemId]);

  // Track active index and handle haptics + auto-scroll
  useEffect(() => {
    if (!lyrics.length) return;

    const adjustedTime = positionMillis + currentOffset + 500;
    const activeIndex = lyrics.findIndex((line, index) => {
      const nextLine = lyrics[index + 1];
      return (
        adjustedTime >= line.time && (!nextLine || adjustedTime < nextLine.time)
      );
    });

    if (activeIndex !== -1 && activeIndex !== lastActiveIndexRef.current) {
      lastActiveIndexRef.current = activeIndex;

      // Haptic feedback on line change
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Auto-scroll only if user isn't actively manual scrolling
      if (!isUserScrollingRef.current) {
        flatListRef.current?.scrollToIndex({
          index: activeIndex,
          animated: true,
          viewPosition: 0.5,
        });
      }
    }
  }, [positionMillis, lyrics, currentOffset]);

  const handleSearchLyrics = async () => {
    if (!searchQuery.trim()) return;
    Keyboard.dismiss();
    setIsSearching(true);
    setSearchError(null);
    try {
      // fetchJson retries transient failures and never throws on an
      // unparseable body (LRCLIB returns HTML for 5xx), so a server hiccup
      // surfaces as an error message instead of a JSON SyntaxError.
      const result = await fetchJson<any[]>(
        `https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`,
        { timeoutMs: 8000, retries: 2 },
      );

      if (!result.ok) {
        /**
         * Distinguish "the service is struggling" from "this device cannot
         * reach the service". The old copy said "busy" for every failure,
         * including a device with no public internet - which sent the user
         * looking at LRCLIB when the problem was local connectivity.
         */
        const isConnectionProblem =
          /network|failed to fetch|unreachable|dns|offline/i.test(result.error ?? '');
        setSearchError(
          result.transient
            ? 'Lyrics service is busy. Please try again in a moment.'
            : isConnectionProblem
              ? 'Could not reach the lyrics service. Check your internet connection.'
              : 'Could not reach the lyrics service.',
        );
        setSearchResults([]);
        return;
      }

      // A 503 overload body is a JSON object, not an array.
      const data = Array.isArray(result.data) ? result.data : [];
      setSearchResults(data);
      if (data.length === 0) {
        setSearchError('No lyrics found for that search.');
      }
    } catch (e) {
      console.error("Lyrics search failed", e);
      setSearchError('Something went wrong searching for lyrics.');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSearchResult = async (result: any) => {
    const lyricsToSave = result.syncedLyrics || result.plainLyrics;
    if (!lyricsToSave || !currentTrack) return;
    await lyricsService.saveOfflineLyrics(currentTrack.id, lyricsToSave);
    setShowSearchDialog(false);
    setRefreshTrigger((prev) => prev + 1);
  };

  const handleLinePress = (item: LyricLine) => {
    if (item.time !== -1) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      seek(item.time - currentOffset);
      // After manual jump, resume auto-scroll
      isUserScrollingRef.current = false;
    }
  };

  const renderItem = ({ item, index }: ListRenderItemInfo<LyricLine>) => {
    const adjustedTime = positionMillis + currentOffset + 500;
    const nextLine = lyrics[index + 1];
    const isActive =
      item.time !== -1 &&
      adjustedTime >= item.time &&
      (!nextLine || adjustedTime < nextLine.time);

    return (
      <AnimatedLyricLine
        item={item}
        isActive={isActive}
        activeColor={activeTextColor}
        inactiveColor={inactiveTextColor}
        onPress={() => handleLinePress(item)}
        scrollY={scrollY}
        index={index}
        containerHeight={containerHeight}
      />
    );
  };

  const renderContent = () => {
    if (loading) {
      return (
        <View style={[styles.center, { flex: 1 }]}>
          <ActivityIndicator size="small" color={activeTextColor} />
        </View>
      );
    }

    if (error || lyrics.length === 0) {
      return (
        <View style={[styles.center, { flex: 1 }]}>
          <Text style={{ color: inactiveTextColor }}>
            {error || "No lyrics found"}
          </Text>
        </View>
      );
    }

    return (
      <Animated.FlatList
        /**
         * No key that depends on `containerHeight`.
         *
         * This list used to be keyed on the measured height
         * (`lyrics-list-${containerHeight}`), so any resize tore down and
         * rebuilt the whole FlatList. When the player chrome collapsed or
         * returned, the lyrics container changed height, the key changed, and
         * the list remounted - losing its scroll offset and visibly snapping
         * back to the top before scrolling down to the active line again.
         *
         * The height is already handled reactively: the header/footer spacers
         * and getItemLayout both read `containerHeight`, so the list re-lays
         * out correctly without being remounted.
         */
        ref={flatListRef as any}
        data={lyrics}
        renderItem={renderItem}
        keyExtractor={(_, index) => `${index}`}
        contentContainerStyle={[styles.listContent, { paddingVertical: 0 }]}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={handleScrollBeginDrag}
        onScrollEndDrag={handleScrollEndDrag}
        onMomentumScrollEnd={handleScrollEndDrag}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        ListHeaderComponent={
          <View
            style={{
              height: Math.max(0, containerHeight / 2 - LYRIC_ITEM_HEIGHT / 2),
            }}
          />
        }
        ListFooterComponent={
          <View
            style={{
              height: Math.max(0, containerHeight / 2 - LYRIC_ITEM_HEIGHT / 2),
            }}
          />
        }
        getItemLayout={(_, index) => {
          const headerHeight = Math.max(
            0,
            containerHeight / 2 - LYRIC_ITEM_HEIGHT / 2,
          );
          return {
            length: LYRIC_ITEM_HEIGHT,
            offset: headerHeight + LYRIC_ITEM_HEIGHT * index,
            index,
          };
        }}
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={10}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({
              index: info.index,
              animated: true,
              viewPosition: 0.5,
            });
          }, 100);
        }}
      />
    );
  };

  return (
    <View
      style={styles.container}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      {renderContent()}

      {/* Action Buttons */}
      <Animated.View
        style={[styles.settingsButton, optionsButtonStyle]}
        pointerEvents={chromeHidden ? 'none' : 'auto'}
      >
        <TouchableOpacity
          onPress={() => setShowSettingsMenu(true)}
          accessibilityLabel="Lyrics options"
        >
          <IconButton
            icon="dots-horizontal"
            size={20}
            iconColor={activeTextColor}
            style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
          />
        </TouchableOpacity>
      </Animated.View>

      <Animated.View
        style={[styles.translateButton, translateButtonStyle]}
        pointerEvents={chromeHidden ? 'none' : 'auto'}
      >
        <TouchableOpacity
          onPress={() => setShowTranslateDialog(true)}
          accessibilityLabel="Translate lyrics"
        >
          <IconButton
            icon="translate"
            size={20}
            iconColor={activeTextColor}
            style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
          />
        </TouchableOpacity>
      </Animated.View>

      {/* Dialogs & Menus */}
      <ActionSheet
        visible={showTranslateDialog}
        onClose={() => setShowTranslateDialog(false)}
        title="Translate Lyrics"
        scrollable
        heightPercentage={50}
      >
        <View style={{ gap: 4 }}>
          {[
            { code: "none", label: "Off" },
            { code: "en", label: "English" },
            { code: "es", label: "Spanish" },
            { code: "fr", label: "French" },
            { code: "de", label: "German" },
            { code: "pt", label: "Portuguese" },
            { code: "it", label: "Italian" },
            { code: "ja", label: "Japanese" },
            { code: "ko", label: "Korean" },
            { code: "rm", label: "Romanized" },
          ].map((lang) => (
            <List.Item
              key={lang.code}
              title={lang.label}
              onPress={() => {
                setTranslationLanguage(itemId, lang.code);
                setShowTranslateDialog(false);
              }}
              right={(props) =>
                currentTranslationLanguage === lang.code ? (
                  <List.Icon
                    {...props}
                    icon="check"
                    color={theme.colors.primary}
                  />
                ) : null
              }
            />
          ))}
        </View>
      </ActionSheet>

      <ActionSheet
        visible={showSettingsMenu}
        onClose={() => setShowSettingsMenu(false)}
        title="Lyrics Options"
      >
        <View style={{ paddingBottom: 16 }}>
          <List.Item
            title="Search Lyrics"
            description="Manually find lyrics for this track"
            left={(props) => <List.Icon {...props} icon="magnify" />}
            onPress={() => {
              setShowSettingsMenu(false);
              setSearchQuery(
                `${currentTrack?.name || ""} ${currentTrack?.artist || ""}`.trim(),
              );
              setShowSearchDialog(true);
            }}
          />
          <List.Item
            title="Lyrics Source"
            description={`Currently using: ${sourceOverride === 'jellyfin' ? 'Jellyfin' : sourceOverride === 'lrclib' ? 'LRCLib' : (lyricsSourcePreference === 'jellyfin' ? 'Jellyfin' : 'LRCLib')}`}
            left={(props) => <List.Icon {...props} icon="swap-horizontal" />}
            onPress={() => {
              setShowSettingsMenu(false);
              setSourceOverride((prev) => {
                if (prev === 'jellyfin') return 'lrclib';
                if (prev === 'lrclib') return 'jellyfin';
                // If null, toggle to the opposite of the default preference
                return lyricsSourcePreference === 'jellyfin' ? 'lrclib' : 'jellyfin';
              });
              setRefreshTrigger((prev) => prev + 1);
            }}
          />
          {currentSource === "lrclib" && (
            <List.Item
              title="Switch to Jellyfin Lyrics"
              description="Use lyrics from your Jellyfin server"
              left={(props) => <List.Icon {...props} icon="server" />}
              onPress={async () => {
                setShowSettingsMenu(false);
                if (currentTrack) {
                  await lyricsService.deleteOfflineLyrics(currentTrack.id);
                  setRefreshTrigger((prev) => prev + 1);
                }
              }}
            />
          )}
          <List.Item
            title="Adjust Timing"
            description="Sync lyrics if they are slightly off"
            left={(props) => <List.Icon {...props} icon="tune-vertical" />}
            onPress={() => {
              setShowSettingsMenu(false);
              setTempOffset(currentOffset);
              setShowOffsetDialog(true);
            }}
          />
        </View>
      </ActionSheet>

      <ActionSheet
        visible={showSearchDialog}
        onClose={() => setShowSearchDialog(false)}
        title="Search Lyrics"
        heightPercentage={80}
      >
        <View style={{ flex: 1, paddingBottom: 16 }}>
          <TextInput
            mode="outlined"
            placeholder="Song name and artist..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearchLyrics}
            right={
              <TextInput.Icon icon="magnify" onPress={handleSearchLyrics} />
            }
            style={{ marginBottom: 16 }}
          />
          {isSearching ? (
            <ActivityIndicator
              style={{ marginTop: 32 }}
              color={theme.colors.primary}
            />
          ) : (
            <FlashList
              data={searchResults}
              keyExtractor={(item, index) => (item?.id != null ? String(item.id) : `sr-${index}`)}
              ListEmptyComponent={
                searchError ? (
                  <Text
                    style={{
                      color: theme.colors.onSurfaceVariant,
                      textAlign: 'center',
                      marginTop: 32,
                      paddingHorizontal: 16,
                    }}
                  >
                    {searchError}
                  </Text>
                ) : null
              }
              renderItem={({ item }: { item: any }) => (
                <List.Item
                  title={item.name || item.trackName}
                  description={`${item.artistName} • ${item.albumName} \n${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, "0")}`}
                  descriptionNumberOfLines={2}
                  right={(props) =>
                    item.syncedLyrics ? (
                      <Text
                        {...props}
                        style={{
                          alignSelf: "center",
                          color: theme.colors.primary,
                          fontSize: 12,
                        }}
                      >
                        Synced
                      </Text>
                    ) : null
                  }
                  onPress={() => handleSelectSearchResult(item)}
                  style={{ marginVertical: 4 }}
                />
              )}
            />
          )}
        </View>
      </ActionSheet>

      <ActionSheet
        visible={showOffsetDialog}
        onClose={() => setShowOffsetDialog(false)}
        title="Lyrics Timing"
        heightPercentage={45}
      >
        <View style={{ gap: 16, alignItems: "center" }}>
          <Text
            variant="displaySmall"
            style={{ color: theme.colors.primary, fontWeight: "bold" }}
          >
            {tempOffset > 0 ? "+" : ""}
            {(tempOffset / 1000).toFixed(1)}s
          </Text>
          <ScrollMeter value={tempOffset} onValueChange={setTempOffset} />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: 8,
              width: "100%",
              marginTop: 16,
            }}
          >
            <Button
              mode="text"
              onPress={() => {
                setLyricsOffset(itemId, tempOffset);
                setShowOffsetDialog(false);
              }}
            >
              Save
            </Button>
          </View>
        </View>
      </ActionSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: "hidden",
    borderWidth: 0,
    borderColor: "transparent",
  },
  mask: {
    position: "absolute",
    left: 0,
    right: 0,
    height: "18%",
    zIndex: 10,
    borderWidth: 0,
    borderColor: "transparent",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    paddingHorizontal: 24,
  },
  line: {
    alignItems: "center",
  },
  settingsButton: {
    position: "absolute",
    bottom: 24,
    right: 24,
    zIndex: 20,
  },
  translateButton: {
    position: "absolute",
    bottom: 24,
    left: 24,
    zIndex: 20,
  },
});
