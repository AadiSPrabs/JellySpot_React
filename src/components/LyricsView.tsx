import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, Keyboard, FlatList, ListRenderItemInfo } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Text, useTheme, Portal, Button, IconButton, List, TextInput } from 'react-native-paper';
import { jellyfinApi } from '../api/jellyfin';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import ActionSheet from './ActionSheet';
import ScrollMeter from './ScrollMeter';
import { lyricsService } from '../services/LyricsService';
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
    Extrapolate
} from 'react-native-reanimated';

interface LyricsViewProps {
    itemId: string;
    activeColor?: string;
    inactiveColor?: string;
    localLyrics?: string; 
}

interface LyricLine {
    time: number; // milliseconds (-1 for unsynced)
    text: string;
    translation?: string;
}

// Animated Lyric Line Component for smooth transitions
const LYRIC_ITEM_HEIGHT = 100;

const AnimatedLyricLine = React.memo(({ 
    item, 
    isActive, 
    activeColor, 
    inactiveColor, 
    onPress,
    scrollY,
    index,
    containerHeight
}: { 
    item: LyricLine; 
    isActive: boolean; 
    activeColor: string; 
    inactiveColor: string;
    onPress: () => void;
    scrollY: Animated.SharedValue<number>;
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
        const headerHeight = Math.max(0, (containerHeight / 2) - (LYRIC_ITEM_HEIGHT / 2));
        const itemPosInList = index * LYRIC_ITEM_HEIGHT + headerHeight;
        const itemPosOnScreen = itemPosInList - scrollY.value;
        
        // Fade out at edges (relative to container height)
        const edgeFade = interpolate(
            itemPosOnScreen,
            [0, LYRIC_ITEM_HEIGHT, containerHeight - LYRIC_ITEM_HEIGHT, containerHeight],
            [0, 1, 1, 0],
            Extrapolate.CLAMP
        );

        return {
            opacity: interpolate(progress.value, [0, 1], [0.6, 1]) * edgeFade,
            transform: [
                { scale: interpolate(progress.value, [0, 1], [0.92, 1.05]) }
            ],
        };
    });

    const animatedTextStyle = useAnimatedStyle(() => {
        return {
            color: interpolateColor(
                progress.value,
                [0, 1],
                [inactiveColor, activeColor]
            ),
        };
    });

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={item.time === -1}
            activeOpacity={0.7}
            style={{ height: LYRIC_ITEM_HEIGHT, justifyContent: 'center' }}
        >
            <Animated.View style={[styles.line, animatedStyle]}>
                <Animated.Text
                    style={[
                        animatedTextStyle,
                        {
                            fontSize: 24,
                            fontWeight: 'bold',
                            textAlign: 'center',
                            lineHeight: 30,
                        }
                    ]}
                    numberOfLines={2}
                >
                    {item.text}
                </Animated.Text>
                {!!item.translation && (
                    <Text
                        variant="bodyMedium"
                        numberOfLines={1}
                        style={{
                            color: isActive ? activeColor : inactiveColor,
                            textAlign: 'center',
                            opacity: isActive ? 0.8 : 0.4,
                            marginTop: 2,
                            fontStyle: 'italic'
                        }}
                    >
                        {item.translation}
                    </Text>
                )}
            </Animated.View>
        </TouchableOpacity>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.isActive === nextProps.isActive &&
        prevProps.activeColor === nextProps.activeColor &&
        prevProps.inactiveColor === nextProps.inactiveColor &&
        prevProps.containerHeight === nextProps.containerHeight &&
        prevProps.item.text === nextProps.item.text &&
        prevProps.item.translation === nextProps.item.translation &&
        prevProps.scrollY === nextProps.scrollY // Shared values have stable references
    );
});

export default function LyricsView({ itemId, activeColor, inactiveColor, localLyrics }: LyricsViewProps) {
    const { positionMillis, currentTrack, seek } = usePlayerStore(useShallow(state => ({
        positionMillis: state.positionMillis,
        currentTrack: state.currentTrack,
        seek: state.seek,
    })));
    const { lyricsOffsets, setLyricsOffset, translationLanguages, setTranslationLanguage } = useSettingsStore();
    const currentOffset = lyricsOffsets[itemId] || 0;
    const currentTranslationLanguage = translationLanguages[itemId] || 'none';

    const theme = useTheme();
    const activeTextColor = activeColor || theme.colors.primary;
    const inactiveTextColor = inactiveColor || 'rgba(255,255,255,0.5)';

    const [lyrics, setLyrics] = useState<LyricLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentSource, setCurrentSource] = useState<'jellyfin' | 'lrclib' | null>(null);
    const [showOffsetDialog, setShowOffsetDialog] = useState(false);
    const [showTranslateDialog, setShowTranslateDialog] = useState(false);
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);
    const [showSearchDialog, setShowSearchDialog] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [tempOffset, setTempOffset] = useState(currentOffset);
    const flatListRef = useRef<FlatList<LyricLine>>(null);
    const lastActiveIndexRef = useRef<number>(-1);
    const isUserScrollingRef = useRef(false);
    const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    
    const scrollY = useSharedValue(0);
    const [containerHeight, setContainerHeight] = useState(600);

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
        const lines = lrcString.split('\n');
        const result: LyricLine[] = [];
        const timeRegExp = /\[(\d{1,3}):(\d{2})[\.:](\d{2,3})\]/;

        lines.forEach(line => {
            const match = timeRegExp.exec(line);
            if (match) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const milliseconds = parseInt(match[3], 10) * (match[3].length === 2 ? 10 : 1);
                const time = minutes * 60 * 1000 + seconds * 1000 + milliseconds;
                const text = line.replace(timeRegExp, '').trim();
                if (text) result.push({ time, text });
            }
        });

        if (result.length === 0 && lrcString.trim().length > 0) {
            return lrcString.split('\n').map(text => ({
                time: -1,
                text: text.trim()
            })).filter(l => l.text);
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
                setError(parsedLyrics.length === 0 ? 'No lyrics found' : null);
                setLoading(false);
            }
            return;
        }

        const fetchLyrics = async () => {
            if (!currentTrack || currentTrack.id !== itemId) {
                if (isMounted) { setLyrics([]); setError(null); }
                return;
            }

            try {
                if (isMounted) setLoading(true);
                const response = await lyricsService.getLyrics(currentTrack);

                if (isMounted) {
                    if (response.type === 'none' || !response.lyrics) {
                        setLyrics([]);
                        setError('No lyrics found');
                    } else {
                        let parsedLyrics: LyricLine[] = [];
                        if (response.type === 'plain') {
                            parsedLyrics = response.lyrics.split('\n').map(text => ({
                                time: -1,
                                text: text.trim()
                            })).filter(l => l.text);
                        } else if (response.type === 'synced') {
                            parsedLyrics = parseLRC(response.lyrics);
                        }

                        if (parsedLyrics.length > 0 && currentTranslationLanguage !== 'none') {
                            try {
                                parsedLyrics = await lyricsService.translateLyrics(currentTrack.id, parsedLyrics, currentTranslationLanguage);
                            } catch (err) {
                                console.error('Failed to apply lyrics translation:', err);
                            }
                        }

                        if (isMounted) {
                            setLyrics(parsedLyrics);
                            setCurrentSource(response.source);
                            setError(parsedLyrics.length === 0 ? 'No lyrics found' : null);
                        }
                    }
                }
            } catch (err) {
                if (isMounted) setError('Failed to load lyrics');
                console.warn('Lyrics fetch failed', err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchLyrics();
        return () => { isMounted = false; };
    }, [itemId, currentTrack, localLyrics, currentTranslationLanguage, refreshTrigger]);

    // Track active index and handle haptics + auto-scroll
    useEffect(() => {
        if (!lyrics.length) return;

        const adjustedTime = positionMillis + currentOffset + 500;
        const activeIndex = lyrics.findIndex((line, index) => {
            const nextLine = lyrics[index + 1];
            return adjustedTime >= line.time && (!nextLine || adjustedTime < nextLine.time);
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
                    viewPosition: 0.5
                });
            }
        }
    }, [positionMillis, lyrics, currentOffset]);

    const handleSearchLyrics = async () => {
        if (!searchQuery.trim()) return;
        Keyboard.dismiss();
        setIsSearching(true);
        try {
            const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`);
            const data = await res.json();
            setSearchResults(data || []);
        } catch (e) {
            console.error('Lyrics search failed', e);
            setSearchResults([]);
        }
        setIsSearching(false);
    };

    const handleSelectSearchResult = async (result: any) => {
        const lyricsToSave = result.syncedLyrics || result.plainLyrics;
        if (!lyricsToSave || !currentTrack) return;
        await lyricsService.saveOfflineLyrics(currentTrack.id, lyricsToSave);
        setShowSearchDialog(false);
        setRefreshTrigger(prev => prev + 1);
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
        const isActive = item.time !== -1 && adjustedTime >= item.time && (!nextLine || adjustedTime < nextLine.time);

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
                    <Text style={{ color: inactiveTextColor }}>{error || 'No lyrics found'}</Text>
                </View>
            );
        }

        return (
            <Animated.FlatList
                key={`lyrics-list-${containerHeight}`}
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
                ListHeaderComponent={<View style={{ height: Math.max(0, containerHeight / 2 - LYRIC_ITEM_HEIGHT / 2) }} />}
                ListFooterComponent={<View style={{ height: Math.max(0, containerHeight / 2 - LYRIC_ITEM_HEIGHT / 2) }} />}
                getItemLayout={(_, index) => {
                    const headerHeight = Math.max(0, containerHeight / 2 - LYRIC_ITEM_HEIGHT / 2);
                    return {
                        length: LYRIC_ITEM_HEIGHT,
                        offset: headerHeight + (LYRIC_ITEM_HEIGHT * index),
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
        <View style={styles.container} onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}>
            {renderContent()}

            {/* Action Buttons */}
            <TouchableOpacity style={styles.settingsButton} onPress={() => setShowSettingsMenu(true)}>
                <IconButton icon="dots-horizontal" size={20} iconColor={activeTextColor} style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.translateButton} onPress={() => setShowTranslateDialog(true)}>
                <IconButton icon="translate" size={20} iconColor={activeTextColor} style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
            </TouchableOpacity>

            {/* Dialogs & Menus */}
            <ActionSheet visible={showTranslateDialog} onClose={() => setShowTranslateDialog(false)} title="Translate Lyrics" scrollable heightPercentage={50}>
                <View style={{ gap: 4 }}>
                    {[
                        { code: 'none', label: 'Off' },
                        { code: 'en', label: 'English' },
                        { code: 'es', label: 'Spanish' },
                        { code: 'fr', label: 'French' },
                        { code: 'de', label: 'German' },
                        { code: 'pt', label: 'Portuguese' },
                        { code: 'it', label: 'Italian' },
                        { code: 'ja', label: 'Japanese' },
                        { code: 'ko', label: 'Korean' },
                        { code: 'rm', label: 'Romanized' },
                    ].map(lang => (
                        <List.Item
                            key={lang.code}
                            title={lang.label}
                            onPress={() => {
                                setTranslationLanguage(itemId, lang.code);
                                setShowTranslateDialog(false);
                            }}
                            right={props => currentTranslationLanguage === lang.code ? <List.Icon {...props} icon="check" color={theme.colors.primary} /> : null}
                        />
                    ))}
                </View>
            </ActionSheet>

            <ActionSheet visible={showSettingsMenu} onClose={() => setShowSettingsMenu(false)} title="Lyrics Options">
                <View style={{ paddingBottom: 16 }}>
                    <List.Item
                        title="Search Lyrics"
                        description="Manually find lyrics for this track"
                        left={props => <List.Icon {...props} icon="magnify" />}
                        onPress={() => { setShowSettingsMenu(false); setSearchQuery(`${currentTrack?.name || ''} ${currentTrack?.artist || ''}`.trim()); setShowSearchDialog(true); }}
                    />
                    {currentSource === 'lrclib' && (
                        <List.Item
                            title="Switch to Jellyfin Lyrics"
                            description="Use lyrics from your Jellyfin server"
                            left={props => <List.Icon {...props} icon="server" />}
                            onPress={async () => {
                                setShowSettingsMenu(false);
                                if (currentTrack) {
                                    await lyricsService.deleteOfflineLyrics(currentTrack.id);
                                    setRefreshTrigger(prev => prev + 1);
                                }
                            }}
                        />
                    )}
                    <List.Item
                        title="Adjust Timing"
                        description="Sync lyrics if they are slightly off"
                        left={props => <List.Icon {...props} icon="tune-vertical" />}
                        onPress={() => { setShowSettingsMenu(false); setTempOffset(currentOffset); setShowOffsetDialog(true); }}
                    />
                </View>
            </ActionSheet>

            <ActionSheet visible={showSearchDialog} onClose={() => setShowSearchDialog(false)} title="Search Lyrics" heightPercentage={80}>
                <View style={{ flex: 1, paddingBottom: 16 }}>
                    <TextInput
                        mode="outlined"
                        placeholder="Song name and artist..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onSubmitEditing={handleSearchLyrics}
                        right={<TextInput.Icon icon="magnify" onPress={handleSearchLyrics} />}
                        style={{ marginBottom: 16 }}
                    />
                    {isSearching ? (
                        <ActivityIndicator style={{ marginTop: 32 }} color={theme.colors.primary} />
                    ) : (
                        <FlashList
                            data={searchResults}
                            keyExtractor={item => item.id.toString()}
                            estimatedItemSize={72}
                            renderItem={({ item }: { item: any }) => (
                                <List.Item
                                    title={item.name || item.trackName}
                                    description={`${item.artistName} • ${item.albumName} \n${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}`}
                                    descriptionNumberOfLines={2}
                                    right={props => item.syncedLyrics ? <Text {...props} style={{ alignSelf: 'center', color: theme.colors.primary, fontSize: 12 }}>Synced</Text> : null}
                                    onPress={() => handleSelectSearchResult(item)}
                                    style={{ marginVertical: 4 }}
                                />
                            )}
                        />
                    )}
                </View>
            </ActionSheet>

            <ActionSheet visible={showOffsetDialog} onClose={() => setShowOffsetDialog(false)} title="Lyrics Timing" heightPercentage={45}>
                <View style={{ gap: 16, alignItems: 'center' }}>
                    <Text variant="displaySmall" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
                        {tempOffset > 0 ? '+' : ''}{(tempOffset / 1000).toFixed(1)}s
                    </Text>
                    <ScrollMeter value={tempOffset} onValueChange={setTempOffset} />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, width: '100%', marginTop: 16 }}>
                        <Button mode="text" onPress={() => { setLyricsOffset(itemId, tempOffset); setShowOffsetDialog(false); }}>Save</Button>
                    </View>
                </View>
            </ActionSheet>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: 'hidden',
        borderWidth: 0,
        borderColor: 'transparent',
    },
    mask: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: '18%',
        zIndex: 10,
        borderWidth: 0,
        borderColor: 'transparent',
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContent: {
        paddingHorizontal: 24,
    },
    line: {
        alignItems: 'center',
    },
    settingsButton: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        zIndex: 20,
    },
    translateButton: {
        position: 'absolute',
        bottom: 24,
        left: 24,
        zIndex: 20,
    },
});
