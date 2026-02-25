import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity } from 'react-native';
import { Text, useTheme, Portal, Dialog, Button, IconButton } from 'react-native-paper';
import Slider from '@react-native-community/slider';
import { jellyfinApi } from '../api/jellyfin';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';

interface LyricsViewProps {
    itemId: string;
    activeColor?: string;
    inactiveColor?: string;
    localLyrics?: string; // Optional embedded lyrics for local tracks
}

interface LyricLine {
    time: number; // milliseconds (-1 for unsynced)
    text: string;
}

export default function LyricsView({ itemId, activeColor, inactiveColor, localLyrics }: LyricsViewProps) {
    const currentTime = usePlayerStore(state => state.positionMillis);
    const { lyricsOffset, setLyricsOffset } = useSettingsStore();
    const theme = useTheme();
    const activeTextColor = activeColor || theme.colors.primary;
    const inactiveTextColor = inactiveColor || theme.colors.onSurfaceVariant;

    const [lyrics, setLyrics] = useState<LyricLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showOffsetDialog, setShowOffsetDialog] = useState(false);
    const [tempOffset, setTempOffset] = useState(lyricsOffset);
    const flatListRef = useRef<FlatList>(null);
    const lastActiveIndexRef = useRef<number>(-1);

    // Parse LRC format lyrics
    const parseLRC = (lrcString: string): LyricLine[] => {
        const lines = lrcString.split('\n');
        const result: LyricLine[] = [];
        // Regex for LRC format: [mm:ss.xx] or [mm:ss:xx]
        // Using RegExp constructor to avoid escaping issues
        const timeRegExp = new RegExp('\\[(\\d{1,3}):(\\d{2})[\\.:](\d{2,3})\\]');

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

        // If local lyrics are provided, use them directly (no API call)
        if (localLyrics) {
            const parsedLyrics = parseLRC(localLyrics);
            if (isMounted) {
                setLyrics(parsedLyrics);
                setError(parsedLyrics.length === 0 ? 'No lyrics found' : null);
                setLoading(false);
            }
            return;
        }

        // Fetch from Jellyfin API for remote tracks
        const fetchLyrics = async () => {
            try {
                if (isMounted) setLoading(true);
                const response = await jellyfinApi.getAudioLyrics(itemId);

                let parsedLyrics: LyricLine[] = [];

                // Native Jellyfin Synced Lyrics (Array of objects with Start ticks)
                if (response?.Lyrics && Array.isArray(response.Lyrics) && response.Lyrics.length > 0 && typeof response.Lyrics[0] === 'object' && 'Start' in response.Lyrics[0]) {
                    parsedLyrics = transformJellyfinLyrics(response.Lyrics);
                } else {
                    // Text-based lyrics (LRC format or plain text)
                    let textCandidate = '';
                    if (typeof response === 'string') {
                        textCandidate = response;
                    } else if (response && typeof response.Lyrics === 'string') {
                        textCandidate = response.Lyrics;
                    }

                    if (textCandidate) {
                        parsedLyrics = parseLRC(textCandidate);
                    }
                }

                if (isMounted) {
                    setLyrics(parsedLyrics);
                    setError(parsedLyrics.length === 0 ? 'No lyrics found' : null);
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
    }, [itemId, localLyrics]);

    // Auto-scroll to active lyric
    useEffect(() => {
        if (!lyrics.length) return;

        const adjustedTime = currentTime + lyricsOffset;
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
    }, [currentTime, lyrics, lyricsOffset]);

    const handleOpenOffsetDialog = () => {
        setTempOffset(lyricsOffset);
        setShowOffsetDialog(true);
    };

    const handleSaveOffset = () => {
        setLyricsOffset(tempOffset);
        setShowOffsetDialog(false);
    };

    const renderItem = ({ item, index }: { item: LyricLine, index: number }) => {
        const adjustedTime = currentTime + lyricsOffset;
        const nextLine = lyrics[index + 1];
        const isActive = item.time !== -1 && adjustedTime >= item.time && (!nextLine || adjustedTime < nextLine.time);

        return (
            <View style={styles.line}>
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
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="small" color={activeTextColor} />
            </View>
        );
    }

    if (error || lyrics.length === 0) {
        return (
            <View style={styles.center}>
                <Text style={{ color: inactiveTextColor }}>No lyrics found</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
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

            {/* Settings Button */}
            <TouchableOpacity
                style={styles.settingsButton}
                onPress={handleOpenOffsetDialog}
            >
                <IconButton
                    icon="tune-vertical"
                    size={20}
                    iconColor={theme.colors.onSurfaceVariant}
                    style={{ margin: 0 }}
                />
            </TouchableOpacity>

            {/* Offset Settings Dialog */}
            <Portal>
                <Dialog visible={showOffsetDialog} onDismiss={() => setShowOffsetDialog(false)}>
                    <Dialog.Title>Lyrics Timing</Dialog.Title>
                    <Dialog.Content>
                        <Text variant="bodyMedium" style={{ marginBottom: 16 }}>
                            Adjust when lyrics are highlighted. Positive values show lyrics earlier (lead time), negative values show them later.
                        </Text>
                        <View style={styles.sliderHeader}>
                            <Text variant="bodyMedium">Offset</Text>
                            <Text variant="titleMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
                                {tempOffset > 0 ? '+' : ''}{tempOffset}ms
                            </Text>
                        </View>
                        <Slider
                            style={styles.slider}
                            minimumValue={-2000}
                            maximumValue={2000}
                            step={100}
                            value={tempOffset}
                            onValueChange={(value) => setTempOffset(value)}
                            minimumTrackTintColor={theme.colors.primary}
                            maximumTrackTintColor={theme.colors.surfaceVariant}
                            thumbTintColor={theme.colors.primary}
                        />
                        <View style={styles.sliderLabels}>
                            <Text variant="labelSmall" style={{ color: theme.colors.outline }}>Later (-2s)</Text>
                            <Text variant="labelSmall" style={{ color: theme.colors.outline }}>Earlier (+2s)</Text>
                        </View>
                    </Dialog.Content>
                    <Dialog.Actions>
                        <Button onPress={() => setTempOffset(0)}>Reset</Button>
                        <Button onPress={() => setShowOffsetDialog(false)}>Cancel</Button>
                        <Button mode="contained" onPress={handleSaveOffset}>Save</Button>
                    </Dialog.Actions>
                </Dialog>
            </Portal>
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
        opacity: 0.8,
    },
    sliderHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    slider: {
        width: '100%',
        height: 40,
    },
    sliderLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: -4,
    },
});
