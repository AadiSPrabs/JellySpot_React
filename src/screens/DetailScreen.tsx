import React, { useEffect, useState, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, ScrollView, Pressable, Text as RNText, Animated, InteractionManager } from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { Image } from 'expo-image';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { RootStackParamList } from '../types/navigation';
import { jellyfinApi } from '../api/jellyfin';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useShallow } from 'zustand/react/shallow';
import { useLocalLibraryStore } from '../store/localLibraryStore';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, List, IconButton, useTheme, Surface, Portal, Dialog, TouchableRipple, Avatar, TextInput, Menu } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { EqualizerAnimation } from '../components/EqualizerAnimation';
import { Loader } from '../components/Loader';
import { Skeleton, ListItemSkeleton, CardSkeleton } from '../components/Skeleton';
import { ShuffleFab } from '../components/ShuffleFab';
import { DatabaseService } from '../services/DatabaseService';
import { downloadService } from '../services/DownloadService';
import { SongItem } from '../components/SongItem';
import { dialogStyles } from '../utils/dialogStyles';
import ActionSheet from '../components/ActionSheet';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import ImageColors from 'react-native-image-colors';
import { lightenHexColor } from '../utils/colorUtils';


import { HomeStackParamList } from '../types/navigation';

type DetailScreenRouteProp = RouteProp<HomeStackParamList, 'Detail'>;

import { Alert, RefreshControl } from 'react-native';

export default function DetailScreen() {
    const route = useRoute<DetailScreenRouteProp>();
    const navigation = useNavigation();
    const { itemId, type } = route.params;
    // Optimistically set item for instant rendering
    const getInitialItem = () => {
        if (itemId === 'all-songs') return { Id: 'all-songs', Name: 'All Songs', Type: 'Playlist' };
        if (itemId === 'liked-songs') return { Id: 'liked-songs', Name: 'Liked Songs', Type: 'Playlist' };
        // For others, we might have passed title/name in params? (TODO: optimize navigation params to include title)
        // For now, these are the critical ones user complained about.
        return null;
    };

    const [item, setItem] = useState<any>(getInitialItem());
    const [tracks, setTracks] = useState<any[]>([]);
    const [loading, setLoading] = useState(!getInitialItem()); // If we have item, we aren't "full screen loading"
    const [tracksLoading, setTracksLoading] = useState(true); // New state for list loading
    const [refreshing, setRefreshing] = useState(false);

    // SIMPLE IN-MEMORY CACHE FOR DETAIL SCREENS
    // Key: itemId, Value: { item, tracks, artistAlbums, similarArtists, timestamp }
    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    const getCachedData = (id: string) => {
        const cached = (global as any).detailCache?.[id];
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            return cached;
        }
        return null;
    };

    const setCachedData = (id: string, data: any) => {
        if (!(global as any).detailCache) (global as any).detailCache = {};
        (global as any).detailCache[id] = { ...data, timestamp: Date.now() };
    };

    const clearCachedData = (id: string) => {
        if ((global as any).detailCache) delete (global as any).detailCache[id];
    };

    // Artist specific states
    const [artistAlbums, setArtistAlbums] = useState<any[]>([]);
    const [similarArtists, setSimilarArtists] = useState<any[]>([]);
    const [isBioExpanded, setIsBioExpanded] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    // Glow and Sort states
    const [glowColor, setGlowColor] = useState<string | null>(null);
    const [sortBy, setSortBy] = useState<'default' | 'name' | 'artist' | 'album' | 'duration'>('default');
    const [isSortMenuVisible, setIsSortMenuVisible] = useState(false);
    const [fadeAnim] = useState(new Animated.Value(0));
    const [slideAnim] = useState(new Animated.Value(20));

    const filteredTracks = useMemo(() => {
        let result = [...tracks];
        
        // Apply search filter
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            result = result.filter(t =>
                t.Name?.toLowerCase().includes(q) ||
                t.AlbumArtist?.toLowerCase().includes(q) ||
                t.Artists?.[0]?.toLowerCase().includes(q)
            );
        }

        // Apply sorting
        if (sortBy !== 'default') {
            result.sort((a, b) => {
                switch (sortBy) {
                    case 'name':
                        return (a.Name || '').localeCompare(b.Name || '');
                    case 'artist':
                        const artistA = a.AlbumArtist || a.Artists?.[0] || '';
                        const artistB = b.AlbumArtist || b.Artists?.[0] || '';
                        return artistA.localeCompare(artistB);
                    case 'album':
                        return (a.Album || '').localeCompare(b.Album || '');
                    case 'duration':
                        return (a.RunTimeTicks || 0) - (b.RunTimeTicks || 0);
                    default:
                        return 0;
                }
            });
        }

        return result;
    }, [tracks, searchQuery, sortBy]);


    const { playTrack, setQueue, currentTrack, isPlaying, addToQueueNext, addToQueueEnd } = usePlayerStore(useShallow(state => ({
        playTrack: state.playTrack,
        setQueue: state.setQueue,
        currentTrack: state.currentTrack,
        isPlaying: state.isPlaying,
        addToQueueNext: state.addToQueueNext,
        addToQueueEnd: state.addToQueueEnd
    })));
    const theme = useTheme();
    const { dataSource } = useSettingsStore();
    const localLibrary = useLocalLibraryStore();
    const insets = useSafeAreaInsets();

    // Add to Playlist State
    const [playlists, setPlaylists] = useState<any[]>([]);
    const [isAddToPlaylistVisible, setIsAddToPlaylistVisible] = useState(false);
    const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
    const [selectedTrackEntryId, setSelectedTrackEntryId] = useState<string | null>(null);
    const [isDuplicateDialogVisible, setIsDuplicateDialogVisible] = useState(false);
    const [pendingPlaylistId, setPendingPlaylistId] = useState<string | null>(null);
    const [isAddingToPlaylist, setIsAddingToPlaylist] = useState(false);

    // Submenu and Remove State
    const [isSubmenuVisible, setIsSubmenuVisible] = useState(false);
    const [isRemoveConfirmVisible, setIsRemoveConfirmVisible] = useState(false);
    const [isDeleteConfirmVisible, setIsDeleteConfirmVisible] = useState(false);
    const [isTrackOptionsVisible, setIsTrackOptionsVisible] = useState(false);
    const [isDownloadConfirmVisible, setIsDownloadConfirmVisible] = useState(false);

    // Pagination State
    const [startIndex, setStartIndex] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [isFetchingMore, setIsFetchingMore] = useState(false);
    const PAGE_LIMIT = 100;

    const loadMoreTracks = React.useCallback(() => {
        if (!hasMore || isFetchingMore || loading || tracksLoading || dataSource === 'local') return;
        setIsFetchingMore(true);
        const nextIndex = startIndex + PAGE_LIMIT;
        setStartIndex(nextIndex);
        fetchDetails(false, nextIndex).finally(() => setIsFetchingMore(false));
    }, [hasMore, isFetchingMore, loading, tracksLoading, dataSource, startIndex]);

    // Multi-select mode state
    const [isSelectionMode, setIsSelectionMode] = useState(false);
    const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
    const [isSelectionMenuVisible, setIsSelectionMenuVisible] = useState(false);

    const toggleTrackSelection = React.useCallback((trackId: string) => {
        setSelectedTracks(prevSet => {
            const newSet = new Set(prevSet);
            if (newSet.has(trackId)) {
                newSet.delete(trackId);
                if (newSet.size === 0) {
                    setIsSelectionMode(false);
                }
            } else {
                newSet.add(trackId);
            }
            return newSet;
        });
    }, []);

    const handleLongPress = React.useCallback((track: any) => {
        if (!isSelectionMode) {
            setIsSelectionMode(true);
            setSelectedTracks(prevSet => {
                const newSet = new Set(prevSet);
                newSet.add(track.Id);
                return newSet;
            });
        } else {
            toggleTrackSelection(track.Id);
        }
    }, [isSelectionMode, toggleTrackSelection]);

    const exitSelectionMode = () => {
        setIsSelectionMode(false);
        setSelectedTracks(new Set());
        setIsSelectionMenuVisible(false);
    };

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        setStartIndex(0);
        setHasMore(true);
        clearCachedData(itemId); // Clear cache on manual refresh
        if (dataSource === 'local') {
            await localLibrary.refreshLibrary(true);
            setTracks(localLibrary.getFilteredTracks().map(t => ({
                Id: t.id,
                Name: t.name,
                AlbumArtist: t.artist,
                Album: t.album,
                ImageUrl: t.imageUrl,
                RunTimeTicks: t.durationMillis * 10000,
                streamUrl: t.streamUrl,
                bitrate: t.bitrate,
                codec: t.codec,
                container: t.container,
                lyrics: t.lyrics,
                isFavorite: t.isFavorite
            })));
        } else {
            await fetchDetails(true);
        }
        setRefreshing(false);
    }, [dataSource, fetchDetails, localLibrary, itemId]);

    const handleDeleteSelected = async () => {
        setIsSelectionMenuVisible(false);
        const isLocal = dataSource === 'local';

        const performBatchDelete = async () => {
            try {
                if (isLocal) {
                    const tracksToDelete = localLibrary.tracks.filter(t => selectedTracks.has(t.id));
                    for (const track of tracksToDelete) {
                        await localLibrary.deleteTrack(track);
                    }
                } else {
                    const ids = Array.from(selectedTracks);
                    for (const id of ids) await jellyfinApi.deleteItem(id);
                }
                fetchDetails();
                exitSelectionMode();
            } catch (error: any) {
                console.error('Batch delete failed', error);
                const msg = error?.response?.data || error?.message || 'Unknown error';
                Alert.alert('Error', `Some items could not be deleted: ${msg}`);
            }
        };

        if (isLocal) {
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

    const handleDownloadSelected = async () => {
        setIsSelectionMenuVisible(false);
        const tracksToDownload = tracks.filter(t => selectedTracks.has(t.Id));

        const executeSelectedDownload = async () => {
            const groupName = item?.Type === 'Playlist' || item?.Type === 'MusicAlbum' ? item.Name : 'Selection';
            const groupId = `batch-${Date.now()}`;

            for (const track of tracksToDownload) {
                await downloadService.queueTrack({
                    id: track.Id,
                    name: track.Name,
                    artist: track.AlbumArtist || track.Artists?.[0] || 'Unknown',
                    album: track.Album || item?.Name,
                    imageUrl: jellyfinApi.getImageUrl(track.Id),
                    durationMillis: track.RunTimeTicks ? track.RunTimeTicks / 10000 : undefined,
                    groupId,
                    groupName
                });
            }
            exitSelectionMode();
        };

        if (tracksToDownload.length >= 20) {
            Alert.alert(
                "Large Download",
                `You are about to download ${tracksToDownload.length} selected songs. This may consume significant data and take a while to complete.\n\nAre you sure you want to proceed?`,
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Download", onPress: executeSelectedDownload }
                ]
            );
        } else {
            executeSelectedDownload();
        }
    };

    const handleAddSelectedToPlaylist = () => {
        // Close selection menu if open and fetch playlists before showing dialog
        setIsSelectionMenuVisible(false);
        fetchPlaylists();
        setIsAddToPlaylistVisible(true);
    };




    const getPlaylistRandomColor = () => {
        const vibrantColors = [
            '#FF4D4D', '#FF9E4D', '#FFD74D', '#4DFF88', 
            '#4DFFFF', '#4D88FF', '#9E4DFF', '#FF4DFF',
            '#FF4D88', '#4DFFD7'
        ];
        return vibrantColors[Math.floor(Math.random() * vibrantColors.length)];
    };

    const formatDuration = (ticks: number) => {

        const minutes = Math.floor(ticks / 600000000);
        const hours = Math.floor(minutes / 60);
        const remainingMinutes = minutes % 60;
        if (hours > 0) {
            return `${hours} hr ${remainingMinutes} min`;
        }
        return `${minutes} min`;
    };

    useEffect(() => {
        // Defer fetching until transition completes to ensure smooth animation
        const interactionPromise = InteractionManager.runAfterInteractions(() => {
            fetchDetails();
        });

        return () => interactionPromise.cancel();
    }, [itemId, dataSource, localLibrary.tracks, localLibrary.selectedFolderPaths]); // Re-fetch when tracks are enriched or folder selection changes

    async function fetchDetails(isManualRefresh = false, currentStartIndex = 0) {
        let finalItem = null;
        let finalTracks = [];
        let finalArtistAlbums = [];
        let finalSimilarArtists = [];

        // Check cache first
        if (!isManualRefresh && currentStartIndex === 0) {
            const cached = getCachedData(itemId);
            if (cached) {
                setItem(cached.item);
                setTracks(cached.tracks);
                setArtistAlbums(cached.artistAlbums);
                setSimilarArtists(cached.similarArtists);
                setLoading(false);
                setTracksLoading(false);
                return;
            }
        }

        setTracksLoading(true);
        if (!item) setLoading(true);

        try {
            // LOCAL MODE
            if (dataSource === 'local') {
                let details = item;
                let localTracks: any[] = [];

                if (itemId === 'all-songs') {
                    if (!details) details = { Id: 'all-songs', Name: 'All Songs', Type: 'Playlist' };
                    try {
                        const { selectedFolderPaths, availableFolders } = localLibrary;
                        let dbTracks: any[] = [];
                        const cachedTracks = localLibrary.getFilteredTracks();
                        if (cachedTracks.length > 0) {
                            dbTracks = cachedTracks;
                        } else {
                            if (availableFolders.length === 0) {
                                dbTracks = await DatabaseService.getAllTracks();
                            } else if (selectedFolderPaths.length === 0) {
                                dbTracks = [];
                            } else {
                                dbTracks = await DatabaseService.getTracksByFolders(selectedFolderPaths);
                            }
                        }
                        localTracks = dbTracks.map(t => ({
                            Id: t.id, Name: t.name, AlbumArtist: t.artist, Album: t.album,
                            ImageUrl: t.imageUrl, RunTimeTicks: t.durationMillis * 10000,
                            streamUrl: t.streamUrl, bitrate: t.bitrate, codec: t.codec,
                            container: t.container, lyrics: t.lyrics, isFavorite: t.isFavorite
                        }));
                    } catch (dbError) {
                        localTracks = localLibrary.getFilteredTracks().map(t => ({
                            Id: t.id, Name: t.name, AlbumArtist: t.artist, Album: t.album,
                            ImageUrl: t.imageUrl, RunTimeTicks: t.durationMillis * 10000,
                            streamUrl: t.streamUrl, bitrate: t.bitrate, codec: t.codec,
                            container: t.container, lyrics: t.lyrics, isFavorite: t.isFavorite
                        }));
                    }
                } else if (itemId === 'liked-songs') {
                    if (!details) details = { Id: 'liked-songs', Name: 'Liked Songs', Type: 'Playlist' };
                    localTracks = localLibrary.getFavoriteTracks().map(t => ({
                        Id: t.id, Name: t.name, AlbumArtist: t.artist, Album: t.album,
                        ImageUrl: t.imageUrl, RunTimeTicks: t.durationMillis * 10000,
                        streamUrl: t.streamUrl, bitrate: t.bitrate, codec: t.codec,
                        container: t.container, lyrics: t.lyrics, isFavorite: true
                    }));
                } else if (type === 'MusicArtist') {
                    const dbTracks = await DatabaseService.getTracksByArtist(itemId);
                    const artistName = dbTracks[0]?.artist || itemId || 'Unknown Artist';
                    details = { Id: itemId, Name: artistName, Type: 'MusicArtist' };
                    localTracks = dbTracks.map(t => ({
                        Id: t.id, Name: t.name, AlbumArtist: t.artist, Album: t.album,
                        ImageUrl: t.imageUrl, RunTimeTicks: t.durationMillis * 10000,
                        streamUrl: t.streamUrl, bitrate: t.bitrate, codec: t.codec,
                        container: t.container, lyrics: t.lyrics, isFavorite: t.isFavorite
                    }));
                    try {
                        const dbAlbums = await DatabaseService.getAlbumsByArtist(itemId);
                        finalArtistAlbums = dbAlbums;
                    } catch (albumError) {}
                } else if (type === 'MusicAlbum') {
                    const dbTracks = await DatabaseService.getTracksByAlbum(itemId);
                    const albumName = dbTracks[0]?.album || 'Unknown Album';
                    const artistName = dbTracks[0]?.artist || 'Unknown Artist';
                    details = { Id: itemId, Name: albumName, Type: 'MusicAlbum', AlbumArtist: artistName };
                    localTracks = dbTracks.map(t => ({
                        Id: t.id, Name: t.name, AlbumArtist: t.artist, Album: t.album,
                        ImageUrl: t.imageUrl, RunTimeTicks: t.durationMillis * 10000,
                        streamUrl: t.streamUrl, bitrate: t.bitrate, codec: t.codec,
                        container: t.container, lyrics: t.lyrics, isFavorite: t.isFavorite
                    }));
                } else if (type === 'Playlist') {
                    const playlist = localLibrary.playlists.find(p => p.id === itemId);
                    if (playlist) {
                        details = { Id: playlist.id, Name: playlist.name, Type: 'Playlist', isLocal: true };
                        localTracks = localLibrary.getPlaylistTracks(itemId).map(t => ({
                            Id: t.id, Name: t.name, AlbumArtist: t.artist, Album: t.album,
                            ImageUrl: t.imageUrl, RunTimeTicks: t.durationMillis * 10000,
                            streamUrl: t.streamUrl, PlaylistItemId: t.id, bitrate: t.bitrate,
                            codec: t.codec, container: t.container, lyrics: t.lyrics, isFavorite: t.isFavorite
                        }));
                    }
                } else if (type === 'MusicGenre') {
                    const dbTracks = await DatabaseService.getAllTracks();
                    // 1. Find all artists who have at least one song in this genre
                    const artistsInGenre = Array.from(new Set(
                        dbTracks.filter(t => t.genre === itemId).map(t => t.artist).filter(Boolean)
                    ));

                    // 2. Get all tracks from these artists
                    const artistTracks = dbTracks.filter(t => artistsInGenre.includes(t.artist));
                    localTracks = artistTracks.map(t => ({
                        Id: t.id, Name: t.name, AlbumArtist: t.artist, Album: t.album,
                        ImageUrl: t.imageUrl, RunTimeTicks: t.durationMillis * 10000,
                        streamUrl: t.streamUrl, bitrate: t.bitrate, codec: t.codec,
                        container: t.container, lyrics: t.lyrics, isFavorite: t.isFavorite
                    }));
                    details = { Id: itemId, Name: itemId, Type: 'MusicGenre' };

                    // 3. Get unique albums from these artists
                    const albumMap = new Map();
                    artistTracks.forEach(t => {
                        if (t.album && !albumMap.has(t.album)) {
                            albumMap.set(t.album, { Id: t.album, Name: t.album, Type: 'MusicAlbum', ImageUrl: t.imageUrl });
                        }
                    });
                    finalArtistAlbums = Array.from(albumMap.values());
                    setArtistAlbums(finalArtistAlbums);

                    // 4. Get unique artists
                    const artistMap = new Map();
                    artistTracks.forEach(t => {
                        if (t.artist && !artistMap.has(t.artist)) {
                            artistMap.set(t.artist, { Id: t.artist, Name: t.artist, Type: 'MusicArtist', ImageUrl: t.imageUrl });
                        }
                    });
                    finalSimilarArtists = Array.from(artistMap.values());
                    setSimilarArtists(finalSimilarArtists);
                }
                finalItem = details;
                finalTracks = localTracks;
                setItem(details);
                setTracks(localTracks);
            } else {
                // JELLYFIN MODE
                let details = item;
                if (!details) {
                    if (itemId === 'all-songs') {
                        details = { Id: 'all-songs', Name: 'All Songs', Type: 'Playlist' };
                    } else if (itemId === 'liked-songs') {
                        details = { Id: 'liked-songs', Name: 'Liked Songs', Type: 'Playlist' };
                    } else {
                        details = await jellyfinApi.getItem(itemId);
                    }
                }
                finalItem = details;
                setItem(details);

                let itemsData;
                if (itemId === 'all-songs') {
                    itemsData = await jellyfinApi.getItems({ IncludeItemTypes: 'Audio', Recursive: true, SortBy: 'SortName', Limit: PAGE_LIMIT, StartIndex: currentStartIndex });
                } else if (itemId === 'liked-songs') {
                    itemsData = await jellyfinApi.getItems({ IncludeItemTypes: 'Audio', Recursive: true, SortBy: 'SortName', Filters: 'IsFavorite', Limit: PAGE_LIMIT, StartIndex: currentStartIndex });
                } else if (type === 'MusicArtist') {
                    itemsData = await jellyfinApi.getItems({ ArtistIds: itemId, IncludeItemTypes: 'Audio', Recursive: true, SortBy: 'PlayCount', SortOrder: 'Descending', Limit: 10 });
                    try {
                        const albumsRes = await jellyfinApi.getItems({ ArtistIds: itemId, IncludeItemTypes: 'MusicAlbum', Recursive: true, SortBy: 'ProductionYear,SortName', SortOrder: 'Descending' });
                        finalArtistAlbums = albumsRes.Items || [];
                        setArtistAlbums(finalArtistAlbums);
                    } catch (e) {}
                    try {
                        const similarRes = await jellyfinApi.getSimilarItems(itemId);
                        finalSimilarArtists = similarRes.Items || [];
                        setSimilarArtists(finalSimilarArtists);
                    } catch (e) {}
                } else if (type === 'Playlist') {
                    itemsData = await jellyfinApi.getPlaylistItems(itemId);
                } else if (type === 'MusicGenre') {
                    // First, fetch artists that belong to this genre
                    const artistsRes = await jellyfinApi.getItems({ 
                        GenreIds: itemId, 
                        IncludeItemTypes: 'MusicArtist', 
                        Recursive: true, 
                        SortBy: 'SortName' 
                    });
                    const artists = artistsRes.Items || [];
                    finalSimilarArtists = artists;
                    setSimilarArtists(artists);

                    if (artists.length > 0) {
                        const artistIds = artists.map(a => a.Id).join(',');
                        
                        // Fetch albums by these artists
                        try {
                            const albumsRes = await jellyfinApi.getItems({ 
                                ArtistIds: artistIds, 
                                IncludeItemTypes: 'MusicAlbum', 
                                Recursive: true, 
                                SortBy: 'ProductionYear,SortName', 
                                SortOrder: 'Descending' 
                            });
                            finalArtistAlbums = albumsRes.Items || [];
                            setArtistAlbums(finalArtistAlbums);
                        } catch (e) {
                            console.warn("Failed to fetch genre albums via artists", e);
                        }

                        // Fetch songs by these artists
                        try {
                            itemsData = await jellyfinApi.getItems({ 
                                ArtistIds: artistIds, 
                                IncludeItemTypes: 'Audio', 
                                Recursive: true, 
                                SortBy: 'SortName',
                                Limit: PAGE_LIMIT,
                                StartIndex: currentStartIndex
                            });
                        } catch (e) {
                            console.warn("Failed to fetch genre songs via artists", e);
                            itemsData = { Items: [] };
                        }
                    } else {
                        // Fallback: If no artists found, try fetching items directly by genre (original behavior)
                        itemsData = await jellyfinApi.getItems({ GenreIds: itemId, IncludeItemTypes: 'Audio', Recursive: true, SortBy: 'SortName', Limit: PAGE_LIMIT, StartIndex: currentStartIndex });
                        try {
                            const albumsRes = await jellyfinApi.getItems({ GenreIds: itemId, IncludeItemTypes: 'MusicAlbum', Recursive: true, SortBy: 'SortName' });
                            finalArtistAlbums = albumsRes.Items || [];
                            setArtistAlbums(finalArtistAlbums);
                        } catch (e) {}
                    }
                } else {
                    itemsData = await jellyfinApi.getItems({ ParentId: itemId, IncludeItemTypes: 'Audio', Recursive: true, SortBy: 'ParentIndexNumber,IndexNumber', Limit: PAGE_LIMIT, StartIndex: currentStartIndex });
                }
                
                if (currentStartIndex > 0) {
                    finalTracks = [...tracks, ...(itemsData.Items || [])];
                    setTracks(prev => [...prev, ...(itemsData.Items || [])]);
                } else {
                    finalTracks = itemsData.Items || [];
                    setTracks(itemsData.Items || []);
                }
                
                // If itemsData doesn't have exactly PAGE_LIMIT, there are no more pages
                setHasMore((itemsData.Items?.length || 0) === PAGE_LIMIT);
            }

            if (currentStartIndex === 0) {
                setCachedData(itemId, { item: finalItem, tracks: finalTracks, artistAlbums: finalArtistAlbums, similarArtists: finalSimilarArtists });
            }

        } catch (error) {
            console.error('Failed to fetch details', error);
        } finally {
            setLoading(false);
            setTracksLoading(false);
        }
    };

    const applyGlowAndAnimation = async (data: { item: any, type: string }) => {
        try {
            let selectedColor = null;

            if (data.type === 'MusicArtist' && data.item?.Id) {
                const imgUrl = jellyfinApi.getImageUrl(data.item.Id);
                const colors = await ImageColors.getColors(imgUrl, {
                    fallback: theme.colors.primary,
                    cache: true,
                    key: data.item.Id,
                });
                if (colors.platform === 'android') {
                    selectedColor = colors.vibrant || colors.dominant;
                } else if (colors.platform === 'ios') {
                    selectedColor = colors.primary || colors.background;
                }
            } else if (data.type === 'Playlist' || data.type === 'MusicGenre') {
                selectedColor = getPlaylistRandomColor();
            }

            if (selectedColor) {
                setGlowColor(lightenHexColor(selectedColor, 0.3));
            }

            // Animate
            fadeAnim.setValue(0);
            slideAnim.setValue(20);
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 1200,
                    useNativeDriver: true,
                }),
            ]).start();
        } catch (error) {
            console.warn('Glow color extraction failed:', error);
        }
    };

    useEffect(() => {
        if (item && item.Id) {
            applyGlowAndAnimation({ item, type });
        }
    }, [item]);



    const fetchPlaylists = async () => {
        try {
            if (dataSource === 'local') {
                // Get local playlists
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

    // Open submenu when in a playlist, otherwise open track options menu
    const openTrackMenu = (trackId: string, trackEntryId?: string) => {
        setSelectedTrackId(trackId);
        setSelectedTrackEntryId(trackEntryId || null);

        // If we're viewing a playlist (not special views), show submenu with remove option
        // ENABLED for Liked Songs (treated as unlike), DISABLED for All Songs
        if (item?.Type === 'Playlist' && itemId !== 'all-songs') {
            setIsSubmenuVisible(true);
        } else {
            // Otherwise, show track options menu
            setIsTrackOptionsVisible(true);
        }
    };

    // Helper to convert track data to player Track format
    const getTrackForQueue = (trackId: string) => {
        const trackData = tracks.find(t => t.Id === trackId);
        if (!trackData) return null;
        const isLocal = dataSource === 'local';
        return {
            id: trackData.Id,
            name: trackData.Name,
            artist: trackData.AlbumArtist || trackData.Artists?.[0] || 'Unknown',
            album: trackData.Album || 'Unknown',
            imageUrl: trackData.ImageUrl || (dataSource === 'jellyfin' ? jellyfinApi.getImageUrl(trackData.Id) : ''),
            imageBlurHash: trackData.ImageBlurHashes?.Primary ? Object.values(trackData.ImageBlurHashes.Primary)[0] as string : undefined,
            durationMillis: trackData.RunTimeTicks ? trackData.RunTimeTicks / 10000 : 0,
            streamUrl: trackData.streamUrl || '',
            artistId: trackData.ArtistItems?.[0]?.Id || '',
            isFavorite: trackData.UserData?.IsFavorite,
            // Technical details - use direct properties for local, MediaSources for Jellyfin
            bitrate: isLocal ? trackData.bitrate : trackData.MediaSources?.[0]?.Bitrate,
            codec: isLocal ? trackData.codec : (trackData.MediaSources?.[0]?.Codec || trackData.MediaSources?.[0]?.MediaStreams?.find((s: any) => s.Type === 'Audio')?.Codec),
        };
    };

    const handlePlayNext = () => {
        if (!selectedTrackId) return;
        const track = getTrackForQueue(selectedTrackId);
        if (track) {
            addToQueueNext(track);
        }
        setIsTrackOptionsVisible(false);
        setIsSubmenuVisible(false);
        setSelectedTrackId(null);
    };

    const handleAddToQueue = () => {
        if (!selectedTrackId) return;
        const track = getTrackForQueue(selectedTrackId);
        if (track) {
            addToQueueEnd(track);
        }
        setIsTrackOptionsVisible(false);
        setIsSubmenuVisible(false);
        setSelectedTrackId(null);
    };

    const handleOpenAddToPlaylistFromOptions = () => {
        setIsTrackOptionsVisible(false);
        fetchPlaylists();
        setIsAddToPlaylistVisible(true);
    };

    const handleAddToAnotherPlaylist = () => {
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
        if (itemId === 'liked-songs') {
            if (!selectedTrackId) return;
            try {
                if (dataSource === 'local') {
                    localLibrary.toggleFavorite(selectedTrackId);
                } else {
                    await jellyfinApi.unmarkFavorite(selectedTrackId);
                }
                // Update player store to reflect change globally
                usePlayerStore.getState().updateTrackFavorite(selectedTrackId, false);

                // Remove from current list
                setTracks(tracks.filter(t => t.Id !== selectedTrackId));

                setIsRemoveConfirmVisible(false);
                setSelectedTrackId(null);
                setSelectedTrackEntryId(null);
            } catch (error) {
                console.error('Failed to remove from Liked Songs:', error);
            }
            return;
        }

        if (!selectedTrackEntryId || !itemId) return;
        try {
            if (dataSource === 'local' || item?.isLocal) {
                // Remove from local playlist
                localLibrary.removeFromPlaylist(itemId, selectedTrackEntryId);
                setTracks(tracks.filter(t => t.Id !== selectedTrackEntryId));
            } else {
                await jellyfinApi.removeFromPlaylist(itemId, [selectedTrackEntryId]);
                setTracks(tracks.filter(t => t.PlaylistItemId !== selectedTrackEntryId));
            }
            setIsRemoveConfirmVisible(false);
            setSelectedTrackId(null);
            setSelectedTrackEntryId(null);
        } catch (error) {
            console.error('Failed to remove from playlist:', error);
        }
    };

    const handleDeleteTrack = async () => {
        setIsTrackOptionsVisible(false);
        if (!selectedTrackId) return;

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
                                const fullTrack = localLibrary.tracks.find(t => t.id === selectedTrackId);
                                if (fullTrack) {
                                    await localLibrary.deleteTrack(fullTrack);
                                }
                            } else {
                                await jellyfinApi.deleteItem(selectedTrackId);
                            }
                            // Update list
                            setTracks(prev => prev.filter(t => t.Id !== selectedTrackId));
                        } catch (error) {
                            Alert.alert('Error', 'Failed to delete item.');
                        }
                    }
                }
            ]
        );
        setSelectedTrackId(null);
    };

    const handleOpenDeleteConfirm = () => {
        setIsTrackOptionsVisible(false); // or submenu
        setIsSubmenuVisible(false);
        setIsDeleteConfirmVisible(true);
    };

    const openAddToPlaylistDialog = (trackId: string) => {
        setSelectedTrackId(trackId);
        fetchPlaylists();
        setIsAddToPlaylistVisible(true);
    };

    const handleAddToPlaylist = async (playlistId: string) => {
        // Get the track IDs to add - either from selection mode or single track
        const trackIdsToAdd = isSelectionMode && selectedTracks.size > 0
            ? Array.from(selectedTracks)
            : selectedTrackId ? [selectedTrackId] : [];

        if (trackIdsToAdd.length === 0) return;

        setIsAddingToPlaylist(true);

        try {
            if (dataSource === 'local') {
                // For local, check if any are already in playlist
                const playlist = localLibrary.playlists.find(p => p.id === playlistId);
                const existingIds = playlist?.trackIds || [];
                const duplicates = trackIdsToAdd.filter(id => existingIds.includes(id));

                if (duplicates.length > 0) {
                    setIsAddingToPlaylist(false);
                    setPendingPlaylistId(playlistId);
                    setIsDuplicateDialogVisible(true);
                } else {
                    await confirmAddToPlaylist(playlistId);
                }
            } else {
                // Jellyfin mode - check for duplicates
                const playlistItems = await jellyfinApi.getItems({ ParentId: playlistId });
                const existingIds = new Set(playlistItems.Items.map((item: any) => item.Id));
                const duplicates = trackIdsToAdd.filter(id => existingIds.has(id));

                if (duplicates.length > 0) {
                    setIsAddingToPlaylist(false);
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
        // Get the track IDs to add - either from selection mode or single track
        const trackIdsToAdd = isSelectionMode && selectedTracks.size > 0
            ? Array.from(selectedTracks)
            : selectedTrackId ? [selectedTrackId] : [];

        if (trackIdsToAdd.length === 0) return;

        setIsAddingToPlaylist(true);

        try {
            if (dataSource === 'local') {
                // Add all tracks to local playlist
                for (const trackId of trackIdsToAdd) {
                    localLibrary.addToPlaylist(playlistId, trackId);
                }
            } else {
                // Add all tracks to Jellyfin playlist
                await jellyfinApi.addToPlaylist(playlistId, trackIdsToAdd);
            }
            setIsAddingToPlaylist(false);
            setIsAddToPlaylistVisible(false);
            setIsDuplicateDialogVisible(false);
            setPendingPlaylistId(null);

            // Exit selection mode after adding
            if (isSelectionMode) {
                exitSelectionMode();
            }
        } catch (error) {
            console.error('Failed to add to playlist:', error);
            setIsAddingToPlaylist(false);
        }
    };

    const handleTrackPress = async (track: any) => {
        // Find index in current tracks
        const index = tracks.findIndex((t: any) => (t.Id || t.id) === (track.Id || track.id));
        if (index === -1) return;

        // DEEP OPTIMIZATION: Use setRawQueue with store-level mapping
        const mappedTracks = usePlayerStore.getState().setRawQueue(tracks, dataSource, itemId, type || '');

        // Provide the EXACT ID of the song I want to play to avoid shuffle misalignment
        const trackIdToPlay = mappedTracks[index].id;
        const currentMappedQueue = usePlayerStore.getState().queue;
        const targetTrack = currentMappedQueue.find(t => t.id === trackIdToPlay);

        if (targetTrack) {
            await usePlayerStore.getState().playTrack(targetTrack);
        }
    };

    const handlePlayAll = async () => {
        if (tracks.length === 0) return;

        // DEEP OPTIMIZATION: Map in store directly
        const mappedTracks = usePlayerStore.getState().setRawQueue(tracks, dataSource, itemId, type || '');
        await usePlayerStore.getState().playTrack(mappedTracks[0]);
    };

    // Batch download all tracks
    const handleDownloadAll = async () => {
        if (tracks.length === 0 || dataSource === 'local') return;
        setIsDownloadConfirmVisible(false);

        const executeBatchDownload = async () => {
            const groupName = item?.Type === 'Playlist' || item?.Type === 'MusicAlbum' ? item.Name : 'Batch Download';
            const groupId = `batch-${Date.now()}`;

            for (const track of tracks) {
                await downloadService.queueTrack({
                    id: track.Id,
                    name: track.Name,
                    artist: track.AlbumArtist || track.Artists?.[0] || 'Unknown',
                    album: track.Album || item?.Name,
                    imageUrl: jellyfinApi.getImageUrl(track.Id),
                    durationMillis: track.RunTimeTicks ? track.RunTimeTicks / 10000 : undefined,
                    groupId,
                    groupName
                });
            }
        };

        if (tracks.length >= 20) {
            Alert.alert(
                "Large Download",
                `You are about to download ${tracks.length} songs. This may consume significant data and take a while to complete.\n\nAre you sure you want to proceed?`,
                [
                    { text: "Cancel", style: "cancel" },
                    { text: "Download", onPress: executeBatchDownload }
                ]
            );
        } else {
            executeBatchDownload();
        }
    };

    const handleShufflePlay = async () => {
        if (tracks.length === 0) return;

        const { queueLimit } = useSettingsStore.getState();
        const fetchLimit = queueLimit > 0 ? queueLimit : 1000;

        let songsToShuffle = tracks;

        if (hasMore) {
            try {
                const params: any = {
                    IncludeItemTypes: 'Audio',
                    Recursive: true,
                    SortBy: 'Random',
                    Limit: fetchLimit,
                };

                if (itemId === 'all-songs') {
                    // No specific parent or filter needed for all songs
                } else if (itemId === 'liked-songs') {
                    params.Filters = 'IsFavorite';
                } else if (type === 'MusicGenre') {
                    params.GenreIds = itemId;
                } else {
                    params.ParentId = itemId;
                }

                const itemsData = await jellyfinApi.getItems(params);
                if (itemsData && itemsData.Items) {
                    songsToShuffle = itemsData.Items;
                }
            } catch (error) {
                console.error('Failed to fetch random songs for shuffle:', error);
                // Fallback to current tracks
                songsToShuffle = tracks;
            }
        }

        // Map tracks in store, then shuffle via store (single-pass, no double work)
        const mappedTracks = usePlayerStore.getState().setRawQueue(songsToShuffle, dataSource, itemId, type || '');
        // Enable shuffle mode in the store (this shuffles the already-mapped queue)
        const store = usePlayerStore.getState();
        if (!store.shuffleMode) {
            store.toggleShuffle();
        }
        // Play the first track in the now-shuffled queue
        const shuffledQueue = usePlayerStore.getState().queue;
        await usePlayerStore.getState().playTrack(shuffledQueue[0]);
    };

    const handleOpenDialog = React.useCallback((trackId: string, trackEntryId?: string) => {
        openTrackMenu(trackId, trackEntryId);
    }, [openTrackMenu, item]);

    const isDraggable = item?.Type === 'Playlist' && dataSource === 'local' && itemId !== 'liked-songs' && itemId !== 'all-songs';

    const renderItem = React.useCallback(({ item: trackItem, getIndex, drag, isActive }: RenderItemParams<any>) => {
        const index = getIndex() ?? 0;
        const isSelected = selectedTracks.has(trackItem.Id);

        return (
            <SongItem
                item={trackItem}
                index={index}
                isCurrent={currentTrack?.id === trackItem.Id}
                isPlaying={isPlaying}
                onPress={() => isSelectionMode ? toggleTrackSelection(trackItem.Id) : handleTrackPress(trackItem)}
                onLongPress={() => handleLongPress(trackItem)}
                onMenuPress={() => handleOpenDialog(trackItem.Id, item?.Type === 'Playlist' ? trackItem.PlaylistItemId : undefined)}
                isSelectionMode={isSelectionMode}
                isSelected={isSelected}
                showEqualizer={true}
                drag={isDraggable && !isSelectionMode ? drag : undefined}
                isActive={isActive}
                // DetailScreen specific:
                getImageUrl={(t) => t.ImageUrl || (dataSource === 'jellyfin' ? jellyfinApi.getImageUrl(t.Id) : undefined)}
            />
        );
    }, [handleTrackPress, handleOpenDialog, item, currentTrack, isPlaying, isSelectionMode, selectedTracks, dataSource, isDraggable, toggleTrackSelection, handleLongPress]);

    const headerImage = useMemo(() => {
        if (!item) return null;
        if (item.Id === 'all-songs') return null;
        if (item.Id === 'liked-songs') return null;
        if (item.ImageUrl) return item.ImageUrl;
        // For Jellyfin, the item itself (Artist, Album, Playlist) usually has its own image endpoint
        if (dataSource === 'jellyfin') return jellyfinApi.getImageUrl(item.Id);
        // Fallback for local items without explicit images to use the first track's image
        if (tracks.length > 0 && tracks[0].ImageUrl) return tracks[0].ImageUrl;
        return null;
    }, [item?.Id, item?.ImageUrl, dataSource, tracks.length > 0 ? tracks[0].ImageUrl : null]);

    if (loading || !item) {
        return <Loader />;
    }

    const renderArtistHeader = () => {
        const backdropUrl = dataSource === 'jellyfin' ? jellyfinApi.getImageUrl(item.Id, 'Backdrop') : headerImage;
        return (
            <View style={{ marginBottom: 24 }}>
                {backdropUrl && (
                    <View style={{ width: '100%', height: 300, position: 'absolute', top: 0 }}>
                        <Image source={{ uri: backdropUrl }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                        <LinearGradient colors={['transparent', theme.colors.background]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 180 }} />
                    </View>
                )}

                <View style={[styles.header, { paddingTop: backdropUrl ? 200 : 20, marginBottom: 16 }]}>
                    <Text variant="displaySmall" style={[styles.title, { fontWeight: '900' }]}>{item.Name}</Text>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                        {tracks.length} Top Tracks
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, width: '100%', justifyContent: 'center', gap: 12 }}>
                        <Button mode="contained" icon="play" onPress={handlePlayAll} style={[styles.playButton, { marginTop: 0 }]} contentStyle={{ paddingHorizontal: 16 }}>Play</Button>
                        <ShuffleFab size={48} onPress={handleShufflePlay} />
                        <IconButton
                            icon="sort-variant"
                            size={28}
                            style={{ backgroundColor: theme.colors.surfaceVariant, margin: 0 }}
                            onPress={() => setIsSortMenuVisible(true)}
                        />
                        {dataSource !== 'local' && tracks.length > 0 ? (
                            <IconButton 
                                icon="download" 
                                size={28} 
                                style={{ backgroundColor: theme.colors.surfaceVariant, margin: 0 }} 
                                onPress={() => setIsDownloadConfirmVisible(true)} 
                            />
                        ) : null}
                    </View>

                </View>

                {!!item.Overview && (
                    <Pressable style={{ paddingHorizontal: 20, marginBottom: 24 }} onPress={() => setIsBioExpanded(!isBioExpanded)}>
                        <Text variant="labelLarge" style={{ color: theme.colors.primary, marginBottom: 8 }}>ABOUT</Text>
                        <Text variant="bodyMedium" numberOfLines={isBioExpanded ? undefined : 3} style={{ color: theme.colors.onSurfaceVariant, lineHeight: 20 }}>
                            {item.Overview}
                        </Text>
                    </Pressable>
                )}

                {artistAlbums.length > 0 ? (
                    <View style={{ marginBottom: 24 }}>
                        <Text variant="titleMedium" style={{ paddingHorizontal: 20, marginLeft: 20, marginBottom: 12, fontWeight: 'bold' }}>Albums & EPs</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}>
                            {artistAlbums.map((album) => (
                                <Pressable key={album.Id} style={{ width: 140 }} onPress={() => (navigation as any).navigate('Detail', { itemId: album.Id, type: 'MusicAlbum' })}>
                                    <Image source={{ uri: jellyfinApi.getImageUrl(album.Id) }} style={{ width: 140, height: 140, borderRadius: 8, marginBottom: 8, backgroundColor: theme.colors.surfaceVariant }} />
                                    <Text variant="bodyMedium" numberOfLines={1} style={{ fontWeight: 'bold' }}>{album.Name}</Text>
                                    <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>{album.ProductionYear || 'Album'}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                ) : null}

                {similarArtists.length > 0 ? (
                    <View style={{ marginBottom: 24 }}>
                        <Text variant="titleMedium" style={{ paddingHorizontal: 20, marginLeft: 20, marginBottom: 12, fontWeight: 'bold' }}>Similar Artists</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}>
                            {similarArtists.map((artist) => (
                                <Pressable key={artist.Id} style={{ width: 100, alignItems: 'center' }} onPress={() => (navigation as any).push('Detail', { itemId: artist.Id, type: 'MusicArtist' })}>
                                    <Image source={{ uri: jellyfinApi.getImageUrl(artist.Id) }} style={{ width: 100, height: 100, borderRadius: 50, marginBottom: 8, backgroundColor: theme.colors.surfaceVariant }} />
                                    <Text variant="bodySmall" numberOfLines={2} style={{ textAlign: 'center' }}>{artist.Name}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                ) : null}

                <Text variant="titleMedium" style={{ paddingHorizontal: 20, marginLeft: 20, marginBottom: 8, fontWeight: 'bold' }}>Top Tracks</Text>
            </View>
        );
    };

    const renderPlaylistHeader = () => {
        const uniqueArts = Array.from(new Set(tracks.map(t => dataSource === 'jellyfin' ? jellyfinApi.getImageUrl(t.Id) : t.ImageUrl).filter(Boolean)));
        const collageArts = uniqueArts.slice(0, 4);

        return (
            <View style={styles.header}>
                {!headerImage ? (
                    collageArts.length >= 4 ? (
                        <Surface style={[styles.artwork, { borderRadius: 12, overflow: 'hidden' }]} elevation={4}>
                            <View style={{ width: 200, height: 200, flexDirection: 'row', flexWrap: 'wrap' }}>
                                {collageArts.map((uri, i) => (
                                    <Image key={i} source={{ uri }} style={{ width: 100, height: 100 }} />
                                ))}
                            </View>
                        </Surface>
                    ) : (
                        <Surface style={[styles.artwork, { borderRadius: 12, elevation: 4, backgroundColor: theme.colors.surfaceVariant }]} elevation={4}>
                            <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
                                <Avatar.Icon size={80} icon={item.Id === 'liked-songs' ? 'heart' : 'playlist-music'} color={theme.colors.onSurfaceVariant} style={{ backgroundColor: 'transparent' }} />
                            </View>
                        </Surface>
                    )
                ) : (
                    <Surface style={styles.artwork} elevation={4}>
                        <Image source={{ uri: headerImage }} style={{ width: 200, height: 200, borderRadius: 12 }} />
                    </Surface>
                )}
                <Text variant="headlineMedium" style={styles.title}>{item.Name}</Text>

                {!!item.Overview && (
                    <Text variant="bodyMedium" numberOfLines={3} style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 }}>
                        {item.Overview}
                    </Text>
                )}

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 12 }}>
                    <Surface style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, backgroundColor: theme.colors.surfaceVariant }}>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Playlist</Text>
                    </Surface>
                    <Surface style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, backgroundColor: theme.colors.surfaceVariant }}>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{tracks.length} songs</Text>
                    </Surface>
                    <Surface style={{ paddingHorizontal: 12, paddingVertical: 4, borderRadius: 16, backgroundColor: theme.colors.surfaceVariant }}>
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>{formatDuration(tracks.reduce((acc, t) => acc + (t.RunTimeTicks || 0), 0))}</Text>
                    </Surface>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, paddingHorizontal: 20, width: '100%', justifyContent: 'center', gap: 12 }}>
                    <Button mode="contained" icon="play" onPress={handlePlayAll} style={[styles.playButton, { marginTop: 0 }]} contentStyle={{ paddingHorizontal: 16 }}>Play</Button>
                    <ShuffleFab size={48} onPress={handleShufflePlay} />
                    <IconButton
                        icon="sort-variant"
                        size={28}
                        style={{ backgroundColor: theme.colors.surfaceVariant, margin: 0 }}
                        onPress={() => setIsSortMenuVisible(true)}
                    />
                    {dataSource !== 'local' && tracks.length > 0 ? (
                        <IconButton 
                            icon="download" 
                            size={28} 
                            style={{ backgroundColor: theme.colors.surfaceVariant, margin: 0 }} 
                            onPress={() => setIsDownloadConfirmVisible(true)} 
                        />
                    ) : null}
                </View>


                <View style={{ paddingHorizontal: 20, marginTop: 24, width: '100%', marginBottom: 8 }}>
                    <TextInput
                        mode="outlined"
                        placeholder="Find in playlist"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        left={<TextInput.Icon icon="magnify" />}
                        style={{ backgroundColor: theme.colors.surface, height: 40 }}
                        dense
                    />
                </View>
            </View>
        );
    };

    const renderGenreHeader = () => {
        return (
            <View style={{ marginBottom: 24 }}>
                <View style={[styles.header, { paddingTop: 20, marginBottom: 16 }]}>
                    <Surface style={[styles.artwork, { borderRadius: 12, elevation: 4, backgroundColor: theme.colors.surfaceVariant }]} elevation={4}>
                        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
                            <Avatar.Icon size={80} icon="music-box-outline" color={theme.colors.onSurfaceVariant} style={{ backgroundColor: 'transparent' }} />
                        </View>
                    </Surface>
                    <Text variant="displaySmall" style={[styles.title, { fontWeight: '900' }]}>{item.Name}</Text>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                        Genre • {tracks.length} Songs
                    </Text>

                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, width: '100%', justifyContent: 'center', gap: 12 }}>
                        <Button mode="contained" icon="play" onPress={handlePlayAll} style={[styles.playButton, { marginTop: 0 }]} contentStyle={{ paddingHorizontal: 16 }}>Play</Button>
                        <ShuffleFab size={48} onPress={handleShufflePlay} />
                        <IconButton
                            icon="sort-variant"
                            size={28}
                            style={{ backgroundColor: theme.colors.surfaceVariant, margin: 0 }}
                            onPress={() => setIsSortMenuVisible(true)}
                        />
                        {dataSource !== 'local' && tracks.length > 0 ? (
                            <IconButton 
                                icon="download" 
                                size={28} 
                                style={{ backgroundColor: theme.colors.surfaceVariant, margin: 0 }} 
                                onPress={() => setIsDownloadConfirmVisible(true)} 
                            />
                        ) : null}
                    </View>
                </View>

                {similarArtists.length > 0 ? (
                    <View style={{ marginBottom: 24 }}>
                        <Text variant="titleMedium" style={{ paddingHorizontal: 20, marginLeft: 20, marginBottom: 12, fontWeight: 'bold' }}>Artists in this Genre</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}>
                            {similarArtists.map((artist) => (
                                <Pressable key={artist.Id} style={{ width: 100, alignItems: 'center' }} onPress={() => (navigation as any).push('Detail', { itemId: artist.Id, type: 'MusicArtist' })}>
                                    <Image source={{ uri: artist.ImageUrl || (dataSource === 'jellyfin' ? jellyfinApi.getImageUrl(artist.Id) : undefined) }} style={{ width: 100, height: 100, borderRadius: 50, marginBottom: 8, backgroundColor: theme.colors.surfaceVariant }} />
                                    <Text variant="bodySmall" numberOfLines={2} style={{ textAlign: 'center', fontWeight: 'bold' }}>{artist.Name}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                ) : null}

                {artistAlbums.length > 0 ? (
                    <View style={{ marginBottom: 24 }}>
                        <Text variant="titleMedium" style={{ paddingHorizontal: 20, marginLeft: 20, marginBottom: 12, fontWeight: 'bold' }}>Albums in this Genre</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 16 }}>
                            {artistAlbums.map((album) => (
                                <Pressable key={album.Id} style={{ width: 140 }} onPress={() => (navigation as any).navigate('Detail', { itemId: album.Id, type: 'MusicAlbum' })}>
                                    <Image source={{ uri: album.ImageUrl || (dataSource === 'jellyfin' ? jellyfinApi.getImageUrl(album.Id) : undefined) }} style={{ width: 140, height: 140, borderRadius: 8, marginBottom: 8, backgroundColor: theme.colors.surfaceVariant }} />
                                    <Text variant="bodyMedium" numberOfLines={1} style={{ fontWeight: 'bold' }}>{album.Name}</Text>
                                    <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>{album.ProductionYear || 'Album'}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                ) : null}

                <Text variant="titleMedium" style={{ paddingHorizontal: 20, marginLeft: 20, marginBottom: 8, fontWeight: 'bold' }}>Songs</Text>
            </View>
        );
    };

    const renderHeader = () => {
        if (item.Type === 'MusicArtist') {
            return renderArtistHeader();
        }
        if (item.Type === 'Playlist') {
            return renderPlaylistHeader();
        }
        if (item.Type === 'MusicGenre') {
            return renderGenreHeader();
        }
        return (
            <View style={styles.header}>
                {!headerImage ? (
                    <Surface style={[styles.artwork, { borderRadius: 12, elevation: 4, backgroundColor: theme.colors.surfaceVariant }]} elevation={4}>
                        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
                            <Avatar.Icon
                                size={80}
                                icon={item.Id === 'liked-songs' ? 'heart' : 'music'}
                                color={theme.colors.onSurfaceVariant}
                                style={{ backgroundColor: 'transparent' }}
                            />
                        </View>
                    </Surface>
                ) : (
                    <Surface style={styles.artwork} elevation={4}>
                        <Image
                            source={{ uri: headerImage }}
                            style={{ width: 200, height: 200, borderRadius: 12 }}
                        />
                    </Surface>
                )}
                <Text variant="headlineMedium" style={styles.title}>{item.Name}</Text>
                <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant }}>{item.AlbumArtist || item.Artists?.[0] || type}</Text>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                    {item.Type === 'MusicArtist' ? 'Artist' : item.ProductionYear || 'Playlist'} • {tracks.length} songs • {formatDuration(tracks.reduce((acc, t) => acc + (t.RunTimeTicks || 0), 0))}
                </Text>

                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, width: '100%', justifyContent: 'center', gap: 12 }}>
                    <Button
                        mode="contained"
                        icon="play"
                        onPress={handlePlayAll}
                        style={[styles.playButton, { marginTop: 0 }]}
                        contentStyle={{ paddingHorizontal: 16 }}
                    >
                        Play
                    </Button>
                    <ShuffleFab
                        size={48}
                        onPress={handleShufflePlay}
                    />
                    <IconButton
                        icon="sort-variant"
                        size={28}
                        style={{ backgroundColor: theme.colors.surfaceVariant, margin: 0 }}
                        onPress={() => setIsSortMenuVisible(true)}
                    />

                    {dataSource !== 'local' && tracks.length > 0 ? (
                        <IconButton
                            icon="download"
                            size={28}
                            style={{ backgroundColor: theme.colors.surfaceVariant, margin: 0 }}
                            onPress={() => setIsDownloadConfirmVisible(true)}
                        />
                    ) : null}
                </View>

            </View>
        );
    };

    const isArtist = item?.Type === 'MusicArtist';

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
            {glowColor && (
                <Animated.View
                    style={{
                        position: 'absolute',
                        top: -100,
                        left: -100,
                        right: -100,
                        height: 400,
                        opacity: fadeAnim,
                        transform: [{ translateY: slideAnim }],
                    }}
                >
                    <LinearGradient
                        colors={[`${glowColor}40`, 'transparent']}
                        style={{ flex: 1 }}
                    />
                </Animated.View>
            )}

            <View style={[styles.appBar, { paddingTop: insets.top }, isSelectionMode && { backgroundColor: theme.colors.surface, elevation: 4 }, isArtist && !isSelectionMode && { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, backgroundColor: 'transparent' }]}>
                {isSelectionMode ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <IconButton icon="close" onPress={exitSelectionMode} />
                            <Text variant="titleMedium" style={{ marginLeft: 8 }}>
                                {selectedTracks.size} selected
                            </Text>
                        </View>
                        <View style={{ flexDirection: 'row' }}>
                            <IconButton icon="download" onPress={handleDownloadSelected} />
                            <IconButton icon="playlist-plus" onPress={handleAddSelectedToPlaylist} />
                            {dataSource === 'local' && (
                                <IconButton icon="delete" onPress={handleDeleteSelected} />
                            )}
                        </View>
                    </View>
                ) : (
                    <IconButton icon="arrow-left" onPress={() => navigation.goBack()} style={{ backgroundColor: isArtist ? 'rgba(0,0,0,0.3)' : 'transparent' }} iconColor={isArtist ? '#fff' : undefined} />
                )}
            </View>

            <DraggableFlatList
                data={filteredTracks}
                extraData={[filteredTracks, isSelectionMode, selectedTracks]} // CRITICAL: Force re-render when selection state changes
                renderItem={renderItem}
                // Don't use index in keys unless absolutely necessary, as it destroys components on reorder
                keyExtractor={(item, index) => item.queueItemId || item.PlaylistItemId || `${item.Id}-${index}`}
                ListHeaderComponent={renderHeader()}
                contentContainerStyle={[styles.listContent, { paddingBottom: 200 }]}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
                getItemLayout={(data, index) => (
                    { length: 66, offset: 66 * index, index }
                )}
                initialNumToRender={8}
                maxToRenderPerBatch={8}
                windowSize={11}
                removeClippedSubviews={true} // Free memory for offscreen items (CRITICAL for large playlists)
                ListEmptyComponent={tracksLoading ? (
                    <View style={{ paddingTop: 16 }}>
                        {Array.from({ length: 10 }).map((_, i) => <ListItemSkeleton key={i} />)}
                    </View>
                ) : null}
                onDragEnd={({ data }) => {
                    setTracks(data); // Update UI
                    if (isDraggable && itemId) {
                        DatabaseService.updatePlaylistOrder(itemId, data.map(t => t.Id)).catch(console.error);
                    }
                }}
                activationDistance={20}
                onEndReached={loadMoreTracks}
                onEndReachedThreshold={0.5}
                ListFooterComponent={isFetchingMore ? <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 16 }} /> : null}
            />

            <ActionSheet visible={isAddToPlaylistVisible} onClose={() => !isAddingToPlaylist && setIsAddToPlaylistVisible(false)} title="Add to Playlist" scrollable>
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

            {/* Submenu Dialog for Playlist actions */}
            <ActionSheet visible={isSubmenuVisible} onClose={() => setIsSubmenuVisible(false)} title="Track Options">
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
                        title="Add to another playlist"
                        left={props => <List.Icon {...props} icon="playlist-music" />}
                        onPress={handleAddToAnotherPlaylist}
                    />
                    <List.Item
                        title="Remove from this playlist"
                        titleStyle={{ color: '#f44336' }}
                        left={props => <List.Icon {...props} icon="playlist-remove" color="#f44336" />}
                        onPress={handleRemoveFromPlaylist}
                    />
                </View>
            </ActionSheet>

            {/* Track Options Dialog (non-playlist views) */}
            <ActionSheet visible={isTrackOptionsVisible} onClose={() => setIsTrackOptionsVisible(false)} title="Track Options">
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
                        onPress={handleOpenAddToPlaylistFromOptions}
                    />
                    {/* Delete Option for Local Tracks */}
                    {dataSource === 'local' && (
                        <List.Item
                            title="Delete from device"
                            titleStyle={{ color: '#f44336' }}
                            left={props => <List.Icon {...props} icon="delete" color="#f44336" />}
                            onPress={handleOpenDeleteConfirm}
                        />
                    )}
                </View>
            </ActionSheet>

            {/* Remove Confirmation Dialog */}
            <ActionSheet visible={isRemoveConfirmVisible} onClose={() => setIsRemoveConfirmVisible(false)} title="Remove from Playlist" heightPercentage={30}>
                <View style={{ gap: 16 }}>
                    <Text variant="bodyMedium">Are you sure you want to remove this song from the playlist?</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                        <Button mode="text" onPress={() => setIsRemoveConfirmVisible(false)}>Cancel</Button>
                        <Button mode="contained" buttonColor="#f44336" onPress={confirmRemoveFromPlaylist}>Remove</Button>
                    </View>
                </View>
            </ActionSheet>

            {/* Delete Confirmation Dialog */}
            <ActionSheet visible={isDeleteConfirmVisible} onClose={() => setIsDeleteConfirmVisible(false)} title="Delete from Device" heightPercentage={30}>
                <View style={{ gap: 16 }}>
                    <Text variant="bodyMedium">Are you sure you want to delete this file from your device? This action cannot be undone.</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                        <Button mode="text" onPress={() => setIsDeleteConfirmVisible(false)}>Cancel</Button>
                        <Button mode="contained" buttonColor="#f44336" onPress={handleDeleteTrack}>Delete</Button>
                    </View>
                </View>
            </ActionSheet>

            {/* Download Confirmation Dialog */}
            <ActionSheet visible={isDownloadConfirmVisible} onClose={() => setIsDownloadConfirmVisible(false)} title="Download All" heightPercentage={30}>
                <View style={{ gap: 16 }}>
                    <Text variant="bodyMedium">
                        Download {tracks.length} {tracks.length === 1 ? 'song' : 'songs'} for offline listening?
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                        <Button mode="text" onPress={() => setIsDownloadConfirmVisible(false)}>Cancel</Button>
                        <Button mode="contained" onPress={handleDownloadAll}>Download</Button>
                    </View>
                </View>
            </ActionSheet>

            {/* Sort Options ActionSheet */}
            <ActionSheet visible={isSortMenuVisible} onClose={() => setIsSortMenuVisible(false)} title="Sort Options">
                <View style={{ gap: 4 }}>
                    <List.Item
                        title="Default"
                        description="Original playlist order"
                        left={props => <List.Icon {...props} icon="sort-variant" />}
                        right={props => sortBy === 'default' ? <List.Icon {...props} icon="check" color={theme.colors.primary} /> : null}
                        onPress={() => { setSortBy('default'); setIsSortMenuVisible(false); }}
                    />
                    <List.Item
                        title="Name (A-Z)"
                        description="Sort alphabetically by track name"
                        left={props => <List.Icon {...props} icon="alphabetical" />}
                        right={props => sortBy === 'name' ? <List.Icon {...props} icon="check" color={theme.colors.primary} /> : null}
                        onPress={() => { setSortBy('name'); setIsSortMenuVisible(false); }}
                    />
                    <List.Item
                        title="Artist"
                        description="Sort by artist name"
                        left={props => <List.Icon {...props} icon="account-music" />}
                        right={props => sortBy === 'artist' ? <List.Icon {...props} icon="check" color={theme.colors.primary} /> : null}
                        onPress={() => { setSortBy('artist'); setIsSortMenuVisible(false); }}
                    />
                    <List.Item
                        title="Album"
                        description="Group by album"
                        left={props => <List.Icon {...props} icon="album" />}
                        right={props => sortBy === 'album' ? <List.Icon {...props} icon="check" color={theme.colors.primary} /> : null}
                        onPress={() => { setSortBy('album'); setIsSortMenuVisible(false); }}
                    />
                    <List.Item
                        title="Duration"
                        description="Sort by song length"
                        left={props => <List.Icon {...props} icon="clock-outline" />}
                        right={props => sortBy === 'duration' ? <List.Icon {...props} icon="check" color={theme.colors.primary} /> : null}
                        onPress={() => { setSortBy('duration'); setIsSortMenuVisible(false); }}
                    />
                </View>
            </ActionSheet>

        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    appBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    listContent: {
        // base padding if any
    },
    header: {
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 24,
    },
    artwork: {
        width: 200,
        height: 200,
        borderRadius: 12,
        marginBottom: 24,
        alignItems: 'center',
        justifyContent: 'center',
    },
    title: {
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 4,
    },
    playButton: {
        marginTop: 24,
        borderRadius: 20,
    },
});

