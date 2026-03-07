import React, { useEffect, useState, useMemo, useRef, useLayoutEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions, Image, Animated, PanResponder, LayoutAnimation, Platform, UIManager, Alert } from 'react-native';
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
import { useLocalLibraryStore } from '../store/localLibraryStore';
import { DatabaseService } from '../services/DatabaseService';
import { audioService } from '../services/AudioService';
import { downloadService } from '../services/DownloadService';
import { ScrollView } from 'react-native';
import ActionSheet from '../components/ActionSheet';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EqualizerAnimation } from '../components/EqualizerAnimation';
import LyricsView from '../components/LyricsView';
import ArtworkCarousel from '../components/ArtworkCarousel';
import { ProgressControl } from '../components/ProgressControl';
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

interface PlayerScreenProps {
    isGlobal?: boolean;
}

export default function PlayerScreen({ isGlobal }: PlayerScreenProps = {}) {
    // Select specific fields to avoid re-rendering on positionMillis updates
    const { currentTrack, isPlaying, togglePlayPause, playNext, playPrevious, toggleShuffle, toggleRepeat, shuffleMode, repeatMode, queueLength, playTrack, sleepTimerTarget, setSleepTimer } = usePlayerStore(useShallow(state => ({
        currentTrack: state.currentTrack,
        isPlaying: state.isPlaying,
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
    })));
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const theme = useTheme();
    const { backgroundType, themeColor, showTechnicalDetails, audioQuality, playbackRate, setPlaybackRate } = useSettingsStore(useShallow(s => ({
        backgroundType: s.backgroundType,
        themeColor: s.themeColor,
        showTechnicalDetails: s.showTechnicalDetails,
        audioQuality: s.audioQuality,
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

        // Only fetch if background type is blurhash (dynamic colors enabled) AND app is active
        if (backgroundType !== 'blurhash' || !imageUrl || !isAppActive) {
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
        if (!extractedColors || backgroundType !== 'blurhash') {
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

    // A/B Layer swap pattern for flash-free transitions
    // Layer A and Layer B alternate: we only change colors on the HIDDEN layer
    const [layerAColor, setLayerAColor] = useState<string>('#1a1a1a');
    const [layerBColor, setLayerBColor] = useState<string>('#1a1a1a');
    const [layerAGradient, setLayerAGradient] = useState<[string, string]>(['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)']);
    const [layerBGradient, setLayerBGradient] = useState<[string, string]>(['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)']);

    // 0 = Layer A on top (visible), Layer B hidden
    // 1 = Layer B on top (visible), Layer A hidden
    const layerBOpacity = useRef(new Animated.Value(0)).current;
    const activeLayerRef = useRef<'A' | 'B'>('A'); // Which layer is currently visible
    const isFirstRender = useRef(true);
    const pendingAnimationRef = useRef<number | null>(null);

    // Animate when background color changes
    useEffect(() => {
        if (!dynamicColors?.backgroundColor) {
            return;
        }

        const newColor = dynamicColors.backgroundColor;
        const newGradient: [string, string] = dynamicColors.gradientColors;

        // Get current visible color
        const currentVisibleColor = activeLayerRef.current === 'A' ? layerAColor : layerBColor;

        // Skip animation on first render - just set colors directly
        if (isFirstRender.current) {
            isFirstRender.current = false;
            setLayerAColor(newColor);
            setLayerAGradient(newGradient);
            setLayerBColor(newColor);
            setLayerBGradient(newGradient);
            layerBOpacity.setValue(0); // Layer A visible
            activeLayerRef.current = 'A';
            return;
        }

        if (newColor !== currentVisibleColor) {
            // Clear any pending animation
            if (pendingAnimationRef.current) {
                clearTimeout(pendingAnimationRef.current);
            }

            if (activeLayerRef.current === 'A') {
                // Layer A is visible, update Layer B (hidden) with new color, then fade it in
                setLayerBColor(newColor);
                setLayerBGradient(newGradient);

                // Wait for state to settle, then animate Layer B in
                pendingAnimationRef.current = setTimeout(() => {
                    Animated.timing(layerBOpacity, {
                        toValue: 1,
                        duration: 500,
                        useNativeDriver: true,
                    }).start(() => {
                        activeLayerRef.current = 'B';
                    });
                    pendingAnimationRef.current = null;
                }, 32) as unknown as number;
            } else {
                // Layer B is visible, update Layer A (hidden) with new color, then fade Layer B out
                setLayerAColor(newColor);
                setLayerAGradient(newGradient);

                // Wait for state to settle, then animate Layer B out (reveals Layer A)
                pendingAnimationRef.current = setTimeout(() => {
                    Animated.timing(layerBOpacity, {
                        toValue: 0,
                        duration: 500,
                        useNativeDriver: true,
                    }).start(() => {
                        activeLayerRef.current = 'A';
                    });
                    pendingAnimationRef.current = null;
                }, 32) as unknown as number;
            }
        }

        return () => {
            if (pendingAnimationRef.current) {
                clearTimeout(pendingAnimationRef.current);
            }
        };
    }, [dynamicColors?.backgroundColor]);



    // Local state
    const [isBuffering, setIsBuffering] = useState(false);
    const [isLyricsVisible, setIsLyricsVisible] = useState(false);
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

    // Get updateTrackFavorite from store
    const updateTrackFavorite = usePlayerStore(state => state.updateTrackFavorite);

    // Get dataSource to check if we're in local mode
    const { dataSource } = useSettingsStore();

    // Check if current track is a local track (needed for like functionality)
    const isLocalTrack = currentTrack?.streamUrl?.startsWith('file://') ||
        currentTrack?.streamUrl?.startsWith('content://') ||
        currentTrack?.id?.startsWith('local_');

    // Get favorite status - check local library for local tracks
    const isFavorite = isLocalTrack
        ? localLibrary.isFavorite(currentTrack?.id || '')
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
        <View style={[styles.container, { backgroundColor: dynamicColors?.backgroundColor || '#1a1a1a' }]}>
            {/* Background Layer */}
            {backgroundType === 'blurhash' ? (
                // A/B Layer swap: Layer A always at bottom, Layer B fades on top
                <>
                    {/* Layer A (bottom) */}
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: layerAColor, width: '100%', height: '100%' }]} />
                    {/* Layer B (top, animates opacity) */}
                    <Animated.View
                        style={[
                            StyleSheet.absoluteFill,
                            {
                                backgroundColor: layerBColor,
                                opacity: layerBOpacity,
                                width: '100%', height: '100%'
                            }
                        ]}
                    />
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
                // Dark grey background for 'off' mode
                <View style={[StyleSheet.absoluteFill, { backgroundColor: '#1a1a1a' }]} />
            )}

            {/* Gradient Overlay with A/B layer swap */}
            {backgroundType === 'blurhash' ? (
                <>
                    {/* Layer A gradient (bottom) */}
                    <LinearGradient
                        colors={layerAGradient}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 0, y: 1 }}
                    />
                    {/* Layer B gradient (top, animates opacity) */}
                    <Animated.View style={[StyleSheet.absoluteFill, { opacity: layerBOpacity }]}>
                        <LinearGradient
                            colors={layerBGradient}
                            style={StyleSheet.absoluteFill}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 0, y: 1 }}
                        />
                    </Animated.View>
                </>
            ) : (
                <LinearGradient
                    colors={
                        backgroundType === 'blurred'
                            ? ['rgba(0,0,0,0.3)', 'rgba(0,0,0,0.8)']
                            : [`${safeThemeColor}15`, 'rgba(0,0,0,0.95)']
                    }
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                />
            )}

            {/* Dark overlay when lyrics are visible to improve text contrast against bright artwork */}
            {isLyricsVisible && (
                <View
                    style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.65)' }]}
                    pointerEvents="none"
                />
            )}

            {/* Content wrapped in SafeAreaView */}
            <SafeAreaView style={styles.content} edges={['top', 'bottom']}>
                {/* Header - only show in portrait */}
                {!isLandscape && (
                    <View style={styles.header}>
                        <IconButton
                            icon="chevron-down"
                            iconColor={playerColors.iconColor}
                            size={32}
                            onPress={handleClosePlayer}
                        />
                        <Text variant="titleMedium" style={{ color: playerColors.textColor, fontWeight: 'bold' }}>
                            {isLyricsVisible ? 'Lyrics' : 'Now Playing'}
                        </Text>
                        <View style={{ width: 48 }} />
                    </View>
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
                                />
                            ) : (
                                <View style={{ width: '100%', aspectRatio: 1, maxHeight: height * 0.85, alignItems: 'center', justifyContent: 'center' }}>
                                    <ArtworkCarousel size={Math.min(height * 0.8, width * 0.38)} borderRadius={12} />
                                </View>
                            )}
                        </View>

                        {/* RIGHT COLUMN: Controls Layout */}
                        <View style={{ flex: 0.55, justifyContent: 'space-between', paddingLeft: 8, paddingVertical: 16 }}>
                            {/* Progress at TOP */}
                            <ProgressControl
                                activeColor={playerColors.activeColor}
                                inactiveColor={playerColors.secondaryTextColor}
                                textColor={playerColors.secondaryTextColor}
                            />

                            {/* Track Info - centered */}
                            <View style={{ alignItems: 'center', marginVertical: 8 }}>
                                <Text variant="headlineSmall" style={{ color: playerColors.textColor, fontWeight: 'bold', textAlign: 'center' }} numberOfLines={1}>
                                    {currentTrack.name}
                                </Text>
                                <TouchableOpacity onPress={handleArtistPress}>
                                    <Text variant="bodyMedium" style={{ color: playerColors.secondaryTextColor, textAlign: 'center' }} numberOfLines={1}>
                                        {currentTrack.artist}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {/* Main Controls - evenly spaced */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', paddingHorizontal: 8 }}>
                                <IconButton
                                    icon={repeatMode === 'one' ? "repeat-once" : "repeat"}
                                    iconColor={repeatMode !== 'off' ? playerColors.activeColor : playerColors.secondaryTextColor}
                                    size={24}
                                    onPress={handleToggleRepeat}
                                    accessibilityLabel={repeatMode === 'one' ? "Repeat One" : repeatMode === 'all' ? "Repeat All" : "Repeat Off"}
                                />
                                <IconButton
                                    icon="skip-previous"
                                    iconColor={(backgroundType === 'off' || backgroundType === 'blurred') ? playerColors.activeColor : (dynamicColors ? playerColors.activeColor : playerColors.iconColor)}
                                    size={32}
                                    onPress={playPrevious}
                                    accessibilityLabel="Previous Track"
                                />
                                <Surface style={[styles.playButton, { width: 56, height: 56, backgroundColor: (backgroundType === 'off' || backgroundType === 'blurred') ? playerColors.activeColor : (dynamicColors ? playerColors.activeColor : playerColors.textColor) }]} elevation={0}>
                                    {isBuffering ? (
                                        <ActivityIndicator color={getContrastingIconColor((backgroundType === 'off' || backgroundType === 'blurred') ? playerColors.activeColor : (dynamicColors ? playerColors.activeColor : playerColors.textColor))} />
                                    ) : (
                                        <IconButton
                                            icon={isPlaying ? "pause" : "play"}
                                            iconColor={getContrastingIconColor((backgroundType === 'off' || backgroundType === 'blurred') ? playerColors.activeColor : (dynamicColors ? playerColors.activeColor : playerColors.textColor))}
                                            size={32}
                                            onPress={togglePlayPause}
                                            style={{ margin: 0 }}
                                            accessibilityLabel={isPlaying ? "Pause" : "Play"}
                                        />
                                    )}
                                </Surface>
                                <IconButton
                                    icon="skip-next"
                                    iconColor={(backgroundType === 'off' || backgroundType === 'blurred') ? playerColors.activeColor : (dynamicColors ? playerColors.activeColor : playerColors.iconColor)}
                                    size={32}
                                    onPress={playNext}
                                    accessibilityLabel="Next Track"
                                />
                                <IconButton
                                    icon="shuffle"
                                    iconColor={shuffleMode ? playerColors.activeColor : playerColors.secondaryTextColor}
                                    size={24}
                                    onPress={toggleShuffle}
                                />
                            </View>

                            {/* Down Arrow to close */}
                            <View style={{ alignItems: 'center', marginTop: 8 }}>
                                <IconButton
                                    icon="chevron-down"
                                    iconColor={playerColors.secondaryTextColor}
                                    size={28}
                                    onPress={() => navigation.goBack()}
                                />
                            </View>

                            {/* Bottom Actions */}
                            <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', paddingHorizontal: 16 }}>
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
                                    icon="playlist-music"
                                    iconColor={playerColors.secondaryTextColor}
                                    size={22}
                                    onPress={() => {
                                        navigation.navigate('Queue');
                                        setIsLyricsVisible(false);
                                    }}
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
                                />
                            ) : (
                                <>
                                    <View style={styles.artworkContainer}>
                                        <ArtworkCarousel size={width - 80} borderRadius={12} />
                                    </View>

                                    <View style={styles.trackInfo}>
                                        <View style={{ flex: 1 }}>
                                            <Text variant="headlineSmall" style={{ color: playerColors.textColor, fontWeight: 'bold' }} numberOfLines={1}>
                                                {currentTrack.name}
                                            </Text>
                                            <TouchableOpacity onPress={handleArtistPress}>
                                                <Text variant="bodyMedium" style={{ color: playerColors.secondaryTextColor }}>
                                                    {currentTrack.artist}
                                                </Text>
                                            </TouchableOpacity>

                                            {showTechnicalDetails && (() => {
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
                                                        {isAutoMode && (
                                                            <View style={{ borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: 'rgba(100,200,100,0.2)' }}>
                                                                <Text variant="labelSmall" style={{ color: playerColors.activeColor, fontSize: 10 }}>
                                                                    AUTO
                                                                </Text>
                                                            </View>
                                                        )}
                                                        {displayCodec && (
                                                            <View style={{ borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.1)' }}>
                                                                <Text variant="labelSmall" style={{ color: playerColors.secondaryTextColor, fontSize: 10 }}>
                                                                    {displayCodec}
                                                                </Text>
                                                            </View>
                                                        )}
                                                        {displayBitrate && (
                                                            <View style={{ borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.1)' }}>
                                                                <Text variant="labelSmall" style={{ color: playerColors.secondaryTextColor, fontSize: 10 }}>
                                                                    {`${displayBitrate} kbps`}
                                                                </Text>
                                                            </View>
                                                        )}
                                                        {displayContainer && displayContainer !== currentTrack.codec && (
                                                            <View style={{ borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, backgroundColor: 'rgba(255,255,255,0.1)' }}>
                                                                <Text variant="labelSmall" style={{ color: playerColors.secondaryTextColor, fontSize: 10 }}>
                                                                    {displayContainer.toUpperCase()}
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                );
                                            })()}
                                        </View>
                                        <IconButton
                                            icon={isFavorite ? "heart" : "heart-outline"}
                                            iconColor={playerColors.activeColor}
                                            size={28}
                                            onPress={handleLike}
                                            accessibilityLabel={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                                        />
                                        <IconButton
                                            icon="dots-vertical"
                                            iconColor={playerColors.activeColor}
                                            size={28}
                                            onPress={handleOpenTrackMenu}
                                        />
                                    </View>
                                </>
                            )}
                        </View>

                        {/* Controls (Always Visible) */}
                        <View>

                            <ProgressControl
                                activeColor={playerColors.activeColor}
                                inactiveColor={playerColors.secondaryTextColor}
                                textColor={playerColors.secondaryTextColor}
                            />

                            <View style={styles.controls}>
                                <IconButton
                                    icon="shuffle"
                                    iconColor={shuffleMode ? playerColors.activeColor : playerColors.secondaryTextColor}
                                    size={24}
                                    onPress={handleToggleShuffle}
                                    accessibilityLabel={shuffleMode ? "Disable Shuffle" : "Enable Shuffle"}
                                />
                                <IconButton
                                    icon="skip-previous"
                                    iconColor={(backgroundType === 'off' || backgroundType === 'blurred') ? playerColors.activeColor : (dynamicColors ? playerColors.activeColor : playerColors.iconColor)}
                                    size={40}
                                    onPress={playPrevious}
                                />
                                <Surface style={[styles.playButton, { backgroundColor: (backgroundType === 'off' || backgroundType === 'blurred') ? playerColors.activeColor : (dynamicColors ? playerColors.activeColor : playerColors.textColor) }]} elevation={0}>
                                    {isBuffering ? (
                                        <ActivityIndicator color={getContrastingIconColor((backgroundType === 'off' || backgroundType === 'blurred') ? playerColors.activeColor : (dynamicColors ? playerColors.activeColor : playerColors.textColor))} />
                                    ) : (
                                        <IconButton
                                            icon={isPlaying ? "pause" : "play"}
                                            iconColor={getContrastingIconColor((backgroundType === 'off' || backgroundType === 'blurred') ? playerColors.activeColor : (dynamicColors ? playerColors.activeColor : playerColors.textColor))}
                                            size={40}
                                            onPress={togglePlayPause}
                                            style={{ margin: 0 }}
                                        />
                                    )}
                                </Surface>
                                <IconButton
                                    icon="skip-next"
                                    iconColor={(backgroundType === 'off' || backgroundType === 'blurred') ? playerColors.activeColor : (dynamicColors ? playerColors.activeColor : playerColors.iconColor)}
                                    size={40}
                                    onPress={playNext}
                                />
                                <IconButton
                                    icon={repeatMode === 'one' ? "repeat-once" : "repeat"}
                                    iconColor={repeatMode !== 'off' ? playerColors.activeColor : playerColors.secondaryTextColor}
                                    size={24}
                                    onPress={toggleRepeat}
                                />
                            </View>

                            <View style={styles.bottomActions}>
                                {/* Playback Speed Button */}
                                <IconButton
                                    icon="speedometer"
                                    iconColor={playbackRate !== 1.0 ? playerColors.activeColor : playerColors.secondaryTextColor}
                                    size={24}
                                    onPress={() => setIsSpeedDialogVisible(true)}
                                />

                                <IconButton
                                    icon="microphone-variant"
                                    iconColor={isLyricsVisible ? playerColors.activeColor : playerColors.secondaryTextColor}
                                    size={24}
                                    onPress={() => {
                                        setIsLyricsVisible(!isLyricsVisible);
                                    }}
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
                                        iconColor={playerColors.secondaryTextColor}
                                        size={24}
                                        onPress={() => setIsSleepTimerVisible(true)}
                                    />
                                )}

                                <IconButton
                                    icon="playlist-music"
                                    iconColor={playerColors.secondaryTextColor}
                                    size={24}
                                    onPress={() => {
                                        navigation.navigate('Queue');
                                        setIsLyricsVisible(false);
                                    }}
                                />
                            </View>
                        </View>
                    </>
                )}{/* End Landscape Check */}
            </SafeAreaView>

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
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1a1a1a',
    },
    content: {
        flex: 1,
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    artworkContainer: {
        alignItems: 'center',
        marginBottom: 30,
        // height: width - 80, // Moved to inline style via dynamic height/width from hook
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
        marginBottom: 30,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
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
        justifyContent: 'space-between',
        marginTop: 10,
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
});
