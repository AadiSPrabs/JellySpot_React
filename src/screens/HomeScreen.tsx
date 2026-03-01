import React, { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, ScrollView, Animated, TouchableOpacity, Alert, Pressable, useWindowDimensions, LayoutAnimation, Platform, UIManager, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Text, Card, Avatar, useTheme, IconButton, Button, Surface, Portal, Dialog, TextInput, List } from 'react-native-paper';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { useAuthStore } from '../store/authStore';
import { usePlayerStore } from '../store/playerStore';
import { jellyfinApi } from '../api/jellyfin';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HomeStackParamList } from '../types/navigation';
import { EqualizerAnimation } from '../components/EqualizerAnimation';
import { EmptyState } from '../components/EmptyState';
import { HomeScreenSkeleton } from '../components/Skeleton';
import { SourceSwitcher } from '../components/SourceSwitcher';
import { SongItem } from '../components/SongItem';
import { useSettingsStore } from '../store/settingsStore';
import { useLocalLibraryStore } from '../store/localLibraryStore';
import { DatabaseService } from '../services/DatabaseService';
import { downloadService } from '../services/DownloadService';
import * as ImagePicker from 'expo-image-picker';
import { LEFT_BAR_WIDTH } from '../navigation/MainNavigator';
import { dialogStyles } from '../utils/dialogStyles';
import ActionSheet from '../components/ActionSheet';

import { useShallow } from 'zustand/react/shallow';
import { MediaItem } from '../types/track';


// Get greeting based on time of day
const getGreeting = (): string => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 21) return 'Good evening';
    return 'Good night';
};

const getQuirkySubtitle = (): string => {
    const hour = new Date().getHours();
    const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

    if (hour >= 5 && hour < 12) {
        return getRandom([
            "Rise and shine! ☀️",
            "Coffee first, music second. ☕",
            "Let's start the day right.",
            "Morning vibes loading... 🔋",
            "Ready to conquer the day?"
        ]);
    }
    if (hour >= 12 && hour < 17) {
        return getRandom([
            "Keep the momentum going. 🚀",
            "Focus mode: ON. 🎧",
            "Afternoon jams incoming.",
            "Sun's out, music's up. 🌤️",
            "Power through the slump!"
        ]);
    }
    if (hour >= 17 && hour < 21) {
        return getRandom([
            "Unwind time. 🍷",
            "Relax and listen. 🛋️",
            "Evening chill session.",
            "The perfect sunset soundtrack. 🌅",
            "You earned this break."
        ]);
    }
    return getRandom([
        "Late night vibes. 🌙",
        "The world is quiet. 🤫",
        "Just you and the music.",
        "Owl mode activated. 🦉",
        "Dreamy soundscapes."
    ]);
};

// ImageWithFallback component - handles failed image loads
const ImageWithFallback = ({
    uri,
    style,
    fallbackIcon = 'music-note',
    iconSize = 40,
    iconColor,
    backgroundColor,
    borderRadius = 0
}: {
    uri: string | undefined;
    style: any;
    fallbackIcon?: string;
    iconSize?: number;
    iconColor: string;
    backgroundColor: string;
    borderRadius?: number;
}) => {
    const [hasError, setHasError] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);

    if (!uri || hasError) {
        return (
            <View style={[style, { backgroundColor, justifyContent: 'center', alignItems: 'center', borderRadius, overflow: 'hidden' }]}>
                <Icon name={fallbackIcon as any} size={iconSize} color={iconColor} />
            </View>
        );
    }

    return (
        <View style={[style, { borderRadius, overflow: 'hidden' }]}>
            <Image
                source={{ uri }}
                style={[style, { position: 'absolute', borderRadius }]}
                onError={() => setHasError(true)}
                onLoad={() => setIsLoading(false)}
            />
            {isLoading && (
                <View style={[style, { backgroundColor, justifyContent: 'center', alignItems: 'center', position: 'absolute', borderRadius }]}>
                    <Icon name={fallbackIcon as any} size={iconSize} color={iconColor} />
                </View>
            )}
        </View>
    );
};

// Track if animation has played globally (persists across re-renders and HMR)
const animationState = { hasPlayed: false };

export default function HomeScreen() {
    const [latestMusic, setLatestMusic] = useState<MediaItem[]>([]);
    const [resumeItems, setResumeItems] = useState<MediaItem[]>([]);
    const [recommendations, setRecommendations] = useState<MediaItem[]>([]);
    const [recommendedArtists, setRecommendedArtists] = useState<MediaItem[]>([]);
    const [mostPlayed, setMostPlayed] = useState<MediaItem[]>([]); // For local mode
    const [recentlyPlayed, setRecentlyPlayed] = useState<MediaItem[]>([]); // For local mode
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Animations
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(20)).current;
    const { dataSource, sourceMode, localProfile, setLocalProfile } = useSettingsStore();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    const columnCardWidth = (width - LEFT_BAR_WIDTH - 48) / 3 - 10;
    const horizontalItemsCount = isLandscape ? 4 : 3;
    const numColumns = isLandscape ? Math.floor(width / 180) : 1; // Calculate grid columns based on width

    // View tracking to delay rendering until layout is ready in landscape
    const [isLayoutReady, setIsLayoutReady] = useState(!isLandscape);
    const layoutOpacity = useRef(new Animated.Value(isLandscape ? 0 : 1)).current;

    useLayoutEffect(() => {
        if (!isLandscape) {
            setIsLayoutReady(true);
            layoutOpacity.setValue(1);
            return;
        }

        setIsLayoutReady(false);
        layoutOpacity.setValue(0);

        const timeout = setTimeout(() => {
            Animated.timing(layoutOpacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }).start(() => setIsLayoutReady(true));
        }, 250); // 250ms delay allows layout to fully recalculate

        return () => clearTimeout(timeout);
    }, [isLandscape, layoutOpacity]);

    const user = useAuthStore((state) => state.user);
    const logout = useAuthStore((state) => state.logout);
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
    const theme = useTheme();
    const { playTrack, setQueue, currentTrack, isPlaying, addToQueueNext, addToQueueEnd, playbackError, clearPlaybackError } = usePlayerStore(useShallow(state => ({
        playTrack: state.playTrack,
        setQueue: state.setQueue,
        currentTrack: state.currentTrack,
        isPlaying: state.isPlaying,
        addToQueueNext: state.addToQueueNext,
        addToQueueEnd: state.addToQueueEnd,
        playbackError: state.playbackError,
        clearPlaybackError: state.clearPlaybackError,
    })));

    // Profile edit dialog state (for local-only mode)
    const [profileDialogVisible, setProfileDialogVisible] = useState(false);
    const [editName, setEditName] = useState(localProfile.name);

    // Track menu state (for Quick Picks songs)
    const [selectedTrack, setSelectedTrack] = useState<MediaItem | null>(null);
    const [isTrackMenuVisible, setIsTrackMenuVisible] = useState(false);
    const [isAddToPlaylistVisible, setIsAddToPlaylistVisible] = useState(false);
    const [playlists, setPlaylists] = useState<any[]>([]);
    const [isDuplicateDialogVisible, setIsDuplicateDialogVisible] = useState(false);
    const [pendingPlaylistId, setPendingPlaylistId] = useState<string | null>(null);
    const [isAddingToPlaylist, setIsAddingToPlaylist] = useState(false);

    // Multi-select mode state
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
    const [isSelectionMenuVisible, setIsSelectionMenuVisible] = useState(false);

    const isLocalOnlyMode = sourceMode === 'local';
    // Show settings icon when: local-only mode OR ('both' mode AND not authenticated to Jellyfin)
    const showSettingsIcon = isLocalOnlyMode || (sourceMode === 'both' && !isAuthenticated);

    const handleProfilePress = () => {
        if (isLocalOnlyMode) {
            setEditName(localProfile.name);
            setProfileDialogVisible(true);
        } else {
            navigation.navigate('Settings');
        }
    };

    const handleSaveProfile = () => {
        setLocalProfile({ name: editName.trim() || 'User' });
        setProfileDialogVisible(false);
    };

    const handlePickImage = async () => {
        // Request permission
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Denied', 'We need access to your photos to set a profile picture.');
            return;
        }

        // Launch image picker
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
            setLocalProfile({ imageUri: result.assets[0].uri });
        }
    };

    // Track menu handlers
    const openTrackMenu = (track: MediaItem) => {
        setSelectedTrack(track);
        setIsTrackMenuVisible(true);
    };

    // Helper to convert MediaItem to Track format for player
    const mediaItemToTrack = (item: MediaItem) => {
        const isLocal = dataSource === 'local' && item.streamUrl;

        // For Jellyfin, use MediaSources; for local, use direct properties
        const bitrate = isLocal ? item.bitrate : item.MediaSources?.[0]?.Bitrate;
        const codec = isLocal ? item.codec : (item.MediaSources?.[0]?.Codec || item.MediaSources?.[0]?.MediaStreams?.find(s => s.Type === 'Audio')?.Codec);

        return {
            id: item.Id,
            name: item.Name,
            artist: item.AlbumArtist || item.Artists?.[0] || 'Unknown',
            album: item.Album || 'Unknown',
            imageUrl: isLocal ? (item.imageUrl || '') : jellyfinApi.getImageUrl(item.Id),
            imageBlurHash: item.ImageBlurHashes?.Primary ? Object.values(item.ImageBlurHashes.Primary)[0] as string : undefined,
            durationMillis: item.RunTimeTicks ? item.RunTimeTicks / 10000 : 0,
            streamUrl: isLocal ? (item.streamUrl || '') : '',
            artistId: item.ArtistItems?.[0]?.Id || '',
            isFavorite: item.UserData?.IsFavorite,
            // Technical details
            bitrate,
            codec,
            lyrics: isLocal ? item.lyrics : undefined,
        };
    };

    const handlePlayNext = () => {
        if (!selectedTrack) return;
        const track = mediaItemToTrack(selectedTrack);
        addToQueueNext(track);
        setIsTrackMenuVisible(false);
        setSelectedTrack(null);
    };

    const handleAddToQueue = () => {
        if (!selectedTrack) return;
        const track = mediaItemToTrack(selectedTrack);
        addToQueueEnd(track);
        setIsTrackMenuVisible(false);
        setSelectedTrack(null);
    };

    const handleOpenAddToPlaylist = () => {
        setIsTrackMenuVisible(false);
        fetchPlaylists();
        setIsAddToPlaylistVisible(true);
    };

    const handleDeleteTrack = async () => {
        if (!selectedTrack) return;
        setIsTrackMenuVisible(false);

        const isLocal = dataSource === 'local';

        Alert.alert(
            isLocal ? 'Delete File' : 'Delete from Server',
            isLocal
                ? 'Are you sure you want to delete this file from your device?'
                : 'Are you sure you want to permanently delete this file from your Jellyfin server? This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            if (isLocal) {
                                const localLib = useLocalLibraryStore.getState();
                                const trackObj = { id: selectedTrack.Id /* ... partial obj ... */ };
                                // Simplified for brevity in diff, existing logic used ID lookup mostly
                                const fullTrack = localLib.tracks.find(t => t.id === selectedTrack.Id);
                                if (fullTrack) await localLib.deleteTrack(fullTrack);
                            } else {
                                await jellyfinApi.deleteItem(selectedTrack.Id);
                            }
                            fetchData(); // Refresh list
                        } catch (error: any) {
                            console.error('Delete failed:', error);
                            const msg = error?.response?.data || error?.message || 'Unknown error';
                            Alert.alert('Error', `Failed to delete item: ${msg}`);
                        }
                    }
                }
            ]
        );
        setSelectedTrack(null);
    };

    const handleDownloadTrack = async () => {
        if (!selectedTrack || dataSource === 'local') {
            return;
        }
        setIsTrackMenuVisible(false);

        try {
            await downloadService.queueTrack({
                id: selectedTrack.Id,
                name: selectedTrack.Name,
                artist: selectedTrack.Artists?.[0] || selectedTrack.AlbumArtist || 'Unknown',
                album: selectedTrack.Album,
                imageUrl: jellyfinApi.getImageUrl(selectedTrack.Id),
                durationMillis: selectedTrack.RunTimeTicks ? selectedTrack.RunTimeTicks / 10000 : undefined,
            });
        } catch (error) {
            console.error('[HomeScreen] Download error:', error);
        }

        setSelectedTrack(null);
    };

    const fetchPlaylists = async () => {
        try {
            if (dataSource === 'local') {
                const localPlaylists = useLocalLibraryStore.getState().playlists;
                setPlaylists(localPlaylists.map(p => ({ Id: p.id, Name: p.name })));
            } else {
                const data = await jellyfinApi.getPlaylists();
                setPlaylists(data.Items || []);
            }
        } catch (error) {
            console.error('Failed to fetch playlists:', error);
        }
    };

    const handleAddToPlaylist = async (playlistId: string) => {
        // Get the track IDs to add - either from selection mode or single track
        const trackIdsToAdd = isSelectionMode && selectedTracks.size > 0
            ? Array.from(selectedTracks)
            : selectedTrack ? [selectedTrack.Id] : [];

        if (trackIdsToAdd.length === 0) return;

        setIsAddingToPlaylist(true);

        try {
            if (dataSource === 'local') {
                const localLib = useLocalLibraryStore.getState();
                const existingIds = localLib.playlists.find(p => p.id === playlistId)?.trackIds || [];
                const duplicates = trackIdsToAdd.filter(id => existingIds.includes(id));

                if (duplicates.length > 0) {
                    setIsAddingToPlaylist(false);
                    setPendingPlaylistId(playlistId);
                    setIsDuplicateDialogVisible(true);
                    return;
                }
                // Add all tracks
                for (const trackId of trackIdsToAdd) {
                    localLib.addToPlaylist(playlistId, trackId);
                }
            } else {
                const existingTracks = await jellyfinApi.getPlaylistItems(playlistId);
                const existingIds = new Set(existingTracks.Items?.map((t: any) => t.Id) || []);
                const duplicates = trackIdsToAdd.filter(id => existingIds.has(id));

                if (duplicates.length > 0) {
                    setIsAddingToPlaylist(false);
                    setPendingPlaylistId(playlistId);
                    setIsDuplicateDialogVisible(true);
                    return;
                }
                await jellyfinApi.addToPlaylist(playlistId, trackIdsToAdd);
            }
            setIsAddingToPlaylist(false);
            setIsAddToPlaylistVisible(false);
            setSelectedTrack(null);

            // Exit selection mode after adding
            if (isSelectionMode) {
                exitSelectionMode();
            }
        } catch (error) {
            console.error('Failed to add to playlist:', error);
            setIsAddingToPlaylist(false);
        }
    };

    const confirmAddToPlaylist = async (playlistId: string) => {
        // Get the track IDs to add - either from selection mode or single track
        const trackIdsToAdd = isSelectionMode && selectedTracks.size > 0
            ? Array.from(selectedTracks)
            : selectedTrack ? [selectedTrack.Id] : [];

        if (trackIdsToAdd.length === 0) return;

        try {
            if (dataSource === 'local') {
                const localLib = useLocalLibraryStore.getState();
                for (const trackId of trackIdsToAdd) {
                    localLib.addToPlaylist(playlistId, trackId);
                }
            } else {
                await jellyfinApi.addToPlaylist(playlistId, trackIdsToAdd);
            }
            setIsDuplicateDialogVisible(false);
            setIsAddToPlaylistVisible(false);
            setSelectedTrack(null);
            setPendingPlaylistId(null);

            // Exit selection mode after adding
            if (isSelectionMode) {
                exitSelectionMode();
            }
        } catch (error) {
            console.error('Failed to add to playlist:', error);
        }
    };

    // Multi-select handlers
    const handleLongPress = (item: MediaItem) => {
        if (!isSelectionMode) {
            setIsSelectionMode(true);
            setSelectedTracks(new Set([item.Id]));
        } else {
            toggleTrackSelection(item);
        }
    };

    const toggleTrackSelection = (item: MediaItem) => {
        if (!isSelectionMode) return;
        setSelectedTracks(prev => {
            const newSet = new Set(prev);
            if (newSet.has(item.Id)) {
                newSet.delete(item.Id);
            } else {
                newSet.add(item.Id);
            }
            // Exit selection mode if no tracks selected
            if (newSet.size === 0) {
                setIsSelectionMode(false);
            }
            return newSet;
        });
    };

    const exitSelectionMode = () => {
        setIsSelectionMode(false);
        setSelectedTracks(new Set());
        setIsSelectionMenuVisible(false);
    };

    const handleDownloadSelected = async () => {
        setIsSelectionMenuVisible(false);
        if (dataSource === 'local') return; // Can't download local files

        // Get the full track data for selected tracks
        const tracksToDownload: Array<{
            id: string;
            name: string;
            artist: string;
            album?: string;
            imageUrl?: string;
            durationMillis?: number;
        }> = [];

        // Find track data from quickPicks or mostPlayed
        const allTracks = [...recommendations, ...mostPlayed]; // Changed from quickPicks to recommendations
        selectedTracks.forEach(id => {
            const track = allTracks.find(t => t.Id === id);
            if (track) {
                tracksToDownload.push({
                    id: track.Id,
                    name: track.Name,
                    artist: track.Artists?.[0] || track.AlbumArtist || 'Unknown',
                    album: track.Album,
                    imageUrl: jellyfinApi.getImageUrl(track.Id),
                    durationMillis: track.RunTimeTicks ? track.RunTimeTicks / 10000 : undefined,
                });
            }
        });

        if (tracksToDownload.length > 0) {
            await downloadService.queueBatch(tracksToDownload);
        }

        exitSelectionMode();
    };

    const handleAddSelectedToPlaylist = () => {
        setIsSelectionMenuVisible(false);
        fetchPlaylists();
        setIsAddToPlaylistVisible(true);
        // Note: We'll need to handle batch add to playlist in handleAddToPlaylist
    };

    const handleDeleteSelected = async () => {
        setIsSelectionMenuVisible(false);
        const isLocal = dataSource === 'local';

        const performBatchDelete = async () => {
            try {
                if (isLocal) {
                    const localLib = useLocalLibraryStore.getState();
                    const tracksToDelete = localLib.tracks.filter(t => selectedTracks.has(t.id));
                    // Note: deleteTrack calls MediaLibrary which might prompt per file (on older Android)
                    // or once for the batch if we used deleteAssetsAsync with array (Store does one by one in loop currently?)
                    // Store deleteTrack takes single track.
                    // Doing a loop here triggers multiple system dialogs if not careful.
                    // Ideally Store should expose deleteTracks(tracks[]) to do one batch call.
                    // For now, let's just loop, but user only sees system prompts.
                    for (const track of tracksToDelete) {
                        await localLib.deleteTrack(track);
                    }
                } else {
                    const ids = Array.from(selectedTracks);
                    for (const id of ids) await jellyfinApi.deleteItem(id);
                }
                fetchData();
                exitSelectionMode();
            } catch (error: any) {
                console.error('Batch delete failed', error);
                const msg = error?.response?.data || error?.message || 'Unknown error';
                Alert.alert('Error', `Some items could not be deleted: ${msg}`);
            }
        };

        if (isLocal) {
            // System dialogs will appear
            performBatchDelete();
        } else {
            Alert.alert(
                'Delete Selected',
                `Permanently delete ${selectedTracks.size} selected tracks from server?`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: performBatchDelete }
                ]
            );
        }
    };

    // Content fade animation for source switching
    const contentOpacity = useRef(new Animated.Value(1)).current;
    const contentTranslateY = useRef(new Animated.Value(0)).current;
    const prevDataSource = useRef(dataSource);

    // Animate content when source changes
    useEffect(() => {
        if (prevDataSource.current !== dataSource) {
            // Fade out and slide up
            Animated.parallel([
                Animated.timing(contentOpacity, {
                    toValue: 0,
                    duration: 150,
                    useNativeDriver: true,
                }),
                Animated.timing(contentTranslateY, {
                    toValue: -10,
                    duration: 150,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                // After fade out, reset position and fade in
                contentTranslateY.setValue(10);
                Animated.parallel([
                    Animated.timing(contentOpacity, {
                        toValue: 1,
                        duration: 200,
                        useNativeDriver: true,
                    }),
                    Animated.spring(contentTranslateY, {
                        toValue: 0,
                        useNativeDriver: true,
                        speed: 15,
                    }),
                ]).start();
            });
            prevDataSource.current = dataSource;
        }
    }, [dataSource]);

    // Typing animation state
    const [displayedGreeting, setDisplayedGreeting] = useState(animationState.hasPlayed ? getGreeting() : '');
    const [isTypingComplete, setIsTypingComplete] = useState(animationState.hasPlayed);
    const fullGreeting = getGreeting();
    const charIndexRef = useRef(0);

    // Typing animation effect
    useEffect(() => {
        if (animationState.hasPlayed) {
            setDisplayedGreeting(fullGreeting);
            setIsTypingComplete(true);
            return;
        }

        charIndexRef.current = 0;
        setDisplayedGreeting('');

        const typingSpeed = 100; // ms per character
        let intervalId: NodeJS.Timeout;

        const startDelay = setTimeout(() => {
            intervalId = setInterval(() => {
                charIndexRef.current += 1;
                if (charIndexRef.current <= fullGreeting.length) {
                    setDisplayedGreeting(fullGreeting.slice(0, charIndexRef.current));
                } else {
                    clearInterval(intervalId);
                    setIsTypingComplete(true);
                    animationState.hasPlayed = true;
                }
            }, typingSpeed);
        }, 100);

        return () => {
            clearTimeout(startDelay);
            if (intervalId) clearInterval(intervalId);
        };
    }, []);

    const fetchData = async () => {
        setError(null);
        try {
            if (dataSource === 'local') {
                // Fetch from local library (filtered by selected folders)
                const localTracks = useLocalLibraryStore.getState().getFilteredTracks();

                // Transform local tracks to MediaItem format for UI consistency
                const localAsMediaItems: MediaItem[] = localTracks.map(track => ({
                    Id: track.id,
                    Name: track.name,
                    Type: 'Audio',
                    Artists: [track.artist],
                    AlbumArtist: track.artist,
                    Album: track.album,
                    RunTimeTicks: track.durationMillis * 10000,
                    UserData: { IsFavorite: track.isFavorite || false },
                    streamUrl: track.streamUrl,
                    imageUrl: track.imageUrl || '',
                    // Include enriched technical details from local library
                    bitrate: track.bitrate,
                    codec: track.codec,
                    container: track.container,
                    lyrics: track.lyrics,
                }));

                // Generate unique artists from local tracks
                const artistMap = new Map<string, MediaItem>();
                localTracks.forEach(track => {
                    const artistId = `local_artist_${(track.artist || 'Unknown Artist').toLowerCase().replace(/\s+/g, '_')}`;
                    if (track.artist && !artistMap.has(artistId)) {
                        artistMap.set(artistId, {
                            Id: artistId,
                            Name: track.artist,
                            Type: 'MusicArtist',
                            imageUrl: track.imageUrl || '', // Use first track's image
                        });
                    }
                });
                // Shuffle artists for randomization, then take first 10
                const localArtists = Array.from(artistMap.values())
                    .sort(() => Math.random() - 0.5)
                    .slice(0, 10);

                // Shuffle for quick picks (random selection)
                const shuffled = [...localAsMediaItems].sort(() => Math.random() - 0.5);

                // Set sections
                setLatestMusic(localAsMediaItems.slice(0, 10)); // Fresh arrivals
                setRecommendations(shuffled.slice(0, 5)); // Quick picks (random)
                setResumeItems([]); // No resume for local
                setRecommendedArtists(localArtists); // Local artists

                // Fetch Most Played and Recently Played from database
                try {
                    const [mostPlayedTracks, recentTracks] = await Promise.all([
                        DatabaseService.getMostPlayed('local', 10),
                        DatabaseService.getRecentlyPlayed('local', 10),
                    ]);

                    // Transform DB tracks to MediaItem format
                    const transformDbTrack = (t: any): MediaItem => ({
                        Id: t.id,
                        Name: t.name,
                        Type: 'Audio',
                        Artists: [t.artist],
                        AlbumArtist: t.artist,
                        Album: t.album,
                        RunTimeTicks: t.durationMillis * 10000,
                        UserData: { IsFavorite: t.isFavorite || false },
                        streamUrl: t.streamUrl,
                        imageUrl: t.imageUrl || '',
                        bitrate: t.bitrate,
                        codec: t.codec,
                        container: t.container,
                    });

                    setMostPlayed(mostPlayedTracks.map(transformDbTrack));
                    setRecentlyPlayed(recentTracks.map(transformDbTrack));
                } catch (dbErr) {
                    console.error('Failed to fetch play history:', dbErr);
                    setMostPlayed([]);
                    setRecentlyPlayed([]);
                }

            } else {
                // Fetch from Jellyfin API robustly
                // We fetch each section independently so one failure doesn't break the whole screen.
                const [latestRes, resumeRes, recsRes, artistsRes] = await Promise.allSettled([
                    jellyfinApi.getLatestMusic(),
                    jellyfinApi.getResumeItems(),
                    jellyfinApi.getRecommendations(),
                    jellyfinApi.getRecommendedArtists(),
                ]);

                // Fetch unified isolated history from database for jellyfin
                try {
                    const [mostPlayedTracks, recentTracks] = await Promise.all([
                        DatabaseService.getMostPlayed('jellyfin', 10),
                        DatabaseService.getRecentlyPlayed('jellyfin', 10),
                    ]);
                    // Database maps back to Track objects; convert them to MediaItem shapes for UI
                    const transformDbTrack = (t: any): MediaItem => ({
                        Id: t.id,
                        Name: t.name,
                        Type: 'Audio',
                        Artists: [t.artist],
                        AlbumArtist: t.artist,
                        Album: t.album,
                        RunTimeTicks: t.durationMillis ? t.durationMillis * 10000 : 0,
                        UserData: { IsFavorite: t.isFavorite || false },
                        streamUrl: t.streamUrl,
                        imageUrl: t.imageUrl || '',
                    });
                    setMostPlayed(mostPlayedTracks.map(transformDbTrack));
                    setRecentlyPlayed(recentTracks.map(transformDbTrack));
                } catch (dbErr) {
                    console.error('Failed to fetch Jellyfin play history:', dbErr);
                    setMostPlayed([]);
                    setRecentlyPlayed([]);
                }

                if (latestRes.status === 'fulfilled') setLatestMusic(latestRes.value);
                else console.error("Latest Music failed:", latestRes.reason);

                if (resumeRes.status === 'fulfilled') setResumeItems(resumeRes.value);
                else console.error("Resume Items failed:", resumeRes.reason);

                if (recsRes.status === 'fulfilled') setRecommendations(recsRes.value.Items || []);
                else console.error("Recommendations failed:", recsRes.reason);

                if (artistsRes.status === 'fulfilled') setRecommendedArtists(artistsRes.value.Items || []);
                else console.error("Artists failed:", artistsRes.reason);
            }

            // Trigger entry animation
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 500,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 500,
                    useNativeDriver: true,
                })
            ]).start();

            // Data fetched successfully, clear any playback error
            if (playbackError) {
                clearPlaybackError();
            }

        } catch (error) {
            console.error('Failed to fetch home data', error);
            setError('Unable to connect to Jellyfin server. Please check your network connection.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        // Handle local library on dataSource change
        if (dataSource === 'local') {
            const localStore = useLocalLibraryStore.getState();

            if (localStore.permissionGranted && !localStore.isScanning) {
                if (localStore.tracks.length === 0) {
                    // First run - no cached tracks, do full scan
                    localStore.refreshLibrary();
                } else {
                    // Have cached tracks - just check for new ones in background
                    // This is fast and won't block the UI
                    localStore.checkForNewTracks();
                }
            }
        }
        fetchData();
    }, [dataSource]);

    // Subscribe to local library changes to auto-refresh when scan completes
    useEffect(() => {
        if (dataSource !== 'local') return;

        const unsubscribe = useLocalLibraryStore.subscribe((state, prevState) => {
            // When scanning finishes, refresh the UI
            if (prevState.isScanning && !state.isScanning) {
                // Scan completed, refreshing UI
                fetchData();
            }
        });

        return () => unsubscribe();
    }, [dataSource]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
    };

    const handleItemPress = (item: MediaItem) => {
        // For Audio items (songs), play the song instead of navigating to detail
        if (item.Type === 'Audio') {
            handleSongPress(item);
            return;
        }
        // For albums, artists, etc., navigate to detail page
        navigation.navigate('Detail', { itemId: item.Id, type: item.Type });
    };

    const handleSongPress = async (item: MediaItem) => {
        // For local tracks, pull directly from the store to get enriched technical details
        if (dataSource === 'local') {
            const localTracks = useLocalLibraryStore.getState().tracks;
            const enrichedTrack = localTracks.find(t => t.id === item.Id);
            if (enrichedTrack) {
                // Use the enriched track from the store which has bitrate/codec
                setQueue([enrichedTrack]);
                await playTrack(enrichedTrack);
                return;
            }
        }
        // Fallback for Jellyfin tracks or if enriched track not found
        const track = mediaItemToTrack(item);
        setQueue([track]);
        await playTrack(track);
    };

    // Get image URL - use item's imageUrl for local, or Jellyfin API
    const getItemImageUrl = (item: MediaItem) => {
        if (dataSource === 'local') {
            return item.imageUrl || undefined; // undefined will show placeholder
        }
        return jellyfinApi.getImageUrl(item.Id);
    };

    // Grid item width calculation for landscape mode (subtract left tab bar width)
    const contentWidth = isLandscape ? width - LEFT_BAR_WIDTH : width;
    const gridItemWidth = isLandscape ? (contentWidth - 40) / numColumns - 12 : 150;

    const renderItem = ({ item }: { item: MediaItem }) => {
        const imageUrl = getItemImageUrl(item);

        return (
            <Card
                style={[
                    styles.card,
                    isLandscape && {
                        width: gridItemWidth,
                        marginRight: 8,
                        marginBottom: 12
                    }
                ]}
                onPress={() => dataSource === 'local' ? handleSongPress(item) : handleItemPress(item)}
                mode="contained"
            >
                <ImageWithFallback
                    uri={imageUrl}
                    style={[
                        styles.cardImage,
                        isLandscape && { width: gridItemWidth, height: gridItemWidth }
                    ]}
                    fallbackIcon="music-note"
                    iconSize={isLandscape ? 40 : 50}
                    iconColor={theme.colors.onSurfaceVariant}
                    backgroundColor={theme.colors.surfaceVariant}
                    borderRadius={16}
                />
                <Card.Content style={styles.cardContent}>
                    <Text variant="titleSmall" numberOfLines={1}>{item.Name}</Text>
                </Card.Content>
            </Card>
        );
    };

    const renderSongItem = ({ item }: { item: MediaItem }) => {
        const isCurrent = currentTrack?.id === item.Id;
        const isSelected = selectedTracks.has(item.Id);

        return (
            <SongItem
                item={item}
                isCurrent={isCurrent}
                isPlaying={isPlaying}
                onPress={() => handleSongPress(item)}
                onLongPress={() => handleLongPress(item)}
                onMenuPress={() => openTrackMenu(item)}
                getImageUrl={getItemImageUrl}
                isSelectionMode={isSelectionMode}
                isSelected={isSelected}
                showEqualizer={true}
            />
        );
    };

    const renderArtistItem = ({ item }: { item: MediaItem }) => {
        const imageUrl = dataSource === 'local' ? item.imageUrl : jellyfinApi.getImageUrl(item.Id);
        return (
            <TouchableOpacity style={styles.artistContainer} onPress={() => handleItemPress(item)}>
                <ImageWithFallback
                    uri={imageUrl}
                    style={styles.artistPlaceholder}
                    fallbackIcon="account-music"
                    iconSize={40}
                    iconColor={theme.colors.onSurfaceVariant}
                    backgroundColor={theme.colors.surfaceVariant}
                    borderRadius={50}
                />
                <Text variant="titleMedium" style={styles.artistName} numberOfLines={1}>{item.Name}</Text>
            </TouchableOpacity>
        );
    };

    // Initial loading state
    if (loading && !refreshing && latestMusic.length === 0 && resumeItems.length === 0) {
        return <HomeScreenSkeleton isLandscape={isLandscape} numColumns={numColumns} width={width} />;
    }


    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            <ScrollView
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
                }
                contentContainerStyle={{ paddingBottom: 180 }}
            >
                <Animated.View style={{
                    opacity: Animated.multiply(fadeAnim, contentOpacity),
                    transform: [{ translateY: Animated.add(slideAnim, contentTranslateY) }]
                }}>
                    <View style={[styles.header, isLandscape && { padding: 12, marginBottom: 4 }]}>
                        {isSelectionMode ? (
                            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                                <IconButton icon="close" onPress={exitSelectionMode} />
                                <Text variant="titleLarge" style={{ flex: 1, fontWeight: 'bold', marginLeft: 8 }}>
                                    {selectedTracks.size} Selected
                                </Text>
                                <IconButton icon="dots-vertical" onPress={() => setIsSelectionMenuVisible(true)} />
                                <ActionSheet
                                    visible={isSelectionMenuVisible}
                                    onClose={() => setIsSelectionMenuVisible(false)}
                                    title="Selected Actions"
                                    heightPercentage={40}
                                >
                                    <View style={{ gap: 4 }}>
                                        <List.Item
                                            title="Download Selected"
                                            left={props => <List.Icon {...props} icon="download" />}
                                            onPress={handleDownloadSelected}
                                            disabled={dataSource === 'local'}
                                        />
                                        <List.Item
                                            title="Add to Playlist"
                                            left={props => <List.Icon {...props} icon="playlist-plus" />}
                                            onPress={handleAddSelectedToPlaylist}
                                        />
                                        {dataSource === 'local' && (
                                            <List.Item
                                                title="Delete from Device"
                                                left={props => <List.Icon {...props} icon="delete" color={theme.colors.error} />}
                                                titleStyle={{ color: theme.colors.error }}
                                                onPress={handleDeleteSelected}
                                            />
                                        )}
                                    </View>
                                </ActionSheet>
                            </View>
                        ) : (
                            <View style={{ flex: 1 }}>
                                <Text variant={isLandscape ? "titleLarge" : "headlineMedium"} style={{ fontWeight: 'bold' }}>
                                    {displayedGreeting}
                                    {!isTypingComplete && <Text style={{ color: theme.colors.primary }}>|</Text>}
                                </Text>
                                {!isLandscape && (
                                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                                        {getQuirkySubtitle()}
                                    </Text>
                                )}
                            </View>
                        )}

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            {/* Settings icon - show when profile won't navigate to settings */}
                            {showSettingsIcon && (
                                <IconButton
                                    icon="cog"
                                    size={24}
                                    onPress={() => navigation.navigate('Settings')}
                                />
                            )}
                            {/* Profile avatar */}
                            <TouchableOpacity onPress={handleProfilePress}>
                                {isLocalOnlyMode ? (
                                    // Local-only mode: show local profile avatar (editable)
                                    localProfile.imageUri ? (
                                        <Avatar.Image
                                            size={40}
                                            source={{ uri: localProfile.imageUri }}
                                        />
                                    ) : (
                                        <Avatar.Icon size={40} icon="account" />
                                    )
                                ) : user?.id ? (
                                    // Jellyfin mode: show Jellyfin user image
                                    <Avatar.Image
                                        size={40}
                                        source={{ uri: jellyfinApi.getUserImageUrl(user.id) }}
                                    />
                                ) : (
                                    <Avatar.Icon size={40} icon="account" />
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Source Switcher - separate from header text */}
                    {sourceMode === 'both' && (
                        <View style={{ paddingHorizontal: 16, marginBottom: 16, alignItems: 'center' }}>
                            <SourceSwitcher />
                        </View>
                    )}

                    {/* Playback Error Banner */}
                    {playbackError && dataSource !== 'local' && (
                        <View style={{ marginHorizontal: 20, marginBottom: 16 }}>
                            <Surface style={{ borderRadius: 12, backgroundColor: theme.colors.errorContainer, padding: 12 }} elevation={2}>
                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                    <Icon name="wifi-off" size={24} color={theme.colors.onErrorContainer} />
                                    <View style={{ marginLeft: 12, flex: 1 }}>
                                        <Text variant="titleSmall" style={{ color: theme.colors.onErrorContainer, fontWeight: 'bold' }}>Connection Lost</Text>
                                        <Text variant="bodySmall" style={{ color: theme.colors.onErrorContainer }}>Playback stopped. Check your internet.</Text>
                                    </View>
                                </View>
                            </Surface>
                        </View>
                    )}

                    {/* Network Error State (Initial Load) */}
                    {error && dataSource !== 'local' && !loading && latestMusic.length === 0 && (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 40 }}>
                            <Icon name="wifi-off" size={64} color={theme.colors.error} />
                            <Text variant="titleLarge" style={{ marginTop: 16, marginBottom: 8, fontWeight: 'bold' }}>Connection Failed</Text>
                            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 24, textAlign: 'center', paddingHorizontal: 32 }}>
                                {error}
                            </Text>
                            <Button mode="contained" onPress={fetchData} icon="refresh">
                                Retry
                            </Button>
                        </View>
                    )}
                    {/* Empty state (Jellyfin only) when everything is empty */}
                    {!loading && !error && dataSource !== 'local' && latestMusic.length === 0 && resumeItems.length === 0 && recommendations.length === 0 && recommendedArtists.length === 0 && mostPlayed.length === 0 && recentlyPlayed.length === 0 && (
                        <EmptyState
                            icon='server-network-off'
                            title='No items found'
                            description='Your Jellyfin library seems to be empty.'
                        />
                    )}


                    {/* Recently Played / Resume (Jellyfin only) */}
                    {resumeItems.length > 0 && (
                        <View style={styles.section}>
                            <Text variant={isLandscape ? "titleMedium" : "titleLarge"} style={styles.sectionTitle}>Jump Back In</Text>
                            <FlatList
                                key={isLandscape ? 'grid-resume' : 'list-resume'}
                                data={resumeItems}
                                renderItem={renderItem}
                                keyExtractor={(item) => item.Id}
                                horizontal={!isLandscape}
                                numColumns={isLandscape ? numColumns : 1}
                                showsHorizontalScrollIndicator={false}
                                scrollEnabled={!isLandscape}
                                contentContainerStyle={styles.listContent}
                                initialNumToRender={5}
                                maxToRenderPerBatch={5}
                            />
                        </View>
                    )}

                    {/* Recommended Artists (Jellyfin only) */}
                    {recommendedArtists.length > 0 && (
                        <View style={styles.section}>
                            <Text variant={isLandscape ? "titleMedium" : "titleLarge"} style={styles.sectionTitle}>Artists You Like</Text>
                            <FlatList
                                data={recommendedArtists}
                                renderItem={renderArtistItem}
                                keyExtractor={(item) => item.Id}
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.listContent}
                                initialNumToRender={5}
                                maxToRenderPerBatch={5}
                            />
                        </View>
                    )}

                    {/* Most Played (Local mode only) */}
                    {dataSource === 'local' && mostPlayed.length > 0 && (
                        <View style={styles.section}>
                            <Text variant={isLandscape ? "titleMedium" : "titleLarge"} style={styles.sectionTitle}>Most Played</Text>
                            {isLandscape ? (
                                <FlatList
                                    key="grid-mostplayed"
                                    data={mostPlayed.slice(0, 10)}
                                    renderItem={renderItem}
                                    keyExtractor={(item) => item.Id}
                                    horizontal={false}
                                    numColumns={numColumns}
                                    scrollEnabled={false}
                                    contentContainerStyle={styles.listContent}
                                />
                            ) : (
                                <View style={styles.listContent}>
                                    {mostPlayed.slice(0, 5).map((item) => (
                                        <View key={item.Id} style={{ marginBottom: 8 }}>
                                            {renderSongItem({ item })}
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    )}

                    {/* Recently Played (Local mode only) */}
                    {dataSource === 'local' && recentlyPlayed.length > 0 && (
                        <View style={styles.section}>
                            <Text variant={isLandscape ? "titleMedium" : "titleLarge"} style={styles.sectionTitle}>Recently Played</Text>
                            <FlatList
                                key={isLandscape ? 'grid-recent' : 'list-recent'}
                                data={recentlyPlayed}
                                renderItem={renderItem}
                                keyExtractor={(item) => item.Id}
                                horizontal={!isLandscape}
                                numColumns={isLandscape ? numColumns : 1}
                                showsHorizontalScrollIndicator={false}
                                scrollEnabled={!isLandscape}
                                contentContainerStyle={styles.listContent}
                                initialNumToRender={5}
                                maxToRenderPerBatch={5}
                            />
                        </View>
                    )}

                    {/* Quick Picks (Songs) */}
                    {recommendations.length > 0 && (
                        <View style={styles.section}>
                            <Text variant={isLandscape ? "titleMedium" : "titleLarge"} style={styles.sectionTitle}>Quick Picks</Text>
                            {isLandscape ? (
                                <FlatList
                                    key="grid-quickpicks"
                                    data={recommendations.slice(0, 10)}
                                    renderItem={renderItem}
                                    keyExtractor={(item) => item.Id}
                                    horizontal={false}
                                    numColumns={numColumns}
                                    scrollEnabled={false}
                                    contentContainerStyle={styles.listContent}
                                />
                            ) : (
                                <View style={styles.listContent}>
                                    {recommendations.slice(0, 5).map((item) => (
                                        <View key={item.Id} style={{ marginBottom: 8 }}>
                                            {renderSongItem({ item })}
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    )}

                    {/* Fresh Arrivals / Recently Added */}
                    {latestMusic.length > 0 && (
                        <View style={styles.section}>
                            <Text variant={isLandscape ? "titleMedium" : "titleLarge"} style={styles.sectionTitle}>
                                {dataSource === 'local' ? 'Recently Added' : 'Fresh Arrivals'}
                            </Text>
                            <FlatList
                                key={isLandscape ? 'grid-latest' : 'list-latest'}
                                data={latestMusic}
                                renderItem={renderItem}
                                keyExtractor={(item) => item.Id}
                                horizontal={!isLandscape}
                                numColumns={isLandscape ? numColumns : 1}
                                showsHorizontalScrollIndicator={false}
                                scrollEnabled={!isLandscape}
                                contentContainerStyle={styles.listContent}
                                initialNumToRender={5}
                                maxToRenderPerBatch={5}
                            />
                        </View>
                    )}

                    {/* Empty state for local mode */}
                    {dataSource === 'local' && latestMusic.length === 0 && recommendations.length === 0 && !loading && (
                        <EmptyState
                            icon="folder-open"
                            title="No local music found"
                            description="Go to Settings → Storage to select a music folder"
                            actionLabel="Open Storage Settings"
                            onAction={() => navigation.navigate('StorageSettings')}
                        />
                    )}
                </Animated.View>
            </ScrollView>

            {/* Profile Edit Dialog (local-only mode) */}
            {/* Profile Edit ActionSheet (local-only mode) */}
            <ActionSheet visible={profileDialogVisible} onClose={() => setProfileDialogVisible(false)} title="Edit Profile" heightPercentage={45}>
                <View style={{ gap: 16 }}>
                    <View style={{ alignItems: 'center' }}>
                        <TouchableOpacity onPress={handlePickImage}>
                            {localProfile.imageUri ? (
                                <Avatar.Image size={80} source={{ uri: localProfile.imageUri }} />
                            ) : (
                                <Avatar.Icon size={80} icon="account" />
                            )}
                        </TouchableOpacity>
                        <Button
                            mode="text"
                            onPress={handlePickImage}
                            style={{ marginTop: 8 }}
                        >
                            Change Photo
                        </Button>
                    </View>
                    <TextInput
                        label="Display Name"
                        value={editName}
                        onChangeText={setEditName}
                        mode="outlined"
                    />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                        <Button mode="text" onPress={() => setProfileDialogVisible(false)}>Cancel</Button>
                        <Button mode="contained" onPress={handleSaveProfile}>Save</Button>
                    </View>
                </View>
            </ActionSheet>

            {/* Track Options Menu */}
            <ActionSheet visible={isTrackMenuVisible} onClose={() => setIsTrackMenuVisible(false)} title={selectedTrack?.Name || 'Track Options'}>
                <View style={{ gap: 4 }}>
                    <List.Item
                        title="Play Next"
                        description="Add to queue after current song"
                        left={props => <List.Icon {...props} icon="playlist-play" />}
                        onPress={handlePlayNext}
                    />
                    <List.Item
                        title="Add to Queue"
                        description="Add to end of queue"
                        left={props => <List.Icon {...props} icon="playlist-plus" />}
                        onPress={handleAddToQueue}
                    />
                    <List.Item
                        title="Add to Playlist"
                        description="Save to a playlist"
                        left={props => <List.Icon {...props} icon="playlist-music" />}
                        onPress={handleOpenAddToPlaylist}
                    />
                    {dataSource !== 'local' && (
                        <List.Item
                            title="Download"
                            description="Save for offline listening"
                            left={props => <List.Icon {...props} icon="download" />}
                            onPress={handleDownloadTrack}
                        />
                    )}
                    {dataSource === 'local' && (
                        <List.Item
                            title="Delete from Device"
                            description="Permanently remove this track"
                            titleStyle={{ color: '#f44336' }}
                            left={props => <List.Icon {...props} icon="delete" color="#f44336" />}
                            onPress={handleDeleteTrack}
                        />
                    )}
                </View>
            </ActionSheet>

            {/* Add to Playlist ActionSheet */}
            <ActionSheet visible={isAddToPlaylistVisible} onClose={() => setIsAddToPlaylistVisible(false)} title="Add to Playlist" scrollable>
                <View style={{ gap: 4 }}>
                    {isAddingToPlaylist ? (
                        <View style={{ padding: 40, alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator size="large" color={theme.colors.primary} />
                            <Text style={{ marginTop: 16, color: theme.colors.onSurface }}>Adding to playlist...</Text>
                        </View>
                    ) : (
                        playlists.map(playlist => (
                            <List.Item
                                key={playlist.Id}
                                title={playlist.Name}
                                left={props => <List.Icon {...props} icon="playlist-music" />}
                                onPress={() => handleAddToPlaylist(playlist.Id)}
                            />
                        ))
                    )}
                </View>
            </ActionSheet>

            {/* Duplicate Song ActionSheet */}
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

            {/* Orientation Transition Curtain */}
            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    {
                        backgroundColor: theme.colors.background,
                        opacity: layoutOpacity.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 0] // 0 (hidden) -> 1 (visible) -> 0 (hidden)
                        }),
                        zIndex: 9999
                    }
                ]}
            />
        </SafeAreaView >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        marginBottom: 10,
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        marginLeft: 20,
        marginBottom: 16,
        fontWeight: 'bold',
    },
    listContent: {
        paddingHorizontal: 20,
    },
    card: {
        marginRight: 16,
        width: 150,
        backgroundColor: 'transparent',
        shadowColor: 'transparent', // Remove shadow from card itself
    },
    cardImage: {
        width: 150,
        height: 150,
        borderRadius: 16, // Softer corners
    },
    cardContent: {
        paddingHorizontal: 0,
        paddingVertical: 8,
    },
    songCard: {
        marginBottom: 4,
        backgroundColor: 'transparent',
        shadowColor: 'transparent',
    },
    songImage: {
        width: 56,
        height: 56,
        borderRadius: 8,
    },
    artistContainer: {
        marginRight: 20,
        alignItems: 'center',
        width: 100,
    },
    artistName: {
        marginTop: 12,
        textAlign: 'center',
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    placeholderContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    songPlaceholder: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    artistPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
