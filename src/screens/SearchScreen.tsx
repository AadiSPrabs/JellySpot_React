import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity, Image, ScrollView, Dimensions, Keyboard, SectionList, useWindowDimensions, Animated, LayoutAnimation, Platform, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme, TouchableRipple, Surface, Chip, ActivityIndicator } from 'react-native-paper';
import { jellyfinApi } from '../api/jellyfin';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { useLocalLibraryStore } from '../store/localLibraryStore';
import { DatabaseService } from '../services/DatabaseService';
import { Search as SearchIcon, X, ArrowLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SearchStackParamList } from '../types/navigation';
import { Loader } from '../components/Loader';
import { LinearGradient } from 'expo-linear-gradient';
import { LEFT_BAR_WIDTH } from '../navigation/MainNavigator';

// Predefined colors for genre cards to make them pop properly like Spotify
const GENRE_COLORS = [
    ['#E13300', '#731A00'], // Orange
    ['#1E3264', '#0A1122'], // Blue
    ['#8D67AB', '#463355'], // Purple
    ['#148A08', '#0A4504'], // Green
    ['#BC5900', '#5E2C00'], // Brown/Orange
    ['#E91429', '#740A14'], // Red
    ['#D84000', '#6C2000'], // Deep Orange
    ['#509BF5', '#284D7A'], // Light Blue
];

export default function SearchScreen() {
    const theme = useTheme();
    const navigation = useNavigation<NativeStackNavigationProp<SearchStackParamList>>();
    const playTrack = usePlayerStore((state) => state.playTrack);
    const { dataSource, sourceMode } = useSettingsStore();
    const localLibrary = useLocalLibraryStore();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    // Dynamic card sizing based on screen width (subtract left tab bar in landscape)
    const columnCount = isLandscape ? 4 : 2;
    const contentWidth = isLandscape ? width - LEFT_BAR_WIDTH : width;
    const cardWidth = (contentWidth - 48) / columnCount; // 16px padding on sides, 16px gap

    const [query, setQuery] = useState('');
    const [localResults, setLocalResults] = useState<any[]>([]);
    const [jellyfinResults, setJellyfinResults] = useState<any[]>([]);
    const [localGenres, setLocalGenres] = useState<any[]>([]);
    const [jellyfinGenres, setJellyfinGenres] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [genresLoading, setGenresLoading] = useState(true);
    const [filter, setFilter] = useState<'All' | 'Songs' | 'Artists' | 'Albums'>('All');

    const searchInputRef = useRef<TextInput>(null);

    // Orientation transition animation
    const layoutOpacity = useRef(new Animated.Value(1)).current;

    // Orientation transition effect - Wait for layout to settle before showing
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

    // Check if each source should be used
    const useLocal = sourceMode === 'local' || sourceMode === 'both';
    const useJellyfin = sourceMode === 'jellyfin' || sourceMode === 'both';

    // Combined genres for display
    const genres = [...localGenres, ...jellyfinGenres];

    useEffect(() => {
        loadGenres();
    }, [sourceMode, localLibrary.tracks, localLibrary.selectedFolderPaths]); // Re-fetch when tracks or folder selection changes

    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (query.trim()) {
                performSearch();
            } else {
                setLocalResults([]);
                setJellyfinResults([]);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [query, filter, sourceMode]);

    // Extract genres from local tracks
    const getLocalGenres = () => {
        const genreMap = new Map<string, { count: number; imageUrl: string }>();

        localLibrary.getFilteredTracks().forEach(track => {
            if (track.genre) {
                // Handle multiple genres separated by comma, semicolon, or slash
                const trackGenres = track.genre.split(/[,;\/]/).map(g => g.trim()).filter(g => g);
                trackGenres.forEach(genre => {
                    if (!genreMap.has(genre)) {
                        genreMap.set(genre, { count: 1, imageUrl: track.imageUrl || '' });
                    } else {
                        const existing = genreMap.get(genre)!;
                        existing.count++;
                        // Update image if current one is empty
                        if (!existing.imageUrl && track.imageUrl) {
                            existing.imageUrl = track.imageUrl;
                        }
                    }
                });
            }
        });

        // Convert to array format similar to Jellyfin genres
        return Array.from(genreMap.entries())
            .map(([name, data]) => ({
                Id: `local_genre_${name.toLowerCase().replace(/\s+/g, '_')}`,
                Name: name,
                isLocal: true,
                imageUrl: data.imageUrl,
                songCount: data.count,
            }))
            .sort((a, b) => b.songCount - a.songCount) // Sort by popularity
            .slice(0, 20); // Limit to 20 genres
    };

    const loadGenres = async () => {
        setGenresLoading(true);

        try {
            // Load local genres if local source is enabled
            if (useLocal) {
                const localG = getLocalGenres();

                setLocalGenres(localG);
            } else {
                setLocalGenres([]);
            }

            // Load Jellyfin genres if Jellyfin source is enabled
            if (useJellyfin) {
                try {
                    const data = await jellyfinApi.getGenres(20);
                    setJellyfinGenres(data.Items || []);
                } catch (error) {
                    console.error('Failed to load Jellyfin genres', error);
                    setJellyfinGenres([]);
                }
            } else {
                setJellyfinGenres([]);
            }
        } finally {
            setGenresLoading(false);
        }
    };

    // Helper function to search local library
    const searchLocal = async () => {
        const searchQuery = query.toLowerCase().trim();
        let results: any[] = [];

        try {
            // Search tracks (songs)
            if (filter === 'All' || filter === 'Songs') {
                const tracks = await DatabaseService.searchTracks(searchQuery);
                const matchingTracks = tracks.map(track => ({
                    Id: track.id,
                    Name: track.name,
                    Type: 'Audio',
                    AlbumArtist: track.artist,
                    Album: track.album,
                    imageUrl: track.imageUrl,
                    streamUrl: track.streamUrl,
                    RunTimeTicks: track.durationMillis * 10000,
                    artistId: track.artistId,
                    isLocal: true, // Mark as local
                    bitrate: track.bitrate,
                    codec: track.codec,
                    container: track.container,
                    lyrics: track.lyrics,
                }));
                results.push(...matchingTracks);
            }

            // Search artists
            if (filter === 'All' || filter === 'Artists') {
                const artists = await DatabaseService.searchArtists(searchQuery);
                const matchingArtists = artists.map((a: any) => ({
                    Id: `local_artist_${a.artist.toLowerCase().replace(/\s+/g, '_')}`,
                    Name: a.artist,
                    Type: 'MusicArtist',
                    imageUrl: a.imageUrl,
                    isLocal: true,
                }));
                results.push(...matchingArtists);
            }

            // Search albums
            if (filter === 'All' || filter === 'Albums') {
                const albums = await DatabaseService.searchAlbums(searchQuery);
                const matchingAlbums = albums.map((a: any) => ({
                    Id: `local_album_${a.album.toLowerCase().replace(/\s+/g, '_')}`,
                    Name: a.album,
                    Type: 'MusicAlbum',
                    AlbumArtist: a.artist,
                    imageUrl: a.imageUrl,
                    isLocal: true,
                }));
                results.push(...matchingAlbums);
            }
        } catch (error) {
            console.error('Local search failed:', error);
        }

        return results;
    };

    // Helper function to search Jellyfin
    const searchJellyfin = async () => {
        let types = 'Audio,MusicAlbum,MusicArtist';
        if (filter === 'Songs') types = 'Audio';
        else if (filter === 'Artists') types = 'MusicArtist';
        else if (filter === 'Albums') types = 'MusicAlbum';

        const data = await jellyfinApi.searchItems(query, types);
        return data.Items || [];
    };

    const performSearch = async () => {
        setLoading(true);
        try {
            // Clear previous results
            setLocalResults([]);
            setJellyfinResults([]);

            // Search based on sourceMode
            if (useLocal && useJellyfin) {
                // Both sources - fetch in parallel
                const [localData, jellyfinData] = await Promise.all([
                    Promise.resolve(searchLocal()),
                    searchJellyfin().catch(() => []), // Don't fail if Jellyfin is down
                ]);
                setLocalResults(localData);
                setJellyfinResults(jellyfinData);
            } else if (useLocal) {
                // Local only
                const localData = await searchLocal();
                setLocalResults(localData);
            } else if (useJellyfin) {
                // Jellyfin only
                const data = await searchJellyfin();
                setJellyfinResults(data);
            }
        } catch (error) {
            console.error('Search failed', error);
        } finally {
            setLoading(false);
        }
    };

    const handleItemPress = async (item: any) => {
        if (item.Type === 'Audio') {
            // Check if it's a local track (has streamUrl property set by local search)
            const isLocal = !!item.streamUrl || item.isLocal;
            await playTrack({
                id: item.Id,
                name: item.Name,
                artist: item.AlbumArtist || item.Artists?.[0] || 'Unknown Artist',
                album: item.Album || 'Unknown Album',
                imageUrl: item.imageUrl || jellyfinApi.getImageUrl(item.Id),
                durationMillis: item.RunTimeTicks ? item.RunTimeTicks / 10000 : 0,
                streamUrl: item.streamUrl || '',
                artistId: item.artistId || item.ArtistItems?.[0]?.Id || '',
                // Technical details - use direct properties for local, MediaSources for Jellyfin
                bitrate: isLocal ? item.bitrate : item.MediaSources?.[0]?.Bitrate,
                codec: isLocal ? item.codec : (item.MediaSources?.[0]?.Codec || item.MediaSources?.[0]?.MediaStreams?.find((s: any) => s.Type === 'Audio')?.Codec),
                lyrics: isLocal ? item.lyrics : undefined,
            });
        } else if (item.Type === 'MusicArtist') {
            navigation.navigate('Detail', { itemId: item.Id, type: 'MusicArtist' });
        } else if (item.Type === 'MusicAlbum') {
            navigation.navigate('Detail', { itemId: item.Id, type: 'MusicAlbum' });
        }
    };

    const clearSearch = () => {
        setQuery('');
        setLocalResults([]);
        setJellyfinResults([]);
        Keyboard.dismiss();
    };

    const renderResultItem = ({ item }: { item: any }) => {
        let subtitle = '';
        if (item.Type === 'Audio') subtitle = `Song • ${item.AlbumArtist || item.Artists?.[0] || ''}`;
        else if (item.Type === 'MusicArtist') subtitle = 'Artist';
        else if (item.Type === 'MusicAlbum') subtitle = `Album • ${item.AlbumArtist || item.Artists?.[0] || ''}`;

        // Determine image URL: use item.imageUrl for local, or Jellyfin API for remote
        const imageUrl = item.imageUrl || jellyfinApi.getImageUrl(item.Id);

        return (
            <TouchableRipple
                onPress={() => handleItemPress(item)}
                rippleColor="rgba(255,255,255,0.1)"
                style={styles.resultItem}
            >
                <View style={styles.resultRow}>
                    <Image
                        source={{ uri: imageUrl }}
                        style={[styles.resultImage, item.Type === 'MusicArtist' && { borderRadius: 28 }]}
                    />
                    <View style={styles.resultText}>
                        <Text style={[styles.resultTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>
                            {item.Name}
                        </Text>
                        <Text style={[styles.resultSubtitle, { color: theme.colors.onSurfaceVariant }]} numberOfLines={1}>
                            {subtitle}
                        </Text>
                    </View>
                </View>
            </TouchableRipple>
        );
    };

    const renderGenreItem = ({ item, index }: { item: any, index: number }) => {
        // Deterministic color assignment based on index
        const colors = GENRE_COLORS[index % GENRE_COLORS.length];

        // Use local imageUrl for local genres, Jellyfin API for Jellyfin genres
        const genreImageUrl = item.isLocal
            ? item.imageUrl
            : jellyfinApi.getImageUrl(item.Id);

        return (
            <TouchableOpacity
                style={[styles.genreCard]}
                onPress={() => {
                    // Pre-fill search with genre name
                    setQuery(item.Name);
                }}
            >
                <LinearGradient
                    colors={colors as [string, string]}
                    style={styles.genreGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <Text style={styles.genreTitle}>{item.Name}</Text>
                        {item.isLocal && (
                            <View style={{ backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                <Text style={{ color: '#fff', fontSize: 10 }}>Local</Text>
                            </View>
                        )}
                    </View>
                    {/* Rotate image slightly for style */}
                    {genreImageUrl ? (
                        <Image
                            source={{ uri: genreImageUrl }}
                            style={styles.genreImage}
                        />
                    ) : null}
                </LinearGradient>
            </TouchableOpacity>
        );
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            <View style={{ flex: 1 }}>

                {/* Header: Title */}
                <View style={[styles.header, isLandscape && { marginVertical: 8 }]}>
                    <Text style={[styles.headerTitle, { color: theme.colors.onSurface, fontSize: isLandscape ? 20 : 28 }]}>Search</Text>
                </View>

                {/* Steps: Search Bar */}
                <View style={[styles.searchBarContainer, { backgroundColor: theme.colors.elevation.level2 }]}>
                    <SearchIcon color={theme.colors.onSurfaceVariant} size={20} />
                    <TextInput
                        ref={searchInputRef}
                        style={[styles.searchInput, { color: theme.colors.onSurface }]}
                        placeholder="Artists, songs, or albums"
                        placeholderTextColor={theme.colors.onSurfaceVariant}
                        value={query}
                        onChangeText={setQuery}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                    {query.length > 0 && (
                        <TouchableOpacity onPress={clearSearch}>
                            <X color={theme.colors.onSurfaceVariant} size={20} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Filters (Only show when searching or just before results) */}
                {query.length > 0 && (
                    <View style={styles.filterContainer}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
                            {['All', 'Songs', 'Artists', 'Albums'].map((f) => (
                                <Chip
                                    key={f}
                                    selected={filter === f}
                                    onPress={() => setFilter(f as any)}
                                    showSelectedOverlay
                                    style={{ backgroundColor: filter === f ? theme.colors.primary : theme.colors.surfaceVariant }}
                                    textStyle={{ color: filter === f ? theme.colors.onPrimary : theme.colors.onSurfaceVariant }}
                                >
                                    {f}
                                </Chip>
                            ))}
                        </ScrollView>
                    </View>
                )}

                {/* Main Content */}
                {loading ? (
                    <View style={styles.centerContainer}>
                        <ActivityIndicator size="large" color={theme.colors.primary} />
                    </View>
                ) : query.length === 0 ? (
                    /* Empty State: Browse Categories */
                    <View style={styles.browseContainer}>
                        <Text style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Browse All</Text>
                        {genresLoading ? (
                            <ActivityIndicator style={{ marginTop: 20 }} color={theme.colors.primary} />
                        ) : genres.length > 0 ? (
                            <FlatList
                                key={`genres-${columnCount}`}
                                data={genres}
                                renderItem={renderGenreItem}
                                keyExtractor={(item) => item.Id}
                                numColumns={columnCount}
                                columnWrapperStyle={styles.columnWrapper}
                                contentContainerStyle={styles.genreList}
                                showsVerticalScrollIndicator={false}
                                removeClippedSubviews={true}
                                initialNumToRender={8}
                                maxToRenderPerBatch={8}
                                windowSize={5}
                            />
                        ) : (
                            // Show search prompt if no genres found
                            <View style={styles.centerContainer}>
                                <SearchIcon color={theme.colors.onSurfaceVariant} size={48} style={{ marginBottom: 16, opacity: 0.5 }} />
                                <Text style={{ color: theme.colors.onSurface, fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>
                                    Search Your Library
                                </Text>
                                <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', paddingHorizontal: 40 }}>
                                    Start typing to find songs, artists, and albums
                                </Text>
                            </View>
                        )}
                    </View>
                ) : (
                    /* Search Results - Using SectionList for multiple sources */
                    (() => {
                        // Build sections dynamically based on available results
                        const sections: { title: string; data: any[] }[] = [];

                        if (localResults.length > 0) {
                            sections.push({ title: 'Local Library', data: localResults });
                        }
                        if (jellyfinResults.length > 0) {
                            sections.push({ title: 'Jellyfin', data: jellyfinResults });
                        }

                        // If only one source has results, don't show section header
                        const showSectionHeaders = sections.length > 1 || (sections.length === 1 && sourceMode === 'both');

                        if (sections.length === 0) {
                            return (
                                <View style={styles.centerContainer}>
                                    <Text style={{ color: theme.colors.onSurfaceVariant }}>No results found.</Text>
                                </View>
                            );
                        }

                        return (
                            <SectionList
                                sections={sections}
                                renderItem={renderResultItem}
                                renderSectionHeader={({ section }) => (
                                    showSectionHeaders ? (
                                        <View style={[styles.sectionHeader, { backgroundColor: theme.colors.background }]}>
                                            <Text style={[styles.sectionHeaderText, { color: theme.colors.onSurface }]}>
                                                {section.title}
                                            </Text>
                                        </View>
                                    ) : null
                                )}
                                keyExtractor={(item, index) => `${item.Id}-${index}`}
                                contentContainerStyle={[styles.resultList, { paddingBottom: 180 }]}
                                showsVerticalScrollIndicator={false}
                                stickySectionHeadersEnabled={true}
                            />
                        );
                    })()
                )}
            </View>

            {/* Orientation Transition Curtain */}
            <Animated.View
                pointerEvents="none"
                style={[
                    StyleSheet.absoluteFill,
                    {
                        backgroundColor: theme.colors.background,
                        opacity: layoutOpacity.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 0]
                        }),
                        zIndex: 9999
                    }
                ]}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 16,
        paddingBottom: 10,
        paddingTop: 10,
    },
    headerTitle: {
        fontSize: 32,
        fontWeight: 'bold',
    },
    searchBarContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 16,
        paddingHorizontal: 12,
        height: 48,
        borderRadius: 8,
        marginBottom: 16,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        marginLeft: 10,
        height: '100%',
    },
    filterContainer: {
        marginBottom: 10,
        height: 40,
    },
    browseContainer: {
        flex: 1,
        paddingHorizontal: 16,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    genreList: {
        paddingBottom: 100,
    },
    columnWrapper: {
        gap: 16,
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    genreCard: {
        flex: 1,
        marginHorizontal: 4,
        height: 100,
        borderRadius: 8,
        overflow: 'hidden',
    },
    genreGradient: {
        flex: 1,
        padding: 12,
        position: 'relative',
    },
    genreTitle: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        width: '70%',
    },
    genreImage: {
        position: 'absolute',
        right: -10,
        bottom: -5,
        width: 65,
        height: 65,
        transform: [{ rotate: '25deg' }],
        borderRadius: 4,
        // Add a shadow for depth
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 4,
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    resultList: {
        paddingBottom: 100,
    },
    resultItem: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    resultRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    resultImage: {
        width: 56,
        height: 56,
        marginRight: 12,
        backgroundColor: '#333',
        borderRadius: 4,
    },
    resultText: {
        flex: 1,
        justifyContent: 'center',
    },
    resultTitle: {
        fontSize: 16,
        fontWeight: '500',
        marginBottom: 4,
    },
    resultSubtitle: {
        fontSize: 14,
    },
    sectionHeader: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    sectionHeaderText: {
        fontSize: 16,
        fontWeight: 'bold',
    },
});
