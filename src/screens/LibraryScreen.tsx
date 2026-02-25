import React from 'react';
import { View, StyleSheet, FlatList, Vibration, TouchableOpacity, useWindowDimensions, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, List, Avatar, Chip, useTheme, IconButton, Portal, Dialog, TextInput, Button, ActivityIndicator, TouchableRipple } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../types/navigation';
import { jellyfinApi } from '../api/jellyfin';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useLocalLibraryStore } from '../store/localLibraryStore';
import { DatabaseService } from '../services/DatabaseService';
import { ShuffleFab } from '../components/ShuffleFab';
import { Loader } from '../components/Loader';
import { Skeleton, ListItemSkeleton, CardSkeleton } from '../components/Skeleton';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { LEFT_BAR_WIDTH } from '../navigation/MainNavigator';

type FilterType = 'playlists' | 'artists' | 'albums';

export default function LibraryScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
    const theme = useTheme();
    const user = useAuthStore((state) => state.user);
    const { dataSource } = useSettingsStore();
    const localLibrary = useLocalLibraryStore();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    const [playlists, setPlaylists] = React.useState<any[]>([]);
    const [artists, setArtists] = React.useState<any[]>([]);
    const [albums, setAlbums] = React.useState<any[]>([]);
    const [activeFilter, setActiveFilter] = React.useState<FilterType>('playlists');
    const [isLoading, setIsLoading] = React.useState(false);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [isDialogVisible, setIsDialogVisible] = React.useState(false);
    const [newPlaylistName, setNewPlaylistName] = React.useState('');
    const [isCreating, setIsCreating] = React.useState(false);

    // Deletion State
    const [deleteDialogVisible, setDeleteDialogVisible] = React.useState(false);
    const [playlistsToDelete, setPlaylistsToDelete] = React.useState<any[]>([]);
    const [isDeleting, setIsDeleting] = React.useState(false);

    // Multi-select state
    const [isSelectionMode, setIsSelectionMode] = React.useState(false);
    const [selectedItems, setSelectedItems] = React.useState<Set<string>>(new Set());

    const toggleSelection = (id: string) => {
        // Prevent selecting special items
        if (id === 'all-songs' || id === 'liked-songs') return;

        const newSet = new Set(selectedItems);
        if (newSet.has(id)) {
            newSet.delete(id);
            if (newSet.size === 0) setIsSelectionMode(false);
        } else {
            newSet.add(id);
        }
        setSelectedItems(newSet);
    };

    const handleLongPressItem = (item: any) => {
        const id = item.Id || item.id;

        // Prevent selecting special items
        if (id === 'all-songs' || id === 'liked-songs') return;

        if (!isSelectionMode) {
            setIsSelectionMode(true);
            const newSet = new Set<string>();
            newSet.add(id);
            setSelectedItems(newSet);
        } else {
            toggleSelection(id);
        }
    };

    const exitSelectionMode = () => {
        setIsSelectionMode(false);
        setSelectedItems(new Set());
    };

    const handleDeleteSelected = async () => {
        // Only support deleting playlists for now
        // Safe implementation: Filter selected items from current list
        const itemsToDelete = getDisplayItems().filter(i => selectedItems.has(i.Id || i.id));

        // Filter for Playlists (safest) and exclude liked-songs
        const filteredPlaylists = itemsToDelete.filter(i => i.Type === 'Playlist' && i.id !== 'liked-songs' && i.Id !== 'liked-songs');

        if (filteredPlaylists.length === 0) {
            // Show message that only playlists can be deleted
            exitSelectionMode();
            return;
        }

        // Set all playlists to delete
        setPlaylistsToDelete(filteredPlaylists);
        setDeleteDialogVisible(true);
    };


    const fetchPlaylists = async () => {
        if (dataSource === 'local') {
            // Transform local playlists to match expected format
            const localPlaylists = localLibrary.playlists.map(p => ({
                Id: p.id,
                Name: p.name,
                Type: 'Playlist',
                ChildCount: p.trackIds?.length || 0, // Defensive check for undefined
                isLocal: true,
            }));
            setPlaylists(localPlaylists);
        } else {
            try {
                const data = await jellyfinApi.getPlaylists();
                if (data && data.Items) {
                    setPlaylists(data.Items);
                }
            } catch (error) {
                console.error('Failed to fetch playlists:', error);
            }
        }
    };

    const fetchArtists = async () => {
        setIsLoading(true);
        try {
            if (dataSource === 'local') {
                // Fetch grouped artists directly from SQLite (Much faster)
                const localArtists = await DatabaseService.getAllArtists();
                const formattedArtists = localArtists.map(a => ({
                    Id: a.artistId,
                    Name: a.artist,
                    Type: 'MusicArtist',
                    ImageUrl: a.imageUrl,
                }));
                // DB sort is likely enough, but safe to sort again or trust DB
                setArtists(formattedArtists);
            } else {
                const data = await jellyfinApi.getItems({
                    IncludeItemTypes: 'MusicArtist',
                    Recursive: true,
                    SortBy: 'SortName',
                    SortOrder: 'Ascending',
                    Fields: 'PrimaryImageAspectRatio,BasicSyncInfo',
                });
                if (data && data.Items) {
                    setArtists(data.Items);
                }
            }
        } catch (error) {
            console.error('Failed to fetch artists:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchAlbums = async () => {
        setIsLoading(true);
        try {
            if (dataSource === 'local') {
                // Fetch grouped albums directly from SQLite
                const localAlbums = await DatabaseService.getAllAlbums();
                const formattedAlbums = localAlbums.map(a => ({
                    Id: a.album, // Use album name as ID for local
                    Name: a.album,
                    AlbumArtist: a.artist,
                    Type: 'MusicAlbum',
                    ImageUrl: a.imageUrl,
                }));
                setAlbums(formattedAlbums);
            } else {
                const data = await jellyfinApi.getItems({
                    IncludeItemTypes: 'MusicAlbum',
                    Recursive: true,
                    SortBy: 'SortName',
                    SortOrder: 'Ascending',
                    Fields: 'PrimaryImageAspectRatio,BasicSyncInfo',
                });
                if (data && data.Items) {
                    setAlbums(data.Items);
                }
            }
        } catch (error) {
            console.error('Failed to fetch albums:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const onRefresh = React.useCallback(() => {
        setIsRefreshing(true);
        if (activeFilter === 'artists') {
            fetchArtists();
        } else if (activeFilter === 'albums') {
            fetchAlbums();
        } else {
            fetchPlaylists().then(() => setIsRefreshing(false));
        }
    }, [activeFilter, dataSource]);

    React.useEffect(() => {
        fetchPlaylists();
    }, [dataSource, localLibrary.playlists]);

    // Clear and refetch when dataSource or user changes
    React.useEffect(() => {
        // Clear all data when source or user changes
        setPlaylists([]);
        setArtists([]);
        setAlbums([]);

        // Refetch the currently active filter
        if (activeFilter === 'playlists') {
            fetchPlaylists();
        } else if (activeFilter === 'artists') {
            fetchArtists();
        } else if (activeFilter === 'albums') {
            fetchAlbums();
        }
    }, [dataSource, user?.id]);

    // Re-fetch artists/albums when tracks are enriched (new metadata/artwork)
    React.useEffect(() => {
        if (dataSource === 'local') {
            if (activeFilter === 'artists') {
                fetchArtists();
            } else if (activeFilter === 'albums') {
                fetchAlbums();
            }
        }
    }, [localLibrary.tracks, localLibrary.selectedFolderPaths]); // Re-fetch when tracks or folder selection changes

    const handleFilterChange = (filter: FilterType) => {
        setActiveFilter(filter);
        if (filter === 'artists' && artists.length === 0) {
            fetchArtists();
        } else if (filter === 'albums' && albums.length === 0) {
            fetchAlbums();
        }
    };

    const handleCreatePlaylist = async () => {
        if (!newPlaylistName.trim()) return;
        setIsCreating(true);
        try {
            if (dataSource === 'local') {
                // Create local playlist
                localLibrary.createPlaylist(newPlaylistName);
            } else {
                await jellyfinApi.createPlaylist(newPlaylistName);
            }
            setNewPlaylistName('');
            setIsDialogVisible(false);
            fetchPlaylists(); // Refresh list
        } catch (error) {
            console.error('Failed to create playlist:', error);
        } finally {
            setIsCreating(false);
        }
    };

    const initiateDeletePlaylist = (item: any) => {
        if (item.Type === 'Playlist' && item.id !== 'liked-songs') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            setPlaylistsToDelete([item]);
            setDeleteDialogVisible(true);
        }
    };

    const handleDeletePlaylist = async () => {
        if (playlistsToDelete.length === 0) return;
        setIsDeleting(true);
        try {
            // Delete all selected playlists
            for (const playlist of playlistsToDelete) {
                if (playlist.isLocal || dataSource === 'local') {
                    // Delete local playlist
                    localLibrary.deletePlaylist(playlist.Id || playlist.id);
                } else {
                    await jellyfinApi.deleteItem(playlist.Id || playlist.id);
                }
            }
            setDeleteDialogVisible(false);
            setPlaylistsToDelete([]);
            exitSelectionMode(); // Exit selection mode after delete
            fetchPlaylists();
        } catch (error) {
            console.error('Failed to delete playlist:', error);
        } finally {
            setIsDeleting(false);
        }
    };

    const handleItemPress = (item: any) => {
        if (item.id === 'all-songs') {
            navigation.navigate('Detail', { itemId: 'all-songs', type: 'All Songs' });
        } else if (item.id === 'liked-songs') {
            navigation.navigate('Detail', { itemId: 'liked-songs', type: 'Playlist' });
        } else {
            const actualId = item.Id || item.id;
            const actualType = item.Type || item.type;
            navigation.navigate('Detail', { itemId: actualId, type: actualType });
        }
    };

    // Calculate number of columns for landscape grid
    const numColumns = isLandscape ? Math.floor(width / 160) : 1;

    // Grid item renderer for landscape mode
    const renderGridItem = ({ item }: { item: any }) => {
        let icon = 'folder';
        if (item.id === 'all-songs') {
            icon = 'music-box-multiple';
        } else if (item.id === 'liked-songs') {
            icon = 'heart';
        } else if (item.Type === 'Playlist') {
            icon = 'playlist-music';
        } else if (item.Type === 'MusicArtist') {
            icon = 'account-music';
        } else if (item.Type === 'MusicAlbum') {
            icon = 'album';
        }

        const hasImage = item.ImageTags?.Primary || item.ImageUrl;
        const itemId = item.Id || item.id;
        const imageUri = item.ImageUrl || (item.ImageTags?.Primary ? jellyfinApi.getImageUrl(itemId) : null);
        const contentWidth = isLandscape ? width - LEFT_BAR_WIDTH : width;
        const cardWidth = (contentWidth - 48) / numColumns - 8;

        const isSelected = selectedItems.has(itemId);

        return (
            <TouchableRipple
                onPress={() => isSelectionMode ? toggleSelection(itemId) : handleItemPress(item)}
                onLongPress={() => handleLongPressItem(item)}
                rippleColor="rgba(0, 0, 0, 0.3)"
                style={{
                    width: cardWidth,
                    margin: 4,
                    borderRadius: 12,
                    overflow: 'hidden',
                    backgroundColor: isSelected ? theme.colors.primaryContainer : theme.colors.surfaceVariant,
                    borderWidth: isSelected ? 2 : 0,
                    borderColor: theme.colors.primary,
                }}
            >
                <View style={{ alignItems: 'center', padding: 12 }}>
                    {isSelectionMode && itemId !== 'all-songs' && itemId !== 'liked-songs' && (
                        <View style={{ position: 'absolute', top: 4, right: 4, zIndex: 10 }}>
                            <Icon name={isSelected ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} size={20} color={theme.colors.primary} />
                        </View>
                    )}
                    {hasImage && imageUri ? (
                        <Avatar.Image
                            size={cardWidth - 32}
                            source={{ uri: imageUri }}
                            style={{ marginBottom: 8 }}
                        />
                    ) : (
                        <Avatar.Icon
                            icon={icon}
                            size={cardWidth - 32}
                            style={{ backgroundColor: theme.colors.secondaryContainer, marginBottom: 8 }}
                        />
                    )}
                    <Text variant="bodyMedium" numberOfLines={1} style={{ fontWeight: '500', textAlign: 'center' }}>
                        {item.Name || item.title}
                    </Text>
                </View>
            </TouchableRipple>
        );
    };

    const renderItem = ({ item }: { item: any }) => {
        // Use grid layout in landscape
        if (isLandscape) {
            return renderGridItem({ item });
        }

        let icon = 'folder';
        let description = item.Type || item.type;

        if (item.id === 'all-songs') {
            icon = 'music-box-multiple';
        } else if (item.id === 'liked-songs') {
            icon = 'heart';
        } else if (item.Type === 'Playlist') {
            icon = 'playlist-music';
        } else if (item.Type === 'MusicArtist') {
            icon = 'account-music';
            description = 'Artist';
        } else if (item.Type === 'MusicAlbum') {
            icon = 'album';
            description = item.AlbumArtist || 'Album';
        }

        // Check for image - Jellyfin uses ImageTags.Primary, local uses ImageUrl
        const hasImage = item.ImageTags?.Primary || item.ImageUrl;
        const itemId = item.Id || item.id;
        const imageUri = item.ImageUrl || (item.ImageTags?.Primary ? jellyfinApi.getImageUrl(itemId) : null);
        const isSelected = selectedItems.has(itemId);

        return (
            <TouchableRipple
                onPress={() => isSelectionMode ? toggleSelection(itemId) : handleItemPress(item)}
                onLongPress={() => handleLongPressItem(item)}
                rippleColor="rgba(0, 0, 0, 0.3)"
                underlayColor={theme.colors.secondaryContainer}
                style={[
                    styles.item,
                    { borderRadius: 8, overflow: 'hidden' },
                    isSelected && { backgroundColor: theme.colors.primaryContainer }
                ]}
            >
                <View style={styles.itemRow}>
                    {isSelectionMode && itemId !== 'all-songs' && itemId !== 'liked-songs' && (
                        <View style={{ paddingLeft: 8 }}>
                            <Icon name={isSelected ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} size={24} color={theme.colors.primary} />
                        </View>
                    )}
                    <View style={styles.avatarContainer}>
                        {hasImage && imageUri ? (
                            <Avatar.Image
                                size={48}
                                source={{ uri: imageUri }}
                            />
                        ) : (
                            <Avatar.Icon
                                icon={icon}
                                size={48}
                                style={{ backgroundColor: theme.colors.secondaryContainer }}
                            />
                        )}
                    </View>
                    <View style={styles.itemTextContainer}>
                        <Text variant="bodyLarge" numberOfLines={1} style={{ fontWeight: '500' }}>{item.Name || item.title}</Text>
                        <Text variant="bodyMedium" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>{description}</Text>
                    </View>
                </View>
            </TouchableRipple>
        );
    };

    // Static items - adjust based on mode
    const getStaticItems = () => {
        if (dataSource === 'local') {
            return [
                { id: 'all-songs', title: 'All Songs', type: 'Library', count: localLibrary.getFilteredTracks().length },
                { id: 'liked-songs', title: 'Liked Songs', type: 'Playlist', count: localLibrary.getFavoriteTracks().length },
            ];
        }
        return [
            { id: 'all-songs', title: 'All Songs', type: 'Library' },
            { id: 'liked-songs', title: 'Liked Songs', type: 'Playlist' },
        ];
    };

    // Get the data based on active filter
    const getDisplayItems = () => {
        switch (activeFilter) {
            case 'artists':
                return artists;
            case 'albums':
                return albums;
            case 'playlists':
            default:
                return [...getStaticItems(), ...playlists];
        }
    };

    const renderSkeleton = () => {
        if (isLandscape) {
            return (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12 }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <CardSkeleton key={i} width={(width - LEFT_BAR_WIDTH - 48) / numColumns - 8} />
                    ))}
                </View>
            );
        }
        return (
            <View>
                {Array.from({ length: 10 }).map((_, i) => (
                    <ListItemSkeleton key={i} />
                ))}
            </View>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            {/* Headers and chips code remains same until isLoading check */}
            {isSelectionMode ? (
                <View style={[styles.header, { backgroundColor: theme.colors.primaryContainer, borderRadius: 8, padding: 8, marginBottom: 8 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <IconButton icon="close" onPress={exitSelectionMode} />
                        <Text variant="titleMedium" style={{ marginLeft: 8 }}>{selectedItems.size} selected</Text>
                    </View>
                    <View style={{ flexDirection: 'row' }}>
                        {activeFilter === 'playlists' && (
                            <IconButton icon="delete" onPress={handleDeleteSelected} iconColor={theme.colors.error} />
                        )}
                    </View>
                </View>
            ) : (
                <View style={[styles.header, isLandscape && { marginBottom: 8, marginTop: 4 }]}>
                    <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
                        {user?.id ? (
                            <Avatar.Image size={isLandscape ? 32 : 40} source={{ uri: jellyfinApi.getUserImageUrl(user.id) }} />
                        ) : (
                            <Avatar.Icon size={isLandscape ? 32 : 40} icon="account" />
                        )}
                    </TouchableOpacity>
                    <Text variant={isLandscape ? "titleMedium" : "headlineSmall"} style={styles.headerTitle}>Your Library</Text>
                    {activeFilter === 'playlists' ? (
                        <IconButton icon="plus" onPress={() => setIsDialogVisible(true)} style={{ margin: 0 }} />
                    ) : (
                        <ShuffleFab
                            size={40}
                            style={{ marginRight: 0 }}
                            onPress={async () => {
                                // Logic for shuffle
                            }}
                        />
                    )}
                </View>
            )}

            <View style={styles.filterContainer}>
                <Chip
                    onPress={() => handleFilterChange('artists')}
                    style={styles.chip}
                    mode={activeFilter === 'artists' ? 'flat' : 'outlined'}
                    selected={activeFilter === 'artists'}
                >
                    Artists
                </Chip>
                <Chip
                    onPress={() => handleFilterChange('albums')}
                    style={styles.chip}
                    mode={activeFilter === 'albums' ? 'flat' : 'outlined'}
                    selected={activeFilter === 'albums'}
                >
                    Albums
                </Chip>
                {activeFilter !== 'playlists' && (
                    <Chip
                        onPress={() => handleFilterChange('playlists')}
                        style={styles.chip}
                        mode="outlined"
                        icon="close"
                    >
                        Clear
                    </Chip>
                )}
            </View>

            {isLoading && !isRefreshing ? (
                renderSkeleton()
            ) : (
                dataSource === 'local' && !localLibrary.permissionGranted ? (
                    <View style={styles.emptyState}>
                        <Icon name="folder-lock" size={64} color={theme.colors.onSurfaceVariant} style={{ marginBottom: 16, opacity: 0.5 }} />
                        <Text variant="titleMedium" style={{ marginBottom: 8 }}>Local Library Access</Text>
                        <Text variant="bodyMedium" style={{ textAlign: 'center', marginBottom: 16, color: theme.colors.onSurfaceVariant }}>
                            Please grant access to your device's audio files to display your local library.
                        </Text>
                        <Button mode="contained" onPress={() => localLibrary.requestPermissions()}>
                            Grant Permission
                        </Button>
                    </View>
                ) : (
                    <FlatList
                        key={isLandscape ? `grid-${numColumns}` : 'list'}
                        data={getDisplayItems()}
                        renderItem={renderItem}
                        keyExtractor={(item) => item.Id || item.id}
                        numColumns={isLandscape ? numColumns : 1}
                        contentContainerStyle={[
                            styles.listContent,
                            { paddingBottom: 180 },
                            isLandscape && { paddingHorizontal: 16 },
                            getDisplayItems().length === 0 && { flex: 1 }
                        ]}
                        refreshControl={
                            <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />
                        }
                        removeClippedSubviews={true}
                        initialNumToRender={10}
                        maxToRenderPerBatch={10}
                        windowSize={5}
                        ListEmptyComponent={
                            <View style={styles.emptyState}>
                                <Icon name="music-note-off" size={64} color={theme.colors.onSurfaceVariant} style={{ marginBottom: 16, opacity: 0.5 }} />
                                <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                                    No {activeFilter} found
                                </Text>
                                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                                    {activeFilter === 'playlists' ? 'Create a playlist to get started' : 'Add some music to your library'}
                                </Text>
                                {dataSource === 'local' && (
                                    <Button mode="text" onPress={() => localLibrary.refreshLibrary()} style={{ marginTop: 16 }}>
                                        Rescan Library
                                    </Button>
                                )}
                            </View>
                        }
                    />
                )
            )}

            <Portal>
                <Dialog visible={isDialogVisible} onDismiss={() => setIsDialogVisible(false)}>
                    <Dialog.Title>New Playlist</Dialog.Title>
                    <Dialog.Content>
                        <TextInput
                            label="Playlist Name"
                            value={newPlaylistName}
                            onChangeText={setNewPlaylistName}
                            mode="outlined"
                            autoFocus
                        />
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setIsDialogVisible(false)}>Cancel</Button>
                        <Button onPress={handleCreatePlaylist} loading={isCreating} disabled={!newPlaylistName.trim() || isCreating}>Create</Button>
                    </Dialog.Actions>
                </Dialog>

                <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
                    <Dialog.Title>Delete {playlistsToDelete.length > 1 ? 'Playlists' : 'Playlist'}?</Dialog.Title>
                    <Dialog.Content>
                        <Text variant="bodyMedium">
                            Are you sure you want to delete {playlistsToDelete.length > 1
                                ? `these ${playlistsToDelete.length} playlists: ${playlistsToDelete.map(p => p.Name || p.name || p.title).join(', ')}`
                                : `"${playlistsToDelete[0]?.Name || playlistsToDelete[0]?.name || playlistsToDelete[0]?.title}"`
                            }? This action cannot be undone.
                        </Text>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setDeleteDialogVisible(false)}>Cancel</Button>
                        <Button onPress={handleDeletePlaylist} loading={isDeleting} disabled={isDeleting} textColor={theme.colors.error}>Delete</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        marginTop: 8,
    },
    headerTitle: {
        flex: 1,
        marginLeft: 16,
        fontWeight: 'bold',
        textAlignVertical: 'center', // Android only, useful for potential font padding issues
    },
    filterContainer: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    chip: {
        marginRight: 8,
    },
    listContent: {
        paddingBottom: 140,
    },
    item: {
        paddingVertical: 8,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 8, // Add padding inside ripple
    },
    itemTextContainer: {
        marginLeft: 16,
        flex: 1,
        justifyContent: 'center',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarContainer: {
        width: 48,
        height: 48,
        marginLeft: 8,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
});
