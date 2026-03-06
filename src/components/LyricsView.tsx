import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Keyboard } from 'react-native';
import { Text, useTheme, Portal, Dialog, Button, IconButton, List, TextInput } from 'react-native-paper';
import { jellyfinApi } from '../api/jellyfin';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import ActionSheet from './ActionSheet';
import { lyricsService } from '../services/LyricsService';
import { Switch } from 'react-native-paper';

import { useShallow } from 'zustand/react/shallow';

interface LyricsViewProps {
    itemId: string;
    activeColor?: string;
    inactiveColor?: string;
    localLyrics?: string; // Optional embedded lyrics for local tracks
}

interface LyricLine {
    time: number; // milliseconds (-1 for unsynced)
    text: string;
    translation?: string;
}

export default function LyricsView({ itemId, activeColor, inactiveColor, localLyrics }: LyricsViewProps) {
    const { positionMillis, currentTrack, seek } = usePlayerStore(useShallow(state => ({
        positionMillis: state.positionMillis,
        currentTrack: state.currentTrack,
        seek: state.seek,
    })));
    const { lyricsOffsets, setLyricsOffset, translationLanguages, setTranslationLanguage, preferJellyfinLyrics, setPreferJellyfinLyrics, dataSource } = useSettingsStore();
    const currentOffset = lyricsOffsets[itemId] || 0;
    const currentTranslationLanguage = translationLanguages[itemId] || 'none';

    const theme = useTheme();
    const activeTextColor = activeColor || theme.colors.primary;
    const inactiveTextColor = inactiveColor || theme.colors.onSurfaceVariant;

    const [lyrics, setLyrics] = useState<LyricLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showOffsetDialog, setShowOffsetDialog] = useState(false);
    const [showTranslateDialog, setShowTranslateDialog] = useState(false);
    const [showSettingsMenu, setShowSettingsMenu] = useState(false);
    const [showSearchDialog, setShowSearchDialog] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [refreshTrigger, setRefreshTrigger] = useState(0);

    const [tempOffset, setTempOffset] = useState(currentOffset);
    const flatListRef = useRef<FlatList>(null);
    const lastActiveIndexRef = useRef<number>(-1);

    // Parse LRC format lyrics
    const parseLRC = (lrcString: string): LyricLine[] => {
        const lines = lrcString.split('\n');
        const result: LyricLine[] = [];
        // Regex for LRC format: [mm:ss.xx] or [mm:ss:xx]
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

        // If no timestamps found, treat as plain text (unsynced)
        if (result.length === 0 && lrcString.trim().length > 0) {
            return lrcString.split('\n').map(text => ({
                time: -1,
                text: text.trim()
            })).filter(l => l.text);
        }

        return result;
    };

    // Transform Jellyfin lyrics format
    const transformJellyfinLyrics = (lyricsObjects: any[]): LyricLine[] => {
        return lyricsObjects.map((obj: any) => ({
            time: obj.Start / 10000, // Ticks to milliseconds
            text: obj.Text || ''
        }));
    };

    // Fetch/Parse Lyrics
    useEffect(() => {
        let isMounted = true;

        // If local lyrics are provided (e.g., from ID3 tags), use them directly
        if (localLyrics) {
            const parsedLyrics = parseLRC(localLyrics);
            if (isMounted) {
                setLyrics(parsedLyrics);
                setError(parsedLyrics.length === 0 ? 'No lyrics found' : null);
                setLoading(false);
            }
            return;
        }

        // Fetch from LyricsService (handles LRCLIB / Jellyfin fallback based on settings)
        const fetchLyrics = async () => {
            if (!currentTrack || currentTrack.id !== itemId) {
                // Wait for the correct track object to match the itemId prop
                if (isMounted) {
                    setLyrics([]);
                    setError(null);
                }
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

                        // Handle Translations
                        if (parsedLyrics.length > 0 && currentTranslationLanguage !== 'none') {
                            setLoading(true); // Keep loading while translating
                            try {
                                parsedLyrics = await lyricsService.translateLyrics(currentTrack.id, parsedLyrics, currentTranslationLanguage);
                            } catch (err) {
                                console.error('Failed to apply lyrics translation:', err);
                            }
                        }

                        if (isMounted) {
                            setLyrics(parsedLyrics);
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
        setRefreshTrigger(prev => prev + 1); // Trigger re-fetch
    };

    // Auto-scroll to active lyric
    useEffect(() => {
        if (!lyrics.length) return;

        // Systemic adjustment: adding 500ms to positionMillis to compensate for reported latency
        // This makes lyrics highlight "earlier" (500ms lead)
        const adjustedTime = positionMillis + currentOffset + 500;
        const activeIndex = lyrics.findIndex((line, index) => {
            const nextLine = lyrics[index + 1];
            return adjustedTime >= line.time && (!nextLine || adjustedTime < nextLine.time);
        });

        if (activeIndex !== -1 && activeIndex !== lastActiveIndexRef.current) {
            lastActiveIndexRef.current = activeIndex;
            flatListRef.current?.scrollToIndex({
                index: activeIndex,
                animated: true,
                viewPosition: 0.5
            });
        }
    }, [positionMillis, lyrics, currentOffset]);

    const handleOpenOffsetDialog = () => {
        setTempOffset(currentOffset);
        setShowOffsetDialog(true);
    };

    const handleSaveOffset = () => {
        setLyricsOffset(itemId, tempOffset);
        setShowOffsetDialog(false);
    };

    const renderItem = ({ item, index }: { item: LyricLine, index: number }) => {
        const adjustedTime = positionMillis + currentOffset + 500;
        const nextLine = lyrics[index + 1];
        const isActive = item.time !== -1 && adjustedTime >= item.time && (!nextLine || adjustedTime < nextLine.time);

        return (
            <TouchableOpacity
                style={styles.line}
                onPress={() => {
                    if (item.time !== -1) {
                        // Import Haptics at the top if needed, or just remove, but I'll skip it to avoid missing imports.
                        seek(item.time - currentOffset);
                    }
                }}
                disabled={item.time === -1}
                activeOpacity={0.7}
            >
                <Text
                    variant={isActive ? "headlineSmall" : "titleMedium"}
                    style={{
                        color: isActive ? activeTextColor : inactiveTextColor,
                        fontWeight: isActive ? 'bold' : 'normal',
                        textAlign: 'center',
                        opacity: isActive ? 1 : 0.6
                    }}
                >
                    {item.text}
                </Text>
                {item.translation ? (
                    <Text
                        variant={isActive ? "titleMedium" : "titleSmall"}
                        style={{
                            color: isActive ? activeTextColor : inactiveTextColor,
                            textAlign: 'center',
                            opacity: isActive ? 0.75 : 0.4,
                            marginTop: 4
                        }}
                    >
                        {item.translation}
                    </Text>
                ) : null}
            </TouchableOpacity>
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
            <FlatList
                ref={flatListRef}
                data={lyrics}
                renderItem={renderItem}
                keyExtractor={(item, index) => `${index}`}
                contentContainerStyle={styles.listContent}
                showsVerticalScrollIndicator={false}
                onScrollToIndexFailed={(info) => {
                    setTimeout(() => {
                        flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
                    }, 500);
                }}
            />
        );
    };

    return (
        <View style={styles.container}>
            {renderContent()}

            {/* Settings Button */}
            <TouchableOpacity
                style={styles.settingsButton}
                onPress={() => setShowSettingsMenu(true)}
            >
                <IconButton
                    icon="dots-horizontal"
                    size={20}
                    iconColor={theme.colors.onSurfaceVariant}
                    style={{ margin: 0 }}
                />
            </TouchableOpacity>

            {/* Translate Button */}
            <TouchableOpacity
                style={styles.translateButton}
                onPress={() => setShowTranslateDialog(true)}
            >
                <IconButton
                    icon="translate"
                    size={20}
                    iconColor={theme.colors.onSurfaceVariant}
                    style={{ margin: 0 }}
                />
            </TouchableOpacity>

            {/* Translate ActionSheet */}
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
                        { code: 'rm', label: 'Romanized (Pronunciation)' },
                    ].map(lang => (
                        <Button
                            key={lang.code}
                            mode={currentTranslationLanguage === lang.code ? "contained-tonal" : "text"}
                            onPress={() => {
                                setTranslationLanguage(itemId, lang.code);
                                setShowTranslateDialog(false);
                            }}
                            style={{ marginVertical: 4 }}
                        >
                            {lang.label}
                        </Button>
                    ))}
                </View>
            </ActionSheet>

            {/* Settings Menu */}
            <ActionSheet visible={showSettingsMenu} onClose={() => setShowSettingsMenu(false)} title="Lyrics Options" heightPercentage={40}>
                <View style={{ paddingTop: 8 }}>
                    <List.Item
                        title="Search Lyrics"
                        description="Manually find lyrics for this track"
                        left={props => <List.Icon {...props} icon="magnify" />}
                        onPress={() => {
                            setShowSettingsMenu(false);
                            setSearchQuery(`${currentTrack?.name || ''} ${currentTrack?.artist || ''}`.trim());
                            setShowSearchDialog(true);
                        }}
                    />
                    <List.Item
                        title="Adjust Timing"
                        description="Sync lyrics if they are slightly off"
                        left={props => <List.Icon {...props} icon="tune-vertical" />}
                        onPress={() => {
                            setShowSettingsMenu(false);
                            handleOpenOffsetDialog();
                        }}
                    />
                    {dataSource !== 'local' && (
                        <List.Item
                            title="Prefer Jellyfin Lyrics"
                            description="Use lyrics from your server instead of LRCLIB"
                            left={props => <List.Icon {...props} icon="server" />}
                            right={props => (
                                <View style={{ justifyContent: 'center' }}>
                                    <Switch
                                        value={preferJellyfinLyrics}
                                        onValueChange={(val) => {
                                            setPreferJellyfinLyrics(val);
                                            setRefreshTrigger(prev => prev + 1);
                                        }}
                                    />
                                </View>
                            )}
                            onPress={() => {
                                setPreferJellyfinLyrics(!preferJellyfinLyrics);
                                setRefreshTrigger(prev => prev + 1);
                            }}
                        />
                    )}
                </View>
            </ActionSheet>

            {/* Search Lyrics Dialog */}
            <ActionSheet visible={showSearchDialog} onClose={() => setShowSearchDialog(false)} title="Search Lyrics" heightPercentage={80} scrollable={false}>
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
                        <FlatList
                            data={searchResults}
                            keyExtractor={item => item.id.toString()}
                            renderItem={({ item }) => (
                                <List.Item
                                    title={item.name || item.trackName}
                                    description={`${item.artistName} • ${item.albumName} \n${Math.floor(item.duration / 60)}:${String(item.duration % 60).padStart(2, '0')}`}
                                    descriptionNumberOfLines={2}
                                    right={props => item.syncedLyrics ? <Text {...props} style={{ alignSelf: 'center', color: theme.colors.primary, fontSize: 12 }}>Synced</Text> : null}
                                    onPress={() => handleSelectSearchResult(item)}
                                    style={{ marginVertical: 4 }}
                                />
                            )}
                            ListEmptyComponent={
                                searchQuery ?
                                    <Text style={{ textAlign: 'center', marginTop: 32, color: theme.colors.onSurfaceVariant }}>No results found.</Text>
                                    : null
                            }
                        />
                    )}
                </View>
            </ActionSheet>

            {/* Offset Settings ActionSheet */}
            <ActionSheet visible={showOffsetDialog} onClose={() => setShowOffsetDialog(false)} title="Lyrics Timing" heightPercentage={45}>
                <View style={{ gap: 16 }}>
                    <Text variant="bodyMedium">
                        If the lyrics are out of sync for this specific song, you can adjust the timing here. (+0.5s means lyrics highlight half a second earlier).
                    </Text>

                    <View style={{ alignItems: 'center' }}>
                        <Text variant="displaySmall" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
                            {tempOffset > 0 ? '+' : ''}{(tempOffset / 1000).toFixed(1)}s
                        </Text>
                        <Text variant="labelMedium" style={{ color: theme.colors.outline, marginTop: 4 }}>
                            Current Offset
                        </Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' }}>
                        <Button
                            mode="outlined"
                            onPress={() => setTempOffset(prev => prev - 500)}
                            icon="minus"
                        >
                            0.5s
                        </Button>
                        <Button
                            mode="outlined"
                            onPress={() => setTempOffset(prev => prev + 500)}
                            icon="plus"
                        >
                            0.5s
                        </Button>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                        <Button mode="text" onPress={() => setTempOffset(0)}>Reset</Button>
                        <Button mode="text" onPress={() => setShowOffsetDialog(false)}>Cancel</Button>
                        <Button mode="contained" onPress={handleSaveOffset}>Save</Button>
                    </View>
                </View>
            </ActionSheet>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        minHeight: 300,
    },
    listContent: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingVertical: '50%',
        paddingHorizontal: 20,
    },
    line: {
        marginVertical: 12,
        alignItems: 'center',
    },
    settingsButton: {
        position: 'absolute',
        bottom: 16,
        right: 16,
        borderRadius: 20,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    translateButton: {
        position: 'absolute',
        bottom: 16,
        left: 16,
        borderRadius: 20,
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
