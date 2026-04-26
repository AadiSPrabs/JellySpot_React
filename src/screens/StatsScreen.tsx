import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Dimensions, RefreshControl } from 'react-native';
import { Text, useTheme, Surface, IconButton, Divider } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { Image as ExpoImage } from 'expo-image';
import { DatabaseService } from '../services/DatabaseService';
import { useSettingsStore } from '../store/settingsStore';
import { BarChart } from 'react-native-gifted-charts';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Utility: convert raw minutes into a friendly string
function formatDuration(totalMinutes: number): { value: string; unit: string } {
    if (totalMinutes < 1) return { value: '0', unit: 'min' };
    if (totalMinutes < 60) return { value: `${totalMinutes}`, unit: 'min' };
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    if (hours < 24) return { value: `${hours}h ${mins}m`, unit: '' };
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    return { value: `${days}d ${remHours}h`, unit: '' };
}

export default function StatsScreen() {
    const theme = useTheme();
    const { dataSource } = useSettingsStore();
    const navigation = useNavigation();
    const [refreshing, setRefreshing] = useState(false);

    const [stats, setStats] = useState({
        allTimeMinutes: 0,
        monthMinutes: 0,
        yearMinutes: 0,
        dailyStats: [0, 0, 0, 0, 0, 0, 0]
    });

    const [topTracks, setTopTracks] = useState<any[]>([]);
    const [recentTracks, setRecentTracks] = useState<any[]>([]);
    const [totalPlays, setTotalPlays] = useState(0);

    const loadStats = useCallback(async () => {
        try {
            const [data, top, recent] = await Promise.all([
                DatabaseService.getListeningStats(dataSource),
                DatabaseService.getMostPlayed(dataSource, 5),
                DatabaseService.getRecentlyPlayed(dataSource, 10),
            ]);
            setStats(data);
            setTopTracks(top);
            setRecentTracks(recent);

            // Calculate total plays from top tracks
            const plays = top.reduce((acc: number, t: any) => acc + (t.playCount || 0), 0);
            setTotalPlays(plays);
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
    }, [dataSource]);

    const { useFocusEffect } = require('@react-navigation/native');
    useFocusEffect(
        useCallback(() => {
            loadStats();
        }, [loadStats])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadStats();
        setRefreshing(false);
    }, [loadStats]);

    // Build chart data with day labels
    const today = new Date().getDay(); // 0=Sun, 1=Mon...
    const chartData = stats.dailyStats.map((value, i) => {
        // Map index to day label (dailyStats[0] = 7 days ago, [6] = today)
        const dayIndex = (today - (6 - i) + 7) % 7;
        // Convert Sun=0 -> index 6, Mon=1 -> index 0 for display
        const label = DAY_LABELS[dayIndex === 0 ? 6 : dayIndex - 1];
        return {
            value,
            label,
            frontColor: i === 6 ? theme.colors.primary : `${theme.colors.primary}88`,
            topLabelComponent: value > 0 ? () => (
                <Text style={{ color: theme.colors.primary, fontSize: 9, marginBottom: 2 }}>{value}</Text>
            ) : undefined,
        };
    });

    const monthFormatted = formatDuration(stats.monthMinutes);
    const yearFormatted = formatDuration(stats.yearMinutes);
    const allTimeFormatted = formatDuration(stats.allTimeMinutes);

    // Average daily listening
    const avgDaily = Math.round(stats.dailyStats.reduce((a, b) => a + b, 0) / 7);

    // Format "time ago" string
    const timeAgo = (date: Date | string | number) => {
        const d = new Date(date);
        const now = new Date();
        const diff = now.getTime() - d.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        if (days < 7) return `${days}d ago`;
        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            <View style={styles.header}>
                <IconButton icon="arrow-left" size={24} onPress={() => navigation.goBack()} />
                <Text variant="headlineSmall" style={styles.headerTitle}>Listening Tracker</Text>
                <View style={{ width: 48 }} />
            </View>

            <ScrollView
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
            >
                {/* Hero Card */}
                <Surface style={styles.heroCard} elevation={4}>
                    <LinearGradient
                        colors={[theme.colors.primary, theme.colors.tertiary || '#6750A4', '#1a1a1a']}
                        style={StyleSheet.absoluteFill}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                    />
                    <View style={styles.heroOverlay}>
                        <View style={styles.heroContent}>
                            <Icon name="headphones" size={28} color="rgba(255,255,255,0.6)" />
                            <Text style={styles.heroLabel}>THIS MONTH</Text>
                            <Text style={styles.heroValue}>
                                {monthFormatted.value}
                            </Text>
                            {monthFormatted.unit ? (
                                <Text style={styles.heroUnit}>{monthFormatted.unit}</Text>
                            ) : null}
                            <Text style={styles.heroSub}>of listening</Text>
                        </View>
                    </View>
                </Surface>

                {/* Stats Row */}
                <View style={styles.row}>
                    <Surface style={[styles.statBox, { backgroundColor: theme.colors.elevation.level2 }]} elevation={2}>
                        <Icon name="calendar-month" size={20} color={theme.colors.secondary} style={{ marginBottom: 4 }} />
                        <Text variant="labelSmall" style={{ color: theme.colors.secondary, letterSpacing: 1 }}>THIS YEAR</Text>
                        <Text variant="titleLarge" style={{ fontWeight: 'bold', marginTop: 4 }}>
                            {yearFormatted.value}
                        </Text>
                        {yearFormatted.unit ? <Text variant="labelSmall" style={{ color: theme.colors.secondary }}>{yearFormatted.unit}</Text> : null}
                    </Surface>
                    <Surface style={[styles.statBox, { backgroundColor: theme.colors.elevation.level2 }]} elevation={2}>
                        <Icon name="infinity" size={20} color={theme.colors.secondary} style={{ marginBottom: 4 }} />
                        <Text variant="labelSmall" style={{ color: theme.colors.secondary, letterSpacing: 1 }}>ALL TIME</Text>
                        <Text variant="titleLarge" style={{ fontWeight: 'bold', marginTop: 4 }}>
                            {allTimeFormatted.value}
                        </Text>
                        {allTimeFormatted.unit ? <Text variant="labelSmall" style={{ color: theme.colors.secondary }}>{allTimeFormatted.unit}</Text> : null}
                    </Surface>
                    <Surface style={[styles.statBox, { backgroundColor: theme.colors.elevation.level2 }]} elevation={2}>
                        <Icon name="chart-line" size={20} color={theme.colors.secondary} style={{ marginBottom: 4 }} />
                        <Text variant="labelSmall" style={{ color: theme.colors.secondary, letterSpacing: 1 }}>AVG / DAY</Text>
                        <Text variant="titleLarge" style={{ fontWeight: 'bold', marginTop: 4 }}>
                            {avgDaily}
                        </Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.secondary }}>min</Text>
                    </Surface>
                </View>

                {/* Weekly Chart */}
                <Surface style={[styles.chartContainer, { backgroundColor: theme.colors.elevation.level1 }]} elevation={1}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Last 7 Days</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.secondary }}>minutes / day</Text>
                    </View>
                    <BarChart
                        data={chartData}
                        barWidth={Math.min(28, (SCREEN_WIDTH - 120) / 7 - 8)}
                        spacing={Math.min(16, (SCREEN_WIDTH - 120) / 7 - 20)}
                        noOfSections={3}
                        barBorderRadius={6}
                        yAxisThickness={0}
                        xAxisThickness={0}
                        xAxisLabelTextStyle={{ color: theme.colors.secondary, fontSize: 10 }}
                        yAxisTextStyle={{ color: theme.colors.secondary, fontSize: 10 }}
                        hideRules
                        isAnimated
                        animationDuration={600}
                        height={120}
                        width={SCREEN_WIDTH - 80}
                        disableScroll
                    />

                </Surface>

                {/* Top Tracks */}
                {topTracks.length > 0 && (
                    <View style={styles.section}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Top Tracks</Text>
                            <Icon name="trophy" size={18} color={theme.colors.primary} />
                        </View>
                        {topTracks.map((track, index) => (
                            <Surface key={track.id + '-' + index} style={[styles.trackItem, { backgroundColor: theme.colors.elevation.level1 }]} elevation={0}>
                                <View style={[styles.rankBadge, {
                                    backgroundColor: index === 0 ? `${theme.colors.primary}22` :
                                        index === 1 ? `${theme.colors.secondary}18` :
                                            'transparent'
                                }]}>
                                    <Text style={[styles.rankText, {
                                        color: index === 0 ? theme.colors.primary :
                                            index === 1 ? theme.colors.secondary :
                                                theme.colors.onSurfaceVariant
                                    }]}>
                                        {index + 1}
                                    </Text>
                                </View>
                                {track.imageUrl ? (
                                    <ExpoImage
                                        source={{ uri: track.imageUrl }}
                                        style={styles.trackImage}
                                        contentFit="cover"
                                        cachePolicy="memory-disk"
                                    />
                                ) : (
                                    <View style={[styles.trackImage, { backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' }]}>
                                        <Icon name="music-note" size={16} color={theme.colors.onSurfaceVariant} />
                                    </View>
                                )}
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text variant="titleSmall" numberOfLines={1}>{track.name}</Text>
                                    <Text variant="bodySmall" style={{ color: theme.colors.secondary }} numberOfLines={1}>{track.artist}</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text variant="labelLarge" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>{track.playCount}</Text>
                                    <Text variant="labelSmall" style={{ color: theme.colors.secondary }}>plays</Text>
                                </View>
                            </Surface>
                        ))}
                    </View>
                )}

                {/* Recent Plays */}
                {recentTracks.length > 0 && (
                    <View style={styles.section}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <Text variant="titleMedium" style={{ fontWeight: 'bold' }}>Recently Played</Text>
                            <Icon name="history" size={18} color={theme.colors.primary} />
                        </View>
                        {recentTracks.map((track, index) => (
                            <View key={track.id + '-recent-' + index} style={styles.recentItem}>
                                {track.imageUrl ? (
                                    <ExpoImage
                                        source={{ uri: track.imageUrl }}
                                        style={styles.recentImage}
                                        contentFit="cover"
                                        cachePolicy="memory-disk"
                                    />
                                ) : (
                                    <View style={[styles.recentImage, { backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center' }]}>
                                        <Icon name="music-note" size={14} color={theme.colors.onSurfaceVariant} />
                                    </View>
                                )}
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text variant="bodyMedium" numberOfLines={1}>{track.name}</Text>
                                    <Text variant="bodySmall" style={{ color: theme.colors.secondary }} numberOfLines={1}>{track.artist}</Text>
                                </View>
                                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                    {track.playedAt ? timeAgo(track.playedAt) : ''}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Empty State */}
                {stats.allTimeMinutes === 0 && topTracks.length === 0 && (
                    <View style={styles.emptyState}>
                        <Icon name="music-note-outline" size={64} color={theme.colors.onSurfaceVariant} />
                        <Text variant="titleMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}>
                            No listening data yet
                        </Text>
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8 }}>
                            Start playing music and your stats will appear here
                        </Text>
                    </View>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingBottom: 8,
    },
    headerTitle: {
        flex: 1,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    scrollContent: {
        padding: 16,
    },
    heroCard: {
        height: 200,
        borderRadius: 24,
        overflow: 'hidden',
        marginBottom: 16,
    },
    heroOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.25)',
    },
    heroContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
    },
    heroLabel: {
        color: 'rgba(255,255,255,0.6)',
        letterSpacing: 3,
        fontWeight: 'bold',
        fontSize: 11,
        marginTop: 8,
        marginBottom: 4,
    },
    heroValue: {
        color: '#FFFFFF',
        fontWeight: 'bold',
        fontSize: 52,
        lineHeight: 60,
    },
    heroUnit: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 18,
        fontWeight: '600',
        marginTop: -4,
    },
    heroSub: {
        color: 'rgba(255,255,255,0.7)',
        fontWeight: '500',
        fontSize: 14,
        marginTop: 4,
    },
    row: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 16,
    },
    statBox: {
        flex: 1,
        padding: 14,
        borderRadius: 16,
        alignItems: 'center',
    },
    chartContainer: {
        padding: 16,
        borderRadius: 20,
        marginBottom: 24,
    },
    section: {
        marginBottom: 24,
    },
    trackItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 14,
        marginBottom: 8,
    },
    rankBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
    },
    rankText: {
        fontWeight: 'bold',
        fontSize: 14,
    },
    trackImage: {
        width: 44,
        height: 44,
        borderRadius: 8,
        marginLeft: 8,
    },
    recentItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 4,
    },
    recentImage: {
        width: 36,
        height: 36,
        borderRadius: 6,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 60,
    },
});
