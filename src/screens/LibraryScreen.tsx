import React from 'react';
import { View, StyleSheet, Vibration, TouchableOpacity, useWindowDimensions, RefreshControl, NativeScrollEvent, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, Avatar, useTheme, IconButton, TextInput, Button, TouchableRipple } from 'react-native-paper';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../types/navigation';
import { jellyfinApi } from '../api/jellyfin';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useShallow } from 'zustand/react/shallow';
import { useLocalLibraryStore } from '../store/localLibraryStore';
import { DatabaseService } from '../services/DatabaseService';
import { Skeleton, ListItemSkeleton, CardSkeleton } from '../components/Skeleton';
import { EmptyState } from '../components/EmptyState';
import ActionSheet from '../components/ActionSheet';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { LEFT_BAR_WIDTH } from '../navigation/MainNavigator';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    useAnimatedScrollHandler,
    interpolate,
    runOnJS
} from 'react-native-reanimated';

type FilterType = 'playlists' | 'artists' | 'albums';

interface PageProps {
    isLandscape: boolean;
    pageWidth: number;
    numColumns: number;
    dataSource: 'local' | 'jellyfin';
    navigation: any;
    theme: any;
}

const LibraryItem = React.memo(({ item, isLandscape, pageWidth, numColumns, theme, navigation }: any) => {
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

    if (isLandscape) {
        const cardWidth = (pageWidth - 48) / numColumns - 8;
        const itemId = item.Id || item.id;
        const imageUri = item.ImageUrl || (item.ImageTags?.Primary ? jellyfinApi.getImageUrl(itemId) : null);
        let icon = 'folder';
        if (item.id === 'all-songs') icon = 'music-box-multiple';
        else if (item.id === 'liked-songs') icon = 'heart';
        else if (item.Type === 'Playlist') icon = 'playlist-music';
        else if (item.Type === 'MusicArtist') icon = 'account-music';
        else if (item.Type === 'MusicAlbum') icon = 'album';

        return (
            <TouchableRipple
                onPress={() => handleItemPress(item)}
                rippleColor="rgba(0, 0, 0, 0.3)"
                style={{ width: cardWidth, margin: 4, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.colors.surfaceVariant }}
            >
                <View style={{ alignItems: 'center', padding: 12 }}>
                    {imageUri ? <Avatar.Image size={cardWidth - 32} source={{ uri: imageUri }} style={{ marginBottom: 8 }} /> :
                        <Avatar.Icon icon={icon} size={cardWidth - 32} style={{ backgroundColor: theme.colors.secondaryContainer, marginBottom: 8 }} />}
                    <Text variant="bodyMedium" numberOfLines={1} style={{ fontWeight: '500', textAlign: 'center' }}>{item.Name || item.title}</Text>
                </View>
            </TouchableRipple>
        );
    }

    let icon = 'folder';
    let description = item.Type || item.type;
    if (item.id === 'all-songs') icon = 'music-box-multiple';
    else if (item.id === 'liked-songs') icon = 'heart';
    else if (item.Type === 'Playlist') icon = 'playlist-music';
    else if (item.Type === 'MusicArtist') { icon = 'account-music'; description = 'Artist'; }
    else if (item.Type === 'MusicAlbum') { icon = 'album'; description = item.AlbumArtist || 'Album'; }

    const itemId = item.Id || item.id;
    const imageUri = item.ImageUrl || (item.ImageTags?.Primary ? jellyfinApi.getImageUrl(itemId) : null);

    return (
        <TouchableRipple
            onPress={() => handleItemPress(item)}
            rippleColor="rgba(0, 0, 0, 0.3)"
            style={[styles.item, { borderRadius: 8, overflow: 'hidden' }]}
        >
            <View style={styles.itemRow}>
                <View style={styles.avatarContainer}>
                    {imageUri ? <Avatar.Image size={48} source={{ uri: imageUri }} /> :
                        <Avatar.Icon icon={icon} size={48} style={{ backgroundColor: theme.colors.secondaryContainer }} />}
                </View>
                <View style={styles.itemTextContainer}>
                    <Text variant="bodyLarge" numberOfLines={1} style={{ fontWeight: '500' }}>{item.Name || item.title}</Text>
                    <Text variant="bodyMedium" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>{description}</Text>
                </View>
            </View>
        </TouchableRipple>
    );
});

const PlaylistPage = React.memo(({ isLandscape, pageWidth, numColumns, dataSource, navigation, theme }: PageProps) => {
    const [playlists, setPlaylists] = React.useState<any[]>([]);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);
    const localLibrary = useLocalLibraryStore();

    const CACHE_TTL = 5 * 60 * 1000;
    const getCache = (key: string) => {
        const cached = (global as any).libraryCache?.[key];
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
        return null;
    };
    const setCache = (key: string, data: any) => {
        if (!(global as any).libraryCache) (global as any).libraryCache = {};
        (global as any).libraryCache[key] = { data, timestamp: Date.now() };
    };

    const fetchPlaylists = async (isManual = false) => {
        if (!isManual) {
            const cached = getCache(`playlists_${dataSource}`);
            if (cached) { setPlaylists(cached); setIsLoading(false); return; }
        }
        
        if (dataSource === 'local') {
            const data = localLibrary.playlists.map(p => ({ Id: p.id, Name: p.name, Type: 'Playlist', ChildCount: p.trackIds?.length || 0, isLocal: true }));
            setPlaylists(data);
            setCache(`playlists_${dataSource}`, data);
        } else {
            try {
                const data = await jellyfinApi.getPlaylists();
                if (data?.Items) {
                    setPlaylists(data.Items);
                    setCache(`playlists_${dataSource}`, data.Items);
                }
            } catch (error) { console.error(error); }
        }
        setIsLoading(false);
    };

    const onRefresh = async () => {
        setIsRefreshing(true);
        await fetchPlaylists(true);
        setIsRefreshing(false);
    };

    React.useEffect(() => {
        fetchPlaylists();
    }, [dataSource, localLibrary.playlists]);

    const getStaticItems = () => {
        if (dataSource === 'local') {
            return [
                { id: 'all-songs', title: 'All Songs', type: 'Library' },
                { id: 'liked-songs', title: 'Liked Songs', type: 'Playlist' },
            ];
        }
        return [
            { id: 'all-songs', title: 'All Songs', type: 'Library' },
            { id: 'liked-songs', title: 'Liked Songs', type: 'Playlist' },
        ];
    };

    if (isLoading) return <View style={{ width: pageWidth, padding: 16 }}><ListItemSkeleton /><ListItemSkeleton /></View>;

    return (
        <View style={{ width: pageWidth, flex: 1 }}>
            <FlashList
                data={[...getStaticItems(), ...playlists]}
                renderItem={({ item }) => <LibraryItem item={item} isLandscape={isLandscape} pageWidth={pageWidth} numColumns={numColumns} theme={theme} navigation={navigation} />}
                keyExtractor={(item) => (item.Id || item.id) + 'p'}
                numColumns={isLandscape ? numColumns : 1}
                contentContainerStyle={[styles.listContent, { paddingHorizontal: 16 }]}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
                ListEmptyComponent={<EmptyState icon="music-note-off" title="No Playlists found" description="Create a playlist to get started" />}
                estimatedItemSize={64}
            />
        </View>
    );
});

const ArtistPage = React.memo(({ isLandscape, pageWidth, numColumns, dataSource, navigation, theme }: PageProps) => {
    const [artists, setArtists] = React.useState<any[]>([]);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);

    const CACHE_TTL = 5 * 60 * 1000;
    const getCache = (key: string) => {
        const cached = (global as any).libraryCache?.[key];
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
        return null;
    };
    const setCache = (key: string, data: any) => {
        if (!(global as any).libraryCache) (global as any).libraryCache = {};
        (global as any).libraryCache[key] = { data, timestamp: Date.now() };
    };

    const fetchArtists = async (isManual = false) => {
        if (!isManual) {
            const cached = getCache(`artists_${dataSource}`);
            if (cached) { setArtists(cached); setIsLoading(false); return; }
        }

        try {
            let data: any[] = [];
            if (dataSource === 'local') {
                const localArtists = await DatabaseService.getAllArtists();
                data = localArtists.map(a => ({ Id: a.artistId, Name: a.artist, Type: 'MusicArtist', ImageUrl: a.imageUrl }));
            } else {
                const res = await jellyfinApi.getItems({ IncludeItemTypes: 'MusicArtist', Recursive: true, SortBy: 'SortName', SortOrder: 'Ascending', Fields: 'PrimaryImageAspectRatio,BasicSyncInfo' });
                data = res?.Items || [];
            }
            setArtists(data);
            setCache(`artists_${dataSource}`, data);
        } catch (error) { console.error(error); }
        setIsLoading(false);
    };

    const onRefresh = async () => {
        setIsRefreshing(true);
        await fetchArtists(true);
        setIsRefreshing(false);
    };

    React.useEffect(() => {
        fetchArtists();
    }, [dataSource]);

    if (isLoading) return <View style={{ width: pageWidth, padding: 16 }}><ListItemSkeleton /><ListItemSkeleton /></View>;

    return (
        <View style={{ width: pageWidth, flex: 1 }}>
            <FlashList
                data={artists}
                renderItem={({ item }) => <LibraryItem item={item} isLandscape={isLandscape} pageWidth={pageWidth} numColumns={numColumns} theme={theme} navigation={navigation} />}
                keyExtractor={(item) => (item.Id || item.id) + 'ar'}
                numColumns={isLandscape ? numColumns : 1}
                contentContainerStyle={[styles.listContent, { paddingHorizontal: 16 }]}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
                ListEmptyComponent={<EmptyState icon="account-music" title="No Artists found" />}
                estimatedItemSize={64}
            />
        </View>
    );
});

const AlbumPage = React.memo(({ isLandscape, pageWidth, numColumns, dataSource, navigation, theme }: PageProps) => {
    const [albums, setAlbums] = React.useState<any[]>([]);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [isLoading, setIsLoading] = React.useState(true);

    const CACHE_TTL = 5 * 60 * 1000;
    const getCache = (key: string) => {
        const cached = (global as any).libraryCache?.[key];
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data;
        return null;
    };
    const setCache = (key: string, data: any) => {
        if (!(global as any).libraryCache) (global as any).libraryCache = {};
        (global as any).libraryCache[key] = { data, timestamp: Date.now() };
    };

    const fetchAlbums = async (isManual = false) => {
        if (!isManual) {
            const cached = getCache(`albums_${dataSource}`);
            if (cached) { setAlbums(cached); setIsLoading(false); return; }
        }

        try {
            let data: any[] = [];
            if (dataSource === 'local') {
                const localAlbums = await DatabaseService.getAllAlbums();
                data = localAlbums.map(a => ({ Id: a.album, Name: a.album, AlbumArtist: a.artist, Type: 'MusicAlbum', ImageUrl: a.imageUrl }));
            } else {
                const res = await jellyfinApi.getItems({ IncludeItemTypes: 'MusicAlbum', Recursive: true, SortBy: 'SortName', SortOrder: 'Ascending', Fields: 'PrimaryImageAspectRatio,BasicSyncInfo' });
                data = res?.Items || [];
            }
            setAlbums(data);
            setCache(`albums_${dataSource}`, data);
        } catch (error) { console.error(error); }
        setIsLoading(false);
    };

    const onRefresh = async () => {
        setIsRefreshing(true);
        await fetchAlbums(true);
        setIsRefreshing(false);
    };

    React.useEffect(() => {
        fetchAlbums();
    }, [dataSource]);

    if (isLoading) return <View style={{ width: pageWidth, padding: 16 }}><ListItemSkeleton /><ListItemSkeleton /></View>;

    return (
        <View style={{ width: pageWidth, flex: 1 }}>
            <FlashList
                data={albums}
                renderItem={({ item }) => <LibraryItem item={item} isLandscape={isLandscape} pageWidth={pageWidth} numColumns={numColumns} theme={theme} navigation={navigation} />}
                keyExtractor={(item) => (item.Id || item.id) + 'al'}
                numColumns={isLandscape ? numColumns : 1}
                contentContainerStyle={[styles.listContent, { paddingHorizontal: 16 }]}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
                ListEmptyComponent={<EmptyState icon="album" title="No Albums found" />}
                estimatedItemSize={64}
            />
        </View>
    );
});

export default function LibraryScreen() {
    const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
    const theme = useTheme();
    const user = useAuthStore((state) => state.user);
    const { dataSource } = useSettingsStore(useShallow(state => ({ dataSource: state.dataSource })));
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    const pageWidth = isLandscape ? width - LEFT_BAR_WIDTH : width;
    const scrollX = useSharedValue(0);
    const pagerRef = React.useRef<Animated.ScrollView>(null);
    const [activeFilter, setActiveFilter] = React.useState<FilterType>('playlists');

    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollX.value = event.contentOffset.x;
        },
        onMomentumEnd: (event) => {
            const page = Math.round(event.contentOffset.x / pageWidth);
            const filters: FilterType[] = ['playlists', 'artists', 'albums'];
            if (activeFilter !== filters[page]) {
                runOnJS(setActiveFilter)(filters[page]);
            }
        }
    });

    const handleFilterChange = (filter: FilterType) => {
        const filters: FilterType[] = ['playlists', 'artists', 'albums'];
        const index = filters.indexOf(filter);
        pagerRef.current?.scrollTo({ x: index * pageWidth, animated: true });
        setActiveFilter(filter);
    };

    const indicatorStyle = useAnimatedStyle(() => {
        const tabWidth = (pageWidth - 32) / 3;
        const translateX = interpolate(
            scrollX.value,
            [0, pageWidth, pageWidth * 2],
            [0, tabWidth, tabWidth * 2]
        );
        return {
            transform: [{ translateX }],
            width: tabWidth - 16,
            marginLeft: 8,
        };
    });

    const numColumns = Math.floor(pageWidth / 160);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.navigate('Settings')}>
                    {user?.id ? (
                        <Avatar.Image size={isLandscape ? 32 : 40} source={{ uri: jellyfinApi.getUserImageUrl(user.id) }} />
                    ) : (
                        <Avatar.Icon size={isLandscape ? 32 : 40} icon="account" />
                    )}
                </TouchableOpacity>
                <Text variant={isLandscape ? "titleMedium" : "headlineSmall"} style={styles.headerTitle}>Your Library</Text>
                {activeFilter === 'playlists' && (
                    <IconButton icon="plus" onPress={() => { }} style={{ margin: 0 }} />
                )}
            </View>

            <View style={styles.tabContainer}>
                <View style={styles.tabBar}>
                    {(['playlists', 'artists', 'albums'] as FilterType[]).map((filter) => (
                        <TouchableOpacity
                            key={filter}
                            onPress={() => handleFilterChange(filter)}
                            style={[styles.tabItem, { width: (pageWidth - 32) / 3 }]}
                        >
                            <Text variant="labelLarge" style={[styles.tabText, activeFilter === filter && { color: theme.colors.primary, fontWeight: 'bold' }]}>
                                {filter.charAt(0).toUpperCase() + filter.slice(1)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                    <Animated.View style={[styles.activeIndicator, { backgroundColor: theme.colors.primary }, indicatorStyle]} />
                </View>
            </View>

            <Animated.ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                style={{ flex: 1 }}
                contentContainerStyle={{ width: pageWidth * 3 }}
                decelerationRate="fast"
                removeClippedSubviews={true}
            >
                <PlaylistPage isLandscape={isLandscape} pageWidth={pageWidth} numColumns={numColumns} dataSource={dataSource} navigation={navigation} theme={theme} />
                <ArtistPage isLandscape={isLandscape} pageWidth={pageWidth} numColumns={numColumns} dataSource={dataSource} navigation={navigation} theme={theme} />
                <AlbumPage isLandscape={isLandscape} pageWidth={pageWidth} numColumns={numColumns} dataSource={dataSource} navigation={navigation} theme={theme} />
            </Animated.ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 8, paddingHorizontal: 16 },
    headerTitle: { flex: 1, marginLeft: 16, fontWeight: 'bold' },
    tabContainer: { paddingHorizontal: 16 },
    tabBar: { flexDirection: 'row', marginBottom: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255, 255, 255, 0.1)', position: 'relative' },
    tabItem: { paddingVertical: 12, alignItems: 'center' },
    tabText: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 14 },
    activeIndicator: { position: 'absolute', bottom: -1, height: 3, borderRadius: 2 },
    listContent: { paddingBottom: 140 },
    item: { paddingVertical: 8 },
    itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
    itemTextContainer: { marginLeft: 16, flex: 1, justifyContent: 'center' },
    avatarContainer: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center' },
});
