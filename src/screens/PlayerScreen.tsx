import React, { useEffect, useState, useMemo, useRef, useLayoutEffect, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Pressable, Dimensions, Image, Animated, PanResponder, LayoutAnimation, Platform, UIManager, Alert, BackHandler } from 'react-native';
import { Text, IconButton, useTheme, Surface, ActivityIndicator, Portal, List, Button, Snackbar } from 'react-native-paper';
import { usePlayerStore } from '../store/playerStore';
import { jellyfinApi } from '../api/jellyfin';
import { SeekBar } from '../components/SeekBar';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSettingsStore } from '../store/settingsStore';
import { useUISettingsStore } from '../store/uiSettingsStore';
import { usePlaybackSettingsStore } from '../store/playbackSettingsStore';
import { useLocalLibraryStore } from '../store/localLibraryStore';
import { DatabaseService } from '../services/DatabaseService';
import { audioService } from '../services/AudioService';
import { downloadService } from '../services/DownloadService';
import { ScrollView } from 'react-native';
import ActionSheet from '../components/ActionSheet';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { useSharedValue, useDerivedValue, useAnimatedStyle, withSpring, withTiming, interpolate, Extrapolation } from 'react-native-reanimated';
import { SPRING, TIMING, EASE_OUT } from '../theme/motion';
import { useAutoHide } from '../hooks/useAutoHide';
import { EqualizerAnimation } from '../components/EqualizerAnimation';
import LyricsView from '../components/LyricsView';
import ArtworkCarousel from '../components/ArtworkCarousel';
import MarqueeText from '../components/MarqueeText';
import QueuePanel, { getPanelStops, COLLAPSED_HEIGHT } from '../components/QueuePanel';
import GrainOverlay from '../components/GrainOverlay';
import { ProgressControl } from '../components/ProgressControl';
import { QueueMiniProgressBar } from '../components/QueueMiniProgressBar';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../store/authStore';
import * as Haptics from 'expo-haptics';
import { getColors } from 'react-native-image-colors';
import { useIsAppActive } from '../hooks/useAppState';
import { isColorDarkHex, lightenHexColor, adjustHexColor, getContrastingIconColorFromHex } from '../utils/colorUtils';
import { dialogStyles } from '../utils/dialogStyles';

import { useWindowDimensions } from 'react-native';

// const { width } = Dimensions.get('window'); // Removed static width

// Self-contained fade-in gradient layer — mounts invisible, fades in, never flashes
function FadeInGradient({ colors }: { colors: [string, string] }) {
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(opacity, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
        }).start();
    }, []); // Only runs on mount

    return (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity }]}>
            <LinearGradient colors={colors} style={StyleSheet.absoluteFill} />
        </Animated.View>
    );
}

interface PlayerScreenProps {
    isGlobal?: boolean;
}

/**
 * Immersive-lyrics layout metrics.
 *
 * These describe how much the chrome occupies so the collapse animation can
 * hand exactly that space to the lyrics. They are approximations of the
 * transport block's rendered height (play surface 64 + bottom actions 44 +
 * margins), which is stable because every control is a fixed size.
 */
const CHROME_HEIGHT = 212;
/** How far the progress bar drops as the transport row collapses beneath it. */
const PROGRESS_DROP = 124;

const PlayerScreen = React.memo(function PlayerScreen({ isGlobal }: PlayerScreenProps = {}) {
    // Select specific fields to avoid re-rendering on positionMillis updates
    const { currentTrack, isPlaying, isBuffering, togglePlayPause, playNext, playPrevious, toggleShuffle, toggleRepeat, shuffleMode, repeatMode, queueLength, playTrack, sleepTimerTarget, setSleepTimer, queue, reorderQueue, removeFromQueue, clearQueue, isPlayerExpanded, queueSource } = usePlayerStore(useShallow(state => ({
        currentTrack: state.currentTrack,
        isPlaying: state.isPlaying,
        isBuffering: state.isBuffering,
        togglePlayPause: state.togglePlayPause,
        playNext: state.playNext,
        playPrevious: state.playPrevious,
        toggleShuffle: state.toggleShuffle,
        toggleRepeat: state.toggleRepeat,
        shuffleMode: state.shuffleMode,
        repeatMode: state.repeatMode,
        queueLength: state.queue.length,
        playTrack: state.playTrack,
        sleepTimerTarget: state.sleepTimerTarget,
        setSleepTimer: state.setSleepTimer,
        queue: state.queue,
        reorderQueue: state.reorderQueue,
        removeFromQueue: state.removeFromQueue,
        clearQueue: state.clearQueue,
        isPlayerExpanded: state.isPlayerExpanded,
        queueSource: state.queueSource,
    })));
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const theme = useTheme();
    /**
     * Library access, selected narrowly.
     *
     * This previously called `useLocalLibraryStore()` with no selector, which
     * subscribes to the whole store - including `tracks` (every scanned track)
     * and scan progress. Any library mutation re-rendered the entire player,
     * artwork carousel and queue panel with it.
     *
     * Actions are stable function references, so selecting them costs nothing.
     * `playlists` is a much smaller array than `tracks` and is the only piece
     * of state the player reads directly.
     */
    const localLibrary = useLocalLibraryStore(useShallow((s) => ({
        playlists: s.playlists,
        isFavorite: s.isFavorite,
        toggleFavorite: s.toggleFavorite,
        addToPlaylist: s.addToPlaylist,
        removeFromPlaylist: s.removeFromPlaylist,
        deleteTrack: s.deleteTrack,
    })));
    const { backgroundType, themeColor, showTechnicalDetails } = useUISettingsStore(useShallow(s => ({
        backgroundType: s.backgroundType,
        themeColor: s.themeColor,
        showTechnicalDetails: s.showTechnicalDetails,
    })));
    const { audioQuality } = useSettingsStore(useShallow(s => ({
        audioQuality: s.audioQuality,
    })));
    const { playbackRate, setPlaybackRate } = usePlaybackSettingsStore(useShallow(s => ({
        playbackRate: s.playbackRate,
        setPlaybackRate: s.setPlaybackRate,
    })));
    const isAppActive = useIsAppActive();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;
    // State for extracted colors
    const [extractedColors, setExtractedColors] = useState<any>(null);

    // Track current image URL to detect changes and prevent stale updates
    const currentImageUrlRef = useRef<string | null>(null);

    // (Background transition is handled by FadeInGradient layers)

    // Play tracking - record plays to database when track changes
    const previousTrackRef = useRef<{ track: any; startTime: number; duration: number } | null>(null);

    // Orientation Transition - Wait for layout to settle before showing
    const layoutOpacity = useRef(new Animated.Value(1)).current;
    useLayoutEffect(() => {
        // Immediately hide content
        layoutOpacity.setValue(0);

        // Wait for layout to fully settle, then fade in
        const timeout = setTimeout(() => {
            Animated.timing(layoutOpacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }).start();
        }, 250); // 250ms delay allows layout to fully recalculate

        return () => clearTimeout(timeout);
    }, [isLandscape]);

    useEffect(() => {
        // When current track changes, record the previous track's play
        if (currentTrack?.id && previousTrackRef.current && previousTrackRef.current.track.id !== currentTrack.id) {
            const playDuration = Date.now() - previousTrackRef.current.startTime;
            const trackDuration = previousTrackRef.current.duration;
            const completedPlay = trackDuration > 0 && playDuration >= trackDuration * 0.8; // 80% threshold

            // Only record if listened for at least 5 seconds
            if (playDuration > 5000) {
                // Local tracks have a truthy file:// streamUrl parsed from disk.
                // Jellyfin tracks have an empty streamUrl (resolved on the fly by audio service).
                const source = previousTrackRef.current.track.streamUrl ? 'local' : 'jellyfin';
                DatabaseService.recordPlay(
                    previousTrackRef.current.track,
                    source,
                    playDuration,
                    completedPlay,
                    previousTrackRef.current.track.playlistId
                ).catch(console.error);
            }
        }

        // Update ref with current track
        if (currentTrack?.id) {
            previousTrackRef.current = {
                track: currentTrack,
                startTime: Date.now(),
                duration: currentTrack.durationMillis || 0,
            };
        }
    }, [currentTrack?.id]);

    // Helpers - use imported utilities
    const isColorDark = isColorDarkHex;

    const safeThemeColor = theme.colors.primary;

    // Effect to extract colors when track changes
    useEffect(() => {
        const imageUrl = currentTrack?.imageUrl;

        // Reset extracted colors when track changes to prevent showing old colors
        if (imageUrl !== currentImageUrlRef.current) {
            currentImageUrlRef.current = imageUrl || null;
            // Don't reset extractedColors here - keep old colors visible during extraction
        }

        // Only fetch if background type is dynamic (dominant) AND app is active
        if (backgroundType !== 'dominant' || !imageUrl || !isAppActive) {
            return;
        }

        let cancelled = false;

        const fetchColors = async () => {
            try {
                const colors = await getColors(imageUrl, {
                    fallback: safeThemeColor,
                    cache: true,
                    key: imageUrl,
                });

                // Only update if this is still the current track's image
                if (!cancelled && currentImageUrlRef.current === imageUrl) {
                    if (colors.platform === 'android' || colors.platform === 'ios') {
                        setExtractedColors(colors);
                    }
                }
            } catch (err) {
                console.warn('Color extraction failed:', err);
                // Don't clear colors on error - keep showing previous
            }
        };

        fetchColors();

        return () => {
            cancelled = true;
        };
    }, [currentTrack?.imageUrl, backgroundType, safeThemeColor, isAppActive]);

    // Helper to lighten a color - use imported utility
    const lightenColor = lightenHexColor;

    // Preserve last known valid colors to prevent flashing to gray while extracting
    const fallbackBgRef = useRef<string>('#1a1a1a');
    const fallbackAccentRef = useRef<string>(safeThemeColor);

    // Calculate dynamic colors from extracted colors
    const dynamicColors = useMemo(() => {
        if (!extractedColors || backgroundType !== 'dominant') {
            return {
                backgroundColor: fallbackBgRef.current,
                gradientColors: [fallbackBgRef.current, '#000000'] as [string, string],
                textColor: '#FFFFFF',
                secondaryTextColor: 'rgba(255,255,255,0.7)',
                iconColor: '#FFFFFF',
                activeColor: fallbackAccentRef.current,
            };
        }

        let bgColor: string;
        let accentColor: string | undefined;

        if (extractedColors.platform === 'android') {
            bgColor = extractedColors.dominant || fallbackBgRef.current;

            const candidates = [
                extractedColors.vibrant,
                extractedColors.lightVibrant,
                extractedColors.muted,
                extractedColors.lightMuted
            ];

            let rawAccent = candidates.find(c => c);

            if (rawAccent) {
                if (isColorDark(rawAccent)) {
                    accentColor = lightenColor(rawAccent, 0.4);
                } else {
                    accentColor = rawAccent;
                }
            } else {
                accentColor = fallbackAccentRef.current;
            }

        } else if (extractedColors.platform === 'ios') {
            bgColor = extractedColors.background || fallbackBgRef.current;
            const candidates = [
                extractedColors.primary,
                extractedColors.secondary,
                extractedColors.detail
            ];

            let rawAccent = candidates.find(c => c);
            if (rawAccent) {
                if (isColorDark(rawAccent)) {
                    accentColor = lightenColor(rawAccent, 0.4);
                } else {
                    accentColor = rawAccent;
                }
            } else {
                accentColor = fallbackAccentRef.current;
            }
        } else {
            bgColor = fallbackBgRef.current;
            accentColor = fallbackAccentRef.current;
        }

        if (!bgColor || bgColor === 'undefined') bgColor = fallbackBgRef.current;
        if (!accentColor || accentColor === 'undefined') accentColor = fallbackAccentRef.current;

        // Save successful colors for next smooth transition
        fallbackBgRef.current = bgColor;
        fallbackAccentRef.current = accentColor;

        return {
            backgroundColor: bgColor,
            gradientColors: [bgColor, '#000000'] as [string, string],
            textColor: '#FFFFFF',
            secondaryTextColor: 'rgba(255,255,255,0.7)',
            iconColor: '#FFFFFF',
            activeColor: accentColor,
        };
    }, [extractedColors, backgroundType, safeThemeColor]);

    // (Old cross-fade removed — handled by FadeInGradient layer stacking)

    /**
     * Neutral colour for a control that is present but switched off.
     *
     * Deliberately not the accent and not the album-derived secondary text:
     * tinting inactive toggles with the accent made "off" look "on", and the
     * album-derived hue made them look like a different control set.
     */
    const inactiveControl = 'rgba(255,255,255,0.55)';

    const playerColors = useMemo(() => {
        if (dynamicColors) {
            return {
                textColor: dynamicColors.textColor,
                secondaryTextColor: dynamicColors.secondaryTextColor,
                iconColor: dynamicColors.iconColor,
                activeColor: dynamicColors.activeColor,
            };
        }

        // Colors for 'off' mode (Dark Grey Background)
        if (backgroundType === 'off') {
            return {
                textColor: '#FFFFFF',
                secondaryTextColor: 'rgba(255,255,255,0.7)',
                iconColor: safeThemeColor,
                activeColor: safeThemeColor,
            };
        }

        // Default colors for 'blurred' mode
        return {
            textColor: '#FFFFFF',
            secondaryTextColor: 'rgba(255,255,255,0.7)',
            iconColor: '#FFFFFF',
            activeColor: safeThemeColor,
        };
    }, [dynamicColors, safeThemeColor, backgroundType]);

    // Robust layered background approach: Stack new colors on top and fade them in.
    const [bgLayers, setBgLayers] = useState<Array<{ id: string, gradient: [string, string] }>>([]);

    // When dynamicColors change, append a new layer
    useEffect(() => {
        if (dynamicColors?.gradientColors && backgroundType === 'dominant') {
            setBgLayers(prev => {
                // Keep only the last 2 layers to prevent memory leaks while allowing smooth overlapping fades
                const nextLayers = [...prev, { id: Date.now().toString() + Math.random(), gradient: dynamicColors.gradientColors }];
                return nextLayers.slice(-3);
            });
        }
    }, [dynamicColors?.gradientColors, backgroundType]);



    // Local state
    // isBuffering is now from the store selector above
    const [isLyricsVisible, setIsLyricsVisible] = useState(false);
    const [isQueueOpen, setIsQueueOpen] = useState(false);

    /**
     * Immersive lyrics mode.
     *
     * While lyrics are showing, the header and transport controls fade out
     * after a period of inactivity and the lyrics expand into the space. Any
     * touch brings them back.
     *
     * Suspended whenever a dialog or the queue sheet is open, so the chrome can
     * never hide underneath something the user is interacting with. Those
     * dialog flags are declared further down, so this reads a ref that a later
     * effect keeps in step - referencing them directly here would be a
     * use-before-declaration error.
     */
    const [immersiveBlocked, setImmersiveBlocked] = useState(false);
    const immersiveEnabled = isLyricsVisible && !isQueueOpen && !immersiveBlocked;

    const { hidden: controlsHidden, poke: pokeControls } = useAutoHide({
        delayMs: 4000,
        enabled: immersiveEnabled,
    });

    /**
     * 0 = controls fully visible, 1 = fully hidden.
     *
     * A single shared value drives every part of the transition (chrome fade,
     * progress bar position, lyrics padding) so they cannot drift out of step -
     * the same reasoning as the queue sheet's translateY.
     */
    const immersiveProgress = useSharedValue(0);
    useEffect(() => {
        immersiveProgress.value = withTiming(controlsHidden ? 1 : 0, {
            duration: TIMING.SLOW,
            easing: EASE_OUT,
        });
    }, [controlsHidden, immersiveProgress]);

    /** Chrome (header, transport row, bottom actions) fades and collapses. */
    const chromeStyle = useAnimatedStyle(() => ({
        opacity: 1 - immersiveProgress.value,
        // Collapse the height too, so the lyrics genuinely gain the space
        // rather than sitting behind an invisible but still-present block.
        maxHeight: interpolate(immersiveProgress.value, [0, 1], [CHROME_HEIGHT, 0]),
        transform: [
            { translateY: interpolate(immersiveProgress.value, [0, 1], [0, 12]) },
        ],
    }));

    /** Progress bar drops toward the bottom edge as the controls go away. */
    const progressBarStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: interpolate(immersiveProgress.value, [0, 1], [0, PROGRESS_DROP]) },
        ],
    }));

    /**
     * Heart and overflow leave sideways.
     *
     * They sit at opposite ends of the row, so a shared vertical fade reads as
     * them simply blinking out. Sliding each toward its own edge matches where
     * it lives, and the two travel in opposite directions from the one shared
     * progress value so they stay in step with the rest of the chrome.
     */
    /**
     * NOTE: the heart and track-overflow icons in the title row are NOT part
     * of the immersive fade. The two icons the user sees above the progress
     * bar in lyrics mode - `translate` on the left and `dots-horizontal` on
     * the right - live inside LyricsView and are animated there, because they
     * are absolutely positioned within it.
     */

    // Shared animated value for queue panel position. Reanimated shared value
    // (not RN Animated) so the sheet runs entirely on the UI thread.
    const insets = useSafeAreaInsets();
    const panelStops = useMemo(
        () => getPanelStops(height, insets.top, insets.bottom),
        [height, insets.top, insets.bottom],
    );
    const queueTranslateY = useSharedValue(panelStops.collapsed);

    // Keep the collapsed resting position correct across rotation/resize.
    useEffect(() => {
        if (!isQueueOpen) {
            queueTranslateY.value = panelStops.collapsed;
        }
    }, [panelStops.collapsed, isQueueOpen, queueTranslateY]);

    // Mini player overlay opacity: fades in as the queue transitions from peek to full
    const miniPlayerOpacity = useDerivedValue(() =>
        interpolate(
            queueTranslateY.value,
            [panelStops.full, panelStops.peek],
            [1, 0],
            Extrapolation.CLAMP,
        ),
    );

    const miniPlayerAnimatedStyle = useAnimatedStyle(() => ({
        opacity: miniPlayerOpacity.value,
    }));

    /**
     * Stable identities for QueuePanel props.
     *
     * The panel is memoised, so an inline array or arrow here would create a new
     * identity every render and defeat the memo entirely - re-rendering a
     * virtualised list of up to hundreds of rows on every play/pause.
     */
    const panelGradientColors = useMemo<[string, string]>(
        () => dynamicColors?.gradientColors || ['#1a1a1a', '#000000'],
        [dynamicColors?.gradientColors],
    );

    const handleSaveQueueAsPlaylist = useCallback(async (name: string) => {
        const trackIds = usePlayerStore.getState().queue.map((t: any) => t.id);
        // Read from the store rather than the `dataSource` binding: this
        // callback is declared above where that binding is created, and the
        // value only matters at call time anyway.
        const { dataSource: currentSource } = useSettingsStore.getState();
        if (currentSource === 'local') {
            const playlist = useLocalLibraryStore.getState().createPlaylist(name);
            for (const id of trackIds) {
                useLocalLibraryStore.getState().addToPlaylist(playlist.id, id);
            }
        } else {
            await jellyfinApi.createPlaylist(name, trackIds);
        }
    }, []);

    // Slightly darkened solid background for the mini player overlay
    const miniPlayerBgColor = useMemo(() =>
        adjustHexColor(dynamicColors?.backgroundColor || '#1a1a1a', -30),
    [dynamicColors?.backgroundColor]);

    // Reset queue panel when player expands
    useEffect(() => {
        if (isPlayerExpanded) {
            setIsQueueOpen(false);
        }
    }, [isPlayerExpanded]);

    const [isSleepTimerVisible, setIsSleepTimerVisible] = useState(false);
    const [artworkError, setArtworkError] = useState(false);
    const [isSpeedDialogVisible, setIsSpeedDialogVisible] = useState(false);

    const handleClosePlayer = () => {
        if (isGlobal) {
            usePlayerStore.getState().setPlayerExpanded(false);
        } else {
            navigation.goBack();
        }
    };

    // Playlist Management State
    const [playlists, setPlaylists] = useState<any[]>([]);
    const [isAddToPlaylistVisible, setIsAddToPlaylistVisible] = useState(false);

    const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
    const [isDuplicateDialogVisible, setIsDuplicateDialogVisible] = useState(false);
    const [pendingPlaylistId, setPendingPlaylistId] = useState<string | null>(null);
    const [snackbarVisible, setSnackbarVisible] = useState(false);
    const [isSubmenuVisible, setIsSubmenuVisible] = useState(false); // Track Options
    const [isRemoveConfirmVisible, setIsRemoveConfirmVisible] = useState(false);
    const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false); // New state for delete confirmation

    /**
     * Keep the immersive-mode suspension flag in step with the dialogs.
     *
     * Declared here (after the flags) so it can read them without a
     * use-before-declaration error, and so opening any dialog immediately
     * restores the chrome rather than hiding it underneath.
     */
    useEffect(() => {
        const blocked =
            isSleepTimerVisible ||
            isSpeedDialogVisible ||
            isSubmenuVisible ||
            isAddToPlaylistVisible ||
            isRemoveConfirmVisible ||
            isDeleteConfirmVisible;
        setImmersiveBlocked(blocked);
    }, [
        isSleepTimerVisible,
        isSpeedDialogVisible,
        isSubmenuVisible,
        isAddToPlaylistVisible,
        isRemoveConfirmVisible,
        isDeleteConfirmVisible,
    ]);

    // Get current track context
    const isPlayingFromPlaylist = !!currentTrack?.playlistId && currentTrack.playlistId !== 'all-songs'; // Allow 'liked-songs', exclude 'all-songs'
    const currentPlaylistId = currentTrack?.playlistId;
    const currentPlaylistItemId = currentTrack?.playlistItemId;

    // Reset artwork error when track changes
    useEffect(() => {
        setArtworkError(false);
    }, [currentTrack?.imageUrl]);

    // Apply playback rate when it changes
    useEffect(() => {
        audioService.setPlaybackRate(playbackRate);
    }, [playbackRate]);

    useEffect(() => {
        const onBack = () => {
            if (isQueueOpen) {
                setIsQueueOpen(false);
                return true;
            }
            return false;
        };
        const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
        return () => sub.remove();
    }, [isQueueOpen]);

    // Get updateTrackFavorite from store
    const updateTrackFavorite = usePlayerStore(state => state.updateTrackFavorite);

    // Get dataSource to check if we're in local mode
    const { dataSource } = useSettingsStore();

    // Check if current track is a local track (needed for like functionality)
    const isLocalTrack = currentTrack?.streamUrl?.startsWith('file://') ||
        currentTrack?.streamUrl?.startsWith('content://') ||
        currentTrack?.id?.startsWith('local_');

    /**
     * Local favourite status for the *current* track only.
     *
     * `isFavorite` reads from the store's `tracks` array, so reading it through
     * a non-reactive path would leave the heart stale after a toggle. Selecting
     * just this one boolean keeps it reactive without subscribing the player to
     * the whole track list.
     */
    const isLocalFavorite = useLocalLibraryStore((s) => {
        if (!currentTrack?.id) return false;
        const track = s.tracks.find((t) => t.id === currentTrack.id);
        return track?.isFavorite || false;
    });

    // Get favorite status - check local library for local tracks
    const isFavorite = isLocalTrack
        ? isLocalFavorite
        : (currentTrack?.isFavorite ?? false);

    const handleLike = async () => {
        if (!currentTrack) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        if (isLocalTrack) {
            // Local track: use local library store
            localLibrary.toggleFavorite(currentTrack.id);
            // Also update player store for UI consistency
            updateTrackFavorite(currentTrack.id, !isFavorite);
        } else {
            // Jellyfin track: use API
            const newStatus = !isFavorite;
            updateTrackFavorite(currentTrack.id, newStatus);

            try {
                if (newStatus) {
                    await jellyfinApi.markFavorite(currentTrack.id);
                } else {
                    await jellyfinApi.unmarkFavorite(currentTrack.id);
                }
            } catch (error) {
                console.error('Failed to toggle favorite:', error);
                // Revert on failure
                updateTrackFavorite(currentTrack.id, !newStatus);
            }
        }
    };

    const handleToggleShuffle = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleShuffle();
    };

    const handleToggleRepeat = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toggleRepeat();
    };

    // Playlist & Menu Handlers
    const fetchPlaylists = async () => {
        try {
            if (dataSource === 'local') {
                const localPlaylists = localLibrary.playlists.map(p => ({
                    Id: p.id,
                    Name: p.name,
                    Type: 'Playlist',
                    isLocal: true,
                }));
                setPlaylists(localPlaylists);
            } else {
                const data = await jellyfinApi.getPlaylists();
                setPlaylists(data.Items);
            }
        } catch (error) {
            console.error('Failed to fetch playlists:', error);
        }
    };

    const handleOpenTrackMenu = () => {
        if (!currentTrack) return;
        setSelectedTrackId(currentTrack.id);
        setIsSubmenuVisible(true);
    };

    const handlePlayNext = () => {
        if (!currentTrack) return;
        // Logic to play next (already in store? playNext plays *next item*, doesn't add to queue next. 
        // Wait, store has addToQueueNext.
        usePlayerStore.getState().addToQueueNext(currentTrack); // This duplicates current track as next? 
        // User wants "Play Next" usually implies adding *another* song.
        // But here context is Current Item. "Play Next" on current item usually means "Duplicate this to play next" or is it "Add THIS song to play next"?
        // In DetailScreen, it adds the *selected* song to play next.
        // Here, it is the *current* song.
        // Let's assume user wants to re-queue current song to play next.
        // OR, user expects this menu to manage the current song.
        // DetailScreen logic: gets track from ID, adds to queue.
        setIsSubmenuVisible(false);
    };

    // Correcting handlePlayNext logic: detailed screen adds 'selected' track.
    // If I am in Player, and I click 3 dots, I assume actions are for THIS playing track.

    const handleAddToQueue = () => {
        if (!currentTrack) return;
        usePlayerStore.getState().addToQueueEnd(currentTrack);
        setIsSubmenuVisible(false);
    };

    const handleAddToPlaylistOpen = () => {
        setIsSubmenuVisible(false);
        fetchPlaylists();
        setIsAddToPlaylistVisible(true);
    };

    const handleRemoveFromPlaylist = () => {
        setIsSubmenuVisible(false);
        setIsRemoveConfirmVisible(true);
    };

    const confirmRemoveFromPlaylist = async () => {
        // Special case for Liked Songs: Treat remove as "Unlike"
        if (currentPlaylistId === 'liked-songs') {
            await handleLike();
            setIsRemoveConfirmVisible(false);
            return;
        }

        if (!currentPlaylistItemId || !currentPlaylistId) return;
        try {
            if (dataSource === 'local' || currentTrack?.streamUrl.startsWith('file')) { // Check local
                localLibrary.removeFromPlaylist(currentPlaylistId, currentPlaylistItemId);
                // We should probably update queue or stop playback if removed? 
                // DetailScreen removes from list. Player just continues.
            } else {
                await jellyfinApi.removeFromPlaylist(currentPlaylistId, [currentPlaylistItemId]);
            }
            setIsRemoveConfirmVisible(false);
        } catch (error) {
            console.error('Failed to remove from playlist:', error);
        }
    };

    const handleAddToPlaylist = async (playlistId: string) => {
        if (!selectedTrackId) return;

        try {
            if (dataSource === 'local') {
                const playlist = localLibrary.playlists.find(p => p.id === playlistId);
                if ((playlist?.trackIds || []).includes(selectedTrackId)) {
                    setPendingPlaylistId(playlistId);
                    setIsDuplicateDialogVisible(true);
                } else {
                    await confirmAddToPlaylist(playlistId);
                }
            } else {
                const playlistItems = await jellyfinApi.getItems({ ParentId: playlistId });
                const isDuplicate = playlistItems.Items.some((item: any) => item.Id === selectedTrackId);

                if (isDuplicate) {
                    setPendingPlaylistId(playlistId);
                    setIsDuplicateDialogVisible(true);
                } else {
                    await confirmAddToPlaylist(playlistId);
                }
            }
        } catch (error) {
            console.error('Failed to check playlist items:', error);
            await confirmAddToPlaylist(playlistId);
        }
    };

    const confirmAddToPlaylist = async (playlistId: string) => {
        if (!selectedTrackId) return;
        try {
            if (dataSource === 'local') {
                localLibrary.addToPlaylist(playlistId, selectedTrackId);
            } else {
                await jellyfinApi.addToPlaylist(playlistId, [selectedTrackId]);
            }
            setIsAddToPlaylistVisible(false);
            setIsDuplicateDialogVisible(false);
            setPendingPlaylistId(null);
            setSnackbarVisible(true);
        } catch (error) {
            console.error('Failed to add to playlist:', error);
        }
    };

    const handleDeleteTrack = async () => {
        if (!currentTrack) return;

        try {
            // Check if it's a local track (redundant if UI only shows for local, but safe)
            if (!currentTrack.streamUrl.startsWith('file') && !currentTrack.id.startsWith('local_')) return;

            // Reconstruct minimal Track object needed for deletion
            // PlayerStore track has all we need usually
            const trackObj = {
                id: currentTrack.id,
                streamUrl: currentTrack.streamUrl,
                // TS compliance
                name: currentTrack.name,
                artist: currentTrack.artist,
                album: currentTrack.album,
                imageUrl: currentTrack.imageUrl || '',
                durationMillis: 0,
                artistId: ''
            };

            const success = await localLibrary.deleteTrack(trackObj as any);

            if (success) {
                // If we deleted the current track, we should play next or stop
                if (queueLength > 1) {
                    playNext();
                } else {
                    // Queue empty/single item deleted
                    usePlayerStore.getState().reset();
                }
            } else {
                console.error("Failed to delete file from device.");
            }
        } catch (error) {
            console.error("Delete handler error:", error);
        } finally {
            setIsDeleteConfirmVisible(false);
            setIsSubmenuVisible(false);
        }
    };

    const handleOpenDeleteConfirm = () => {
        setIsSubmenuVisible(false);
        setIsDeleteConfirmVisible(true);
    };

    // If no track, show nothing or placeholder
    if (!currentTrack) {
        return <View style={[styles.container, { backgroundColor: theme.colors.background }]} />;
    }

    const handleArtistPress = () => {
        // For local tracks, artistId might not exist - generate it from artist name
        let artistId = currentTrack.artistId;

        if (!artistId && isLocalTrack && currentTrack.artist) {
            // Generate local artist ID in the same format used elsewhere
            artistId = `local_artist_${currentTrack.artist.toLowerCase().replace(/\s+/g, '_')}`;
        }

        if (artistId) {
            handleClosePlayer(); // Close player screen first
            setTimeout(() => {
                // Navigate through nested stacks: first go back to Main, then to HomeStack Detail
                navigation.dispatch(
                    CommonActions.navigate({
                        name: 'Main',
                        params: {
                            screen: 'HomeStack',
                            params: {
                                screen: 'Detail',
                                params: { itemId: artistId, type: 'MusicArtist' }
                            }
                        }
                    })
                );
            }, 50); // Small delay to let close animation start
        }
    };

    // Color adjustment helpers - use imported utilities
    const adjustColor = adjustHexColor;
    const getContrastingIconColor = getContrastingIconColorFromHex;

    return (
        <View style={[styles.container, { backgroundColor: '#1a1a1a' }]}>
            {/* Background Layer */}
            {backgroundType === 'dominant' ? (
                <>
                    {/* Dark fallback base */}
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1a1a1a' }]} />
                    
                    {/* Render overlapping layers - newest layers fade in on top */}
                    {bgLayers.map((layer) => (
                        <FadeInGradient key={layer.id} colors={layer.gradient} />
                    ))}
                </>
            ) : backgroundType === 'blurred' && currentTrack?.imageUrl ? (
                <ExpoImage
                    source={{ uri: currentTrack.imageUrl }}
                    style={StyleSheet.absoluteFill}
                    contentFit="cover"
                    blurRadius={50}
                    transition={1000}
                />
            ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1a1a1a' }]} />
            )}

            {/* Gradient Overlay for legibility */}
            <LinearGradient
                colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.85)']}
                style={StyleSheet.absoluteFill}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                pointerEvents="none"
            />

            {/* Film grain texture overlay */}
            <GrainOverlay opacity={0.35} />

            {/* Dark overlay when lyrics are visible to improve text contrast against bright artwork */}
            {!!isLyricsVisible && (
                <View
                    style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]}
                    pointerEvents="none"
                />
            )}

            {/* Content wrapped in SafeAreaView */}
            <SafeAreaView style={styles.content} edges={['top', 'bottom', 'left', 'right']}>
                {/*
                  Any touch anywhere in the player restores the chrome in
                  immersive lyrics mode and restarts the idle countdown.
                  `box-none` means it only observes touches that land on empty
                  space - controls underneath still receive their own taps.
                */}
                {immersiveEnabled && (
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPressIn={pokeControls}
                        pointerEvents={controlsHidden ? 'auto' : 'box-none'}
                        accessibilityLabel="Show playback controls"
                    />
                )}
                {/*
                  Header - portrait only.

                  Carries the dismiss chevron, a centred title, and a spacer
                  that keeps the title optically centred despite the chevron.
                  The title reads "Lyrics" in lyrics mode because that is a real
                  mode change, and "Now Playing" otherwise.
                */}
                {!isLandscape && (
                    <Reanimated.View style={[styles.header, chromeStyle]}>
                        <IconButton
                            icon="chevron-down"
                            iconColor={playerColors.secondaryTextColor}
                            size={26}
                            onPress={handleClosePlayer}
                            /**
                             * Material's IconButton defaults to a 48dp box.
                             * The box is pinned to the header height to keep
                             * the row short, and `hitSlop` restores an
                             * accessible touch target without inflating the
                             * layout. The negative left margin aligns the
                             * glyph with the content edge, not its padding.
                             */
                            style={{ margin: 0, marginLeft: -8, width: 36, height: 36 }}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            accessibilityLabel="Close player"
                        />
                        <Text
                            variant="titleMedium"
                            numberOfLines={1}
                            style={{ color: playerColors.textColor, fontWeight: 'bold' }}
                        >
                            {isLyricsVisible ? 'Lyrics' : 'Now Playing'}
                        </Text>
                        {/* Balances the chevron so the title stays centred. */}
                        <View style={{ width: 36 }} />
                    </Reanimated.View>
                )}


                {/* Landscape Layout */}
                {isLandscape ? (
                    <View style={{ flex: 1, flexDirection: 'row', paddingHorizontal: 16 }}>
                        {/* LEFT COLUMN: Artwork / Lyrics */}
                        <View style={{ flex: 0.45, justifyContent: 'center', alignItems: 'center', paddingRight: 8 }}>
                            {isLyricsVisible ? (
                                <LyricsView
                                    itemId={currentTrack.id}
                                    activeColor={playerColors.activeColor}
                                    inactiveColor={playerColors.secondaryTextColor}
                                    localLyrics={currentTrack.lyrics}
                                        chromeHidden={controlsHidden}
                                />
                            ) : (
                                <View style={{ width: '100%', aspectRatio: 1, maxHeight: height * 0.85, alignItems: 'center', justifyContent: 'center' }}>
                                    <ArtworkCarousel size={Math.min(height * 0.8, width * 0.38)} borderRadius={12} />
                                </View>
                            )}
                        </View>

                        {/* RIGHT COLUMN: Controls Layout */}
                        <View style={{ flex: 0.55, justifyContent: 'center', paddingLeft: 16 }}>
                            {/* Track Info - centered */}
                            <View style={{ alignItems: 'center', marginBottom: 20 }}>
                                <MarqueeText
                                    text={currentTrack.name}
                                    variant="headlineSmall"
                                    style={{ color: playerColors.textColor, fontWeight: 'bold', textAlign: 'center' }}
                                />
                                <TouchableOpacity onPress={handleArtistPress}>
                                    <Text variant="bodyMedium" style={{ color: playerColors.secondaryTextColor, textAlign: 'center' }} numberOfLines={1}>
                                        {currentTrack.artist}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {/* Progress in the MIDDLE of controls */}
                            <View style={{ marginVertical: 10 }}>
                                <ProgressControl
                                    activeColor={playerColors.activeColor}
                                    inactiveColor={playerColors.secondaryTextColor}
                                    textColor={playerColors.secondaryTextColor}
                                />
                            </View>

                            {/* Main Controls - evenly spaced */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', marginVertical: 10 }}>
                                <IconButton
                                    icon={repeatMode === 'one' ? "repeat-once" : "repeat"}
                                    iconColor={repeatMode !== 'off' ? playerColors.activeColor : playerColors.secondaryTextColor}
                                    size={22}
                                    onPress={handleToggleRepeat}
                                />
                                <IconButton
                                    icon="skip-previous"
                                    iconColor={playerColors.activeColor}
                                    size={36}
                                    onPress={playPrevious}
                                />
                                <Surface style={[styles.playButton, { width: 60, height: 60, borderRadius: 30, backgroundColor: playerColors.activeColor }]} elevation={4}>
                                    {isBuffering ? (
                                        <ActivityIndicator color={getContrastingIconColor(playerColors.activeColor)} />
                                    ) : (
                                        <IconButton
                                            icon={isPlaying ? "pause" : "play"}
                                            iconColor={getContrastingIconColor(playerColors.activeColor)}
                                            size={36}
                                            onPress={togglePlayPause}
                                            style={{ margin: 0 }}
                                        />
                                    )}
                                </Surface>
                                <IconButton
                                    icon="skip-next"
                                    iconColor={playerColors.activeColor}
                                    size={36}
                                    onPress={playNext}
                                />
                                <IconButton
                                    icon="shuffle"
                                    iconColor={shuffleMode ? playerColors.activeColor : playerColors.secondaryTextColor}
                                    size={22}
                                    // onPress passes a GestureResponderEvent, but the
                                    // handler takes an optional boolean, so wrap it
                                    // rather than forwarding the event as that flag.
                                    onPress={() => toggleShuffle()}
                                />
                            </View>

                            {/* Bottom Actions */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 10 }}>
                                <IconButton
                                    icon="chevron-down"
                                    iconColor={playerColors.secondaryTextColor}
                                    size={24}
                                    onPress={handleClosePlayer}
                                />
                                {/* Playback Speed Button */}
                                <IconButton
                                    icon="speedometer"
                                    iconColor={playbackRate !== 1.0 ? playerColors.activeColor : playerColors.secondaryTextColor}
                                    size={24}
                                    onPress={() => setIsSpeedDialogVisible(true)}
                                />
                                <IconButton
                                    icon="power-sleep"
                                    iconColor={sleepTimerTarget ? playerColors.activeColor : playerColors.secondaryTextColor}
                                    size={22}
                                    onPress={() => setIsSleepTimerVisible(true)}
                                />
                                <IconButton
                                    icon="microphone-variant"
                                    iconColor={isLyricsVisible ? playerColors.activeColor : playerColors.secondaryTextColor}
                                    size={22}
                                    onPress={() => setIsLyricsVisible(!isLyricsVisible)}
                                />
                                <IconButton
                                    icon={isFavorite ? "heart" : "heart-outline"}
                                    iconColor={playerColors.activeColor}
                                    size={22}
                                    onPress={handleLike}
                                />
                                <IconButton
                                    icon="dots-vertical"
                                    iconColor={playerColors.secondaryTextColor}
                                    size={22}
                                    onPress={handleOpenTrackMenu}
                                />
                            </View>
                        </View>
                    </View>
                ) : (
                    <>
                        {/* Portrait Layout */}
                        <View style={{ flex: 1, justifyContent: 'center' }}>
                            {isLyricsVisible ? (
                                <LyricsView
                                    itemId={currentTrack.id}
                                    activeColor={playerColors.activeColor}
                                    inactiveColor={playerColors.secondaryTextColor}
                                    localLyrics={currentTrack.lyrics}
                                        chromeHidden={controlsHidden}
                                />
                            ) : (
                                <>
                                    <View style={styles.artworkContainer}>
                                        {/*
                                          Clamp to the available height as well
                                          as the width. `width - 80` alone made
                                          the artwork taller than the space
                                          left for it on short screens and in
                                          split-screen, pushing the transport
                                          controls off the bottom.
                                        */}
                                        <ArtworkCarousel
                                            size={Math.min(width - 80, height * 0.45)}
                                            borderRadius={8}
                                        />
                                    </View>

                                    <View style={styles.trackInfo}>
                                        <View style={{ flex: 1 }}>
                                            <MarqueeText
                                                text={currentTrack.name}
                                                variant="headlineSmall"
                                                style={{ color: playerColors.textColor, fontWeight: 'bold' }}
                                            />
                                            <TouchableOpacity onPress={handleArtistPress}>
                                                <Text variant="bodyMedium" style={{ color: playerColors.secondaryTextColor }}>
                                                    {currentTrack.artist}
                                                </Text>
                                            </TouchableOpacity>

                                            {!!showTechnicalDetails && (() => {
                                                // Determine effective display values based on audio quality
                                                const isAutoMode = audioQuality === 'auto' && !isLocalTrack;
                                                const isTranscoding = (audioQuality !== 'lossless' && audioQuality !== 'auto') && !isLocalTrack;

                                                let displayCodec: string | undefined;
                                                let displayBitrate: number | null = null;
                                                let displayContainer: string | undefined;

                                                if (isAutoMode) {
                                                    // Auto mode - we don't know current network state in UI, show generic
                                                    displayCodec = undefined; // Don't show codec since it varies
                                                    displayBitrate = null;
                                                    displayContainer = undefined;
                                                } else if (isTranscoding) {
                                                    displayCodec = 'MP3';
                                                    displayBitrate = audioQuality === 'high' ? 320 : 128;
                                                    displayContainer = undefined;
                                                } else {
                                                    // Lossless or local track - show original values
                                                    displayCodec = currentTrack.codec?.toUpperCase();
                                                    displayBitrate = currentTrack.bitrate ? Math.round(currentTrack.bitrate / 1000) : null;
                                                    displayContainer = currentTrack.container;
                                                }

                                                return (
                                                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                                                        {!!isAutoMode && (
                                                            <View style={{ borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: 'rgba(100,200,100,0.2)' }}>
                                                                <Text variant="labelSmall" style={{ color: playerColors.activeColor, fontSize: 11 }}>
                                                                    AUTO
                                                                </Text>
                                                            </View>
                                                        )}
                                                        {!!displayCodec && (
                                                            <View style={{ borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.1)' }}>
                                                                <Text variant="labelSmall" style={{ color: playerColors.secondaryTextColor, fontSize: 11 }}>
                                                                    {displayCodec}
                                                                </Text>
                                                            </View>
                                                        )}
                                                        {!!displayBitrate && (
                                                            <View style={{ borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.1)' }}>
                                                                <Text variant="labelSmall" style={{ color: playerColors.secondaryTextColor, fontSize: 11 }}>
                                                                    {`${displayBitrate} kbps`}
                                                                </Text>
                                                            </View>
                                                        )}
                                                        {!!displayContainer && displayContainer !== currentTrack.codec && (
                                                            <View style={{ borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.1)' }}>
                                                                <Text variant="labelSmall" style={{ color: playerColors.secondaryTextColor, fontSize: 11 }}>
                                                                    {displayContainer.toUpperCase()}
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                );
                                            })()}
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: -8 }}>
                                            <IconButton
                                                icon={isFavorite ? "heart" : "heart-outline"}
                                                iconColor={playerColors.activeColor}
                                                size={28}
                                                onPress={handleLike}
                                                accessibilityLabel={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                                                style={{ margin: 0 }}
                                            />
                                            <IconButton
                                                icon="dots-vertical"
                                                /**
                                                 * Neutral, not the accent. The
                                                 * accent is reserved for state
                                                 * (liked, active toggles), so
                                                 * sharing it with a plain
                                                 * overflow menu diluted its
                                                 * meaning.
                                                 */
                                                iconColor={inactiveControl}
                                                size={28}
                                                onPress={handleOpenTrackMenu}
                                                style={{ margin: 0 }}
                                                accessibilityLabel="Track options"
                                            />
                                        </View>
                                    </View>
                                </>
                            )}
                        </View>

                        {/*
                          Controls.

                          The progress bar is always present, but in immersive
                          lyrics mode it drops toward the bottom edge while the
                          transport row and bottom actions collapse away - so
                          the lyrics gain that height and the bar stays
                          reachable. `chromeStyle` collapses the block and
                          `progressBarStyle` counter-moves the bar itself.
                        */}
                        <View style={{ marginBottom: COLLAPSED_HEIGHT + insets.bottom }}>

                            <Reanimated.View style={progressBarStyle}>
                                <ProgressControl
                                    activeColor={playerColors.activeColor}
                                    inactiveColor={playerColors.secondaryTextColor}
                                    textColor={playerColors.secondaryTextColor}
                                />
                            </Reanimated.View>

                            <Reanimated.View style={chromeStyle} pointerEvents={controlsHidden ? 'none' : 'auto'}>

                            {/*
                              Main transport controls.

                              Sizing follows a deliberate ramp so the primary
                              action dominates: shuffle/repeat 22, skip 34, play
                              38 inside a 64dp surface. Previously skip matched
                              the play glyph at 40 while the surface did all the
                              visual work, so the hierarchy read flat.

                              Inactive toggles also use a neutral `inactiveControl`
                              grey rather than the accent, so colour signals
                              "this is on" instead of tinting the whole row.
                            */}
                            <View style={styles.controls}>
                                <IconButton
                                    icon="shuffle"
                                    iconColor={shuffleMode ? playerColors.activeColor : inactiveControl}
                                    size={22}
                                    onPress={handleToggleShuffle}
                                    accessibilityLabel={shuffleMode ? "Disable Shuffle" : "Enable Shuffle"}
                                    accessibilityState={{ selected: shuffleMode }}
                                />
                                <IconButton
                                    icon="skip-previous"
                                    iconColor={playerColors.activeColor}
                                    size={34}
                                    onPress={playPrevious}
                                    accessibilityLabel="Previous track"
                                />
                                <Surface style={[styles.playButton, { backgroundColor: (backgroundType === 'off' || backgroundType === 'blurred') ? playerColors.activeColor : (dynamicColors ? playerColors.activeColor : playerColors.textColor) }]} elevation={0}>
                                    {isBuffering ? (
                                        <ActivityIndicator color={getContrastingIconColor((backgroundType === 'off' || backgroundType === 'blurred') ? playerColors.activeColor : (dynamicColors ? playerColors.activeColor : playerColors.textColor))} />
                                    ) : (
                                        <IconButton
                                            icon={isPlaying ? "pause" : "play"}
                                            iconColor={getContrastingIconColor((backgroundType === 'off' || backgroundType === 'blurred') ? playerColors.activeColor : (dynamicColors ? playerColors.activeColor : playerColors.textColor))}
                                            size={38}
                                            onPress={togglePlayPause}
                                            style={{ margin: 0 }}
                                            accessibilityLabel={isPlaying ? "Pause" : "Play"}
                                        />
                                    )}
                                </Surface>
                                <IconButton
                                    icon="skip-next"
                                    iconColor={playerColors.activeColor}
                                    size={34}
                                    onPress={playNext}
                                    accessibilityLabel="Next track"
                                />
                                <IconButton
                                    icon={repeatMode === 'one' ? "repeat-once" : "repeat"}
                                    iconColor={repeatMode !== 'off' ? playerColors.activeColor : inactiveControl}
                                    size={22}
                                    onPress={handleToggleRepeat}
                                    accessibilityLabel={repeatMode === 'off' ? "Enable repeat" : `Repeat ${repeatMode}`}
                                    accessibilityState={{ selected: repeatMode !== 'off' }}
                                />
                            </View>

                            {/*
                              Secondary actions.

                              These are grouped and centred rather than spread
                              edge-to-edge: `space-between` across the full
                              width gave three tertiary icons the same visual
                              weight as the transport row above.
                            */}
                            <View style={styles.bottomActions}>
                                {/* Playback Speed Button */}
                                <IconButton
                                    icon="speedometer"
                                    iconColor={playbackRate !== 1.0 ? playerColors.activeColor : inactiveControl}
                                    size={22}
                                    onPress={() => setIsSpeedDialogVisible(true)}
                                    accessibilityLabel="Playback speed"
                                />

                                <IconButton
                                    icon="microphone-variant"
                                    iconColor={isLyricsVisible ? playerColors.activeColor : inactiveControl}
                                    size={22}
                                    onPress={() => {
                                        setIsLyricsVisible(!isLyricsVisible);
                                    }}
                                    accessibilityLabel={isLyricsVisible ? "Hide lyrics" : "Show lyrics"}
                                    accessibilityState={{ selected: isLyricsVisible }}
                                />

                                {/* Sleep Timer Icon */}
                                {/* Sleep Timer Icon or Countdown */}
                                {sleepTimerTarget === 'endOfTrack' ? (
                                    <IconButton
                                        icon="power-sleep"
                                        iconColor={playerColors.activeColor}
                                        size={24}
                                        onPress={() => setIsSleepTimerVisible(true)}
                                    />
                                ) : sleepTimerTarget && typeof sleepTimerTarget === 'number' && (sleepTimerTarget as number) > Date.now() ? (
                                    <TouchableOpacity
                                        onPress={() => setIsSleepTimerVisible(true)}
                                        style={{
                                            height: 40,
                                            justifyContent: 'center',
                                            alignItems: 'center',
                                            minWidth: 40
                                        }}
                                    >
                                        <Text
                                            variant="labelLarge"
                                            style={{
                                                color: playerColors.activeColor,
                                                fontWeight: 'bold',
                                                fontVariant: ['tabular-nums']
                                            }}
                                        >
                                            {(() => {
                                                const diff = (sleepTimerTarget as number) - Date.now();
                                                const mins = Math.floor(diff / 60000);
                                                const secs = Math.floor((diff % 60000) / 1000);
                                                return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
                                            })()}
                                        </Text>
                                    </TouchableOpacity>
                                ) : (
                                    <IconButton
                                        icon="clock-time-four-outline"
                                        iconColor={inactiveControl}
                                        size={22}
                                        onPress={() => setIsSleepTimerVisible(true)}
                                        accessibilityLabel="Sleep timer"
                                    />
                                )}

                            </View>
                            </Reanimated.View>
                        </View>
                    </>
                )}{/* End Landscape Check */}
            </SafeAreaView>

            {isQueueOpen && currentTrack && (
                <Reanimated.View
                    pointerEvents="box-none"
                    style={[styles.miniPlayerOverlay, miniPlayerAnimatedStyle]}
                >
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: miniPlayerBgColor }]} pointerEvents="none" />
                    <SafeAreaView edges={['top']} style={{ flex: 1 }}>
                        <TouchableOpacity
                            activeOpacity={0.9}
                            onPress={() => {
                                queueTranslateY.value = withSpring(
                                    panelStops.peek,
                                    SPRING.SHEET_SOFT,
                                );
                            }}
                            style={styles.miniPlayerContent}
                        >
                            <View style={styles.miniPlayerArtwork}>
                                {currentTrack.imageUrl ? (
                                    <Image source={{ uri: currentTrack.imageUrl }} style={styles.miniPlayerImage} />
                                ) : (
                                    <View style={[styles.miniPlayerImage, { backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' }]}>
                                        <Icon name="music-note" size={22} color={theme.colors.onSurfaceVariant} />
                                    </View>
                                )}
                            </View>
                            <View style={styles.miniPlayerInfo}>
                                <Text numberOfLines={1} style={styles.miniPlayerTitle}>{currentTrack.name}</Text>
                                <Text numberOfLines={1} style={styles.miniPlayerArtist}>{currentTrack.artist}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={togglePlayPause}
                                style={styles.miniPlayerPlayButton}
                                accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
                            >
                                <Icon name={isPlaying ? "pause" : "play"} size={26} color="#ffffff" />
                            </TouchableOpacity>
                        </TouchableOpacity>

                        {/*
                          Progress bar pinned to the bottom edge of the mini
                          player. Kept in its own component so position ticks
                          re-render only the bar, not PlayerScreen.
                        */}
                        <View style={styles.miniPlayerProgress} pointerEvents="none">
                            <QueueMiniProgressBar color={playerColors.activeColor} />
                        </View>
                    </SafeAreaView>
                </Reanimated.View>
            )}

            <QueuePanel
                translateY={queueTranslateY}
                isQueueOpen={isQueueOpen}
                onQueueOpenChange={setIsQueueOpen}
                queue={queue}
                currentTrack={currentTrack}
                isPlaying={isPlaying}
                reorderQueue={reorderQueue}
                removeFromQueue={removeFromQueue}
                clearQueue={clearQueue}
                playTrack={playTrack}
                queueSource={queueSource}
                panelGradientColors={panelGradientColors}
                onSavePlaylist={handleSaveQueueAsPlaylist}
            />

            <ActionSheet
                visible={isSleepTimerVisible}
                onClose={() => setIsSleepTimerVisible(false)}
                title="Sleep Timer"
            >
                <View style={{ gap: 4 }}>
                    {[5, 15, 30, 45, 60].map(min => (
                        <List.Item
                            key={min}
                            title={`${min} minutes`}
                            onPress={() => {
                                setSleepTimer(min);
                                setIsSleepTimerVisible(false);
                            }}
                            left={props => <List.Icon {...props} icon="timer-outline" />}
                            titleStyle={{ color: theme.colors.onSurface }}
                        />
                    ))}
                    <List.Item
                        key="end"
                        title="End of Track"
                        onPress={() => {
                            setSleepTimer('endOfTrack');
                            setIsSleepTimerVisible(false);
                        }}
                        left={props => <List.Icon {...props} icon="skip-next-outline" />}
                        right={props => sleepTimerTarget === 'endOfTrack' ? <Icon name="check" size={24} color={theme.colors.primary} /> : null}
                        titleStyle={{ color: theme.colors.onSurface }}
                    />
                    <List.Item
                        key="off"
                        title="Turn Off Timer"
                        onPress={() => {
                            setSleepTimer(null);
                            setIsSleepTimerVisible(false);
                        }}
                        left={props => <List.Icon {...props} icon="close" />}
                        titleStyle={{ color: theme.colors.error }}
                    />
                </View>
            </ActionSheet>

            <ActionSheet
                visible={isSpeedDialogVisible}
                onClose={() => setIsSpeedDialogVisible(false)}
                title="Playback Speed"
            >
                <View style={{ gap: 4 }}>
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0].map(speed => (
                        <List.Item
                            key={speed}
                            title={`${speed}x`}
                            onPress={() => {
                                setPlaybackRate(speed);
                                setIsSpeedDialogVisible(false);
                            }}
                            left={props => (
                                <List.Icon
                                    {...props}
                                    icon={playbackRate === speed ? "check-circle" : "speedometer"}
                                    color={playbackRate === speed ? theme.colors.primary : undefined}
                                />
                            )}
                            titleStyle={{
                                color: playbackRate === speed ? theme.colors.primary : theme.colors.onSurface,
                                fontWeight: playbackRate === speed ? 'bold' : 'normal'
                            }}
                        />
                    ))}
                </View>
            </ActionSheet>

            <ActionSheet visible={isSubmenuVisible} onClose={() => setIsSubmenuVisible(false)} title="Track Options">
                <View style={{ gap: 4 }}>
                    <List.Item
                        title="Play Next"
                        description="Add to queue after current song"
                        left={props => <List.Icon {...props} icon="playlist-play" />}
                        onPress={() => { usePlayerStore.getState().addToQueueNext(currentTrack); setIsSubmenuVisible(false); }}
                    />
                    <List.Item
                        title="Add to Queue"
                        description="Add to end of queue"
                        left={props => <List.Icon {...props} icon="playlist-plus" />}
                        onPress={handleAddToQueue}
                    />

                    <List.Item
                        title={isPlayingFromPlaylist ? "Add to another playlist" : "Add to Playlist"}
                        description={!isPlayingFromPlaylist ? "Save to a playlist" : undefined}
                        left={props => <List.Icon {...props} icon="playlist-music" />}
                        onPress={() => {
                            setTimeout(() => handleAddToPlaylistOpen(), 300);
                        }}
                    />

                    {isPlayingFromPlaylist && (
                        <List.Item
                            title="Remove from this playlist"
                            titleStyle={{ color: theme.colors.error }}
                            left={props => <List.Icon {...props} icon="playlist-remove" color={theme.colors.error} />}
                            onPress={() => {
                                setIsSubmenuVisible(false);
                                setTimeout(() => setIsRemoveConfirmVisible(true), 300);
                            }}
                        />
                    )}

                    {dataSource !== 'local' && (
                        <List.Item
                            title="Download"
                            description="Save for offline listening"
                            left={props => <List.Icon {...props} icon="download" />}
                            onPress={() => {
                                if (currentTrack) {
                                    downloadService.queueTrack({
                                        id: currentTrack.id,
                                        name: currentTrack.name,
                                        artist: currentTrack.artist || 'Unknown Artist',
                                        album: currentTrack.album || 'Unknown Album',
                                        imageUrl: currentTrack.imageUrl || '',
                                        durationMillis: currentTrack.durationMillis,
                                    }).catch(console.error);
                                }
                                setIsSubmenuVisible(false);
                            }}
                        />
                    )}

                    <List.Item
                        title={dataSource === 'local' ? "Delete from Device" : "Delete from Server"}
                        description={dataSource !== 'local' ? "Permanently delete file" : undefined}
                        titleStyle={{ color: theme.colors.error }}
                        left={props => <List.Icon {...props} icon="delete-forever" color={theme.colors.error} />}
                        onPress={() => {
                            setIsSubmenuVisible(false);
                            if (dataSource === 'local') {
                                setTimeout(() => setIsDeleteConfirmVisible(true), 300);
                            } else {
                                setTimeout(() => {
                                    Alert.alert(
                                        'Delete from Server',
                                        'Are you sure you want to permanently delete this file from your Jellyfin server? This cannot be undone.',
                                        [
                                            { text: 'Cancel', style: 'cancel' },
                                            {
                                                text: 'Delete',
                                                style: 'destructive',
                                                onPress: async () => {
                                                    try {
                                                        await jellyfinApi.deleteItem(currentTrack!.id);
                                                        usePlayerStore.getState().playNext();
                                                    } catch (error: any) {
                                                        console.error('Delete failed:', error);
                                                        Alert.alert('Error', `Failed to delete item: ${error?.message || 'Unknown error'}`);
                                                    }
                                                }
                                            }
                                        ]
                                    );
                                }, 300);
                            }
                        }}
                    />
                </View>
            </ActionSheet>

            <ActionSheet visible={isAddToPlaylistVisible} onClose={() => setIsAddToPlaylistVisible(false)} title="Add to Playlist" scrollable>
                <View style={{ gap: 4 }}>
                    {playlists.map(playlist => (
                        <List.Item
                            key={playlist.Id}
                            title={playlist.Name}
                            left={props => <List.Icon {...props} icon="playlist-music" />}
                            onPress={() => handleAddToPlaylist(playlist.Id)}
                        />
                    ))}
                </View>
            </ActionSheet>

            <ActionSheet visible={isDuplicateDialogVisible} onClose={() => setIsDuplicateDialogVisible(false)} title="Duplicate Song" heightPercentage={30}>
                <View style={{ gap: 16 }}>
                    <Text variant="bodyMedium">This song is already in the playlist. Do you want to add it anyway?</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                        <Button mode="text" onPress={() => setIsDuplicateDialogVisible(false)}>Cancel</Button>
                        <Button mode="contained" onPress={() => {
                            if (pendingPlaylistId) confirmAddToPlaylist(pendingPlaylistId);
                        }}>Add Anyway</Button>
                    </View>
                </View>
            </ActionSheet>

            <ActionSheet visible={isRemoveConfirmVisible} onClose={() => setIsRemoveConfirmVisible(false)} title="Remove from Playlist" heightPercentage={30}>
                <View style={{ gap: 16 }}>
                    <Text variant="bodyMedium">Are you sure you want to remove this song from the playlist?</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                        <Button mode="text" onPress={() => setIsRemoveConfirmVisible(false)}>Cancel</Button>
                        <Button mode="contained" buttonColor={theme.colors.error} onPress={confirmRemoveFromPlaylist}>Remove</Button>
                    </View>
                </View>
            </ActionSheet>

            <ActionSheet visible={isDeleteConfirmVisible} onClose={() => setIsDeleteConfirmVisible(false)} title="Delete from Device" heightPercentage={30}>
                <View style={{ gap: 16 }}>
                    <Text variant="bodyMedium">Are you sure you want to delete this file from your device? This action cannot be undone.</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                        <Button mode="text" onPress={() => setIsDeleteConfirmVisible(false)}>Cancel</Button>
                        <Button mode="contained" buttonColor={theme.colors.error} onPress={handleDeleteTrack}>Delete</Button>
                    </View>
                </View>
            </ActionSheet>

            {/* AddToPlaylistDialog Component Removed/Inline */}

            {/* Orientation Transition Curtain */}
            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    {
                        opacity: layoutOpacity.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 0] // 0 (hidden) -> 1 (visible) -> 0 (hidden)
                        }),
                        zIndex: 9999
                    }
                ]}
            >
                {/* Background Color Base */}
                <View style={[StyleSheet.absoluteFill, { backgroundColor: dynamicColors?.backgroundColor || '#1a1a1a' }]} />

                {/* Gradient Overlay - Match main player exactly */}
                <LinearGradient
                    colors={dynamicColors?.gradientColors || [`${safeThemeColor}15`, 'rgba(0,0,0,0.95)']}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                />
            </Animated.View>
            <Portal>
                <Snackbar
                    visible={snackbarVisible}
                    onDismiss={() => setSnackbarVisible(false)}
                    duration={3000}
                    action={{
                        label: 'OK',
                        onPress: () => setSnackbarVisible(false),
                    }}
                >
                    Successfully added to playlist
                </Snackbar>
            </Portal>
        </View >
    );
});

export default PlayerScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a1a',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        overflow: 'hidden',
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
        paddingTop: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        /**
         * Tight on purpose. The header now only carries the dismiss chevron
         * (plus the Lyrics label in lyrics mode), so it should take as little
         * height as possible and hand the rest to the artwork. `height` is
         * fixed rather than `minHeight` so the Material IconButton's default
         * 48dp touch target cannot inflate it.
         */
        height: 36,
        marginBottom: 4,
    },
    artworkContainer: {
        alignItems: 'center',
        marginBottom: 16,
    },
    artworkSurface: {
        elevation: 8,
        borderRadius: 12,
        backgroundColor: 'transparent',
    },
    artwork: {
        // width: width - 80,
        // height: width - 80, 
        // Use inline styles for dynamic sizing
        width: 300,
        height: 300,
        borderRadius: 12,
        backgroundColor: '#2a2a2a',
    },
    trackInfo: {
        marginBottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    playButton: {
        width: 64,
        height: 64,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 4,
    },
    bottomActions: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 28,
        marginTop: 4,
    },
    queueList: {
        paddingVertical: 10,
    },
    queueItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 8,
        marginBottom: 8,
    },
    queueImage: {
        width: 48,
        height: 48,
        borderRadius: 4,
        marginRight: 12,
    },
    miniPlayerOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0,
        zIndex: 101,
    },
    miniPlayerContent: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 16,
    },
    miniPlayerArtwork: {
        marginRight: 12,
    },
    miniPlayerImage: {
        width: 48,
        height: 48,
        borderRadius: 8,
    },
    miniPlayerInfo: {
        flex: 1,
        justifyContent: 'center',
        alignSelf: 'center',
        marginRight: 4,
    },
    miniPlayerTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#FFFFFF',
    },
    miniPlayerArtist: {
        fontSize: 12.5,
        color: 'rgba(255,255,255,0.7)',
        marginTop: 2,
    },
    miniPlayerPlayButton: {
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'center',
    },
    miniPlayerProgress: {
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
    },
});
