import React, { useEffect, useCallback, useState } from 'react';
import { View, StyleSheet, FlatList, Image, TouchableOpacity, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text, useTheme, IconButton, ProgressBar, Button, Surface } from 'react-native-paper';
import { useDownloadStore, Download, DownloadStatus } from '../store/downloadStore';
import { downloadService } from '../services/DownloadService';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface AlbumGroup {
    album: string;
    downloads: Download[];
    isExpanded: boolean;
}

export default function DownloadsScreen() {
    const theme = useTheme();
    const { downloads, loadDownloads, removeDownload, clearCompleted, retryDownload, cancelAllPending } = useDownloadStore();
    const [expandedAlbums, setExpandedAlbums] = useState<Set<string>>(new Set());

    useEffect(() => {
        loadDownloads();
    }, []);

    // Separate downloads by status
    const activeDownloads = downloads.filter(d => d.status === 'downloading' || d.status === 'pending');
    const completedDownloads = downloads.filter(d => d.status === 'completed');
    const failedDownloads = downloads.filter(d => d.status === 'failed' || d.status === 'cancelled');

    // Group active downloads by groupId (for batches) or album
    const groupedActiveDownloads = React.useMemo(() => {
        const groups: Map<string, { name: string; downloads: Download[] }> = new Map();

        activeDownloads.forEach(d => {
            // Use groupId for batch downloads, otherwise use album
            const key = d.groupId || d.album || 'Unknown Album';
            const displayName = d.groupName || d.album || 'Unknown Album';

            if (!groups.has(key)) {
                groups.set(key, { name: displayName, downloads: [] });
            }
            groups.get(key)!.downloads.push(d);
        });

        return Array.from(groups.entries()).map(([key, group]) => ({
            key,
            album: group.name, // Keep as 'album' for backward compatibility with renderAlbumGroup
            downloads: group.downloads,
            count: group.downloads.length,
            progress: group.downloads.reduce((sum, d) => sum + d.progress, 0) / group.downloads.length,
        }));
    }, [activeDownloads]);

    const toggleAlbumExpanded = (album: string) => {
        setExpandedAlbums(prev => {
            const next = new Set(prev);
            if (next.has(album)) {
                next.delete(album);
            } else {
                next.add(album);
            }
            return next;
        });
    };

    const handleCancel = useCallback(async (id: string) => {
        await downloadService.cancelDownload(id);
    }, []);

    const handleCancelAll = useCallback(async () => {
        await cancelAllPending();
    }, [cancelAllPending]);

    const handleRetry = useCallback(async (id: string) => {
        await retryDownload(id);
        downloadService.startProcessing();
    }, [retryDownload]);

    const handleRemove = useCallback(async (id: string) => {
        await removeDownload(id);
    }, [removeDownload]);

    const getStatusIcon = (status: DownloadStatus) => {
        switch (status) {
            case 'pending': return 'clock-outline';
            case 'downloading': return 'download';
            case 'completed': return 'check-circle';
            case 'failed': return 'alert-circle';
            case 'cancelled': return 'close-circle';
            default: return 'help-circle';
        }
    };

    const getStatusColor = (status: DownloadStatus) => {
        switch (status) {
            case 'pending': return theme.colors.onSurfaceVariant;
            case 'downloading': return theme.colors.primary;
            case 'completed': return '#4CAF50';
            case 'failed': return '#f44336';
            case 'cancelled': return theme.colors.onSurfaceVariant;
            default: return theme.colors.onSurface;
        }
    };

    const renderDownloadItem = (item: Download, compact?: boolean) => {
        const isActive = item.status === 'downloading' || item.status === 'pending';
        const canRetry = item.status === 'failed' || item.status === 'cancelled';

        return (
            <Surface key={item.id} style={[styles.downloadItem, compact && styles.compactItem, { backgroundColor: theme.colors.elevation.level1 }]} elevation={0}>
                <View style={styles.itemRow}>
                    {!compact && (item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.albumArt} />
                    ) : (
                        <View style={[styles.albumArt, styles.placeholderArt, { backgroundColor: theme.colors.surfaceVariant }]}>
                            <Icon name="music-note" size={24} color={theme.colors.onSurfaceVariant} />
                        </View>
                    ))}
                    <View style={[styles.itemInfo, compact && { marginLeft: 0 }]}>
                        <Text variant="titleSmall" numberOfLines={1} style={{ color: theme.colors.onSurface }}>
                            {item.name}
                        </Text>
                        {!compact && (
                            <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                                {item.artist}{item.album ? ` • ${item.album}` : ''}
                            </Text>
                        )}
                        {isActive && (
                            <View style={styles.progressContainer}>
                                <ProgressBar
                                    progress={item.progress / 100}
                                    color={theme.colors.primary}
                                    style={styles.progressBar}
                                />
                                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                    {Math.round(item.progress)}%
                                </Text>
                            </View>
                        )}
                        {item.status === 'failed' && item.errorMessage && (
                            <Text variant="labelSmall" style={{ color: '#f44336' }} numberOfLines={1}>
                                {item.errorMessage}
                            </Text>
                        )}
                    </View>
                    <View style={styles.itemActions}>
                        <Icon
                            name={getStatusIcon(item.status)}
                            size={20}
                            color={getStatusColor(item.status)}
                            style={{ marginRight: 8 }}
                        />
                        {isActive && (
                            <IconButton
                                icon="close"
                                size={20}
                                onPress={() => handleCancel(item.id)}
                            />
                        )}
                        {canRetry && (
                            <IconButton
                                icon="refresh"
                                size={20}
                                onPress={() => handleRetry(item.id)}
                            />
                        )}
                        {!isActive && (
                            <IconButton
                                icon="delete-outline"
                                size={20}
                                onPress={() => handleRemove(item.id)}
                            />
                        )}
                    </View>
                </View>
            </Surface>
        );
    };

    const renderAlbumGroup = (group: { album: string; downloads: Download[]; count: number; progress: number }) => {
        const isExpanded = expandedAlbums.has(group.album);
        const hasMultiple = group.count > 1;

        if (!hasMultiple) {
            // Single track - render directly without grouping
            return renderDownloadItem(group.downloads[0]);
        }

        return (
            <View key={group.album}>
                <Pressable onPress={() => toggleAlbumExpanded(group.album)}>
                    <Surface style={[styles.albumHeader, { backgroundColor: theme.colors.elevation.level2 }]} elevation={0}>
                        <View style={styles.albumHeaderRow}>
                            <Icon
                                name={isExpanded ? "chevron-up" : "chevron-down"}
                                size={24}
                                color={theme.colors.onSurface}
                            />
                            <View style={styles.albumHeaderInfo}>
                                <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: 'bold' }}>
                                    {group.album}
                                </Text>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                    {group.count} songs
                                </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                                <ProgressBar
                                    progress={group.progress / 100}
                                    color={theme.colors.primary}
                                    style={[styles.progressBar, { marginRight: 12 }]}
                                />
                            </View>
                            <Text variant="labelMedium" style={{ color: theme.colors.primary }}>
                                {Math.round(group.progress)}%
                            </Text>
                        </View>
                    </Surface>
                </Pressable>
                {isExpanded && (
                    <View style={styles.expandedTracks}>
                        {group.downloads.map(d => renderDownloadItem(d, true))}
                    </View>
                )}
            </View>
        );
    };

    const renderSectionHeader = (title: string, count: number, showClear?: boolean, onClear?: () => void, showCancelAll?: boolean) => (
        <View style={styles.sectionHeader}>
            <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: 'bold' }}>
                {title} ({count})
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
                {showCancelAll && count > 0 && (
                    <Button mode="text" onPress={handleCancelAll} compact textColor="#f44336">
                        Cancel All
                    </Button>
                )}
                {showClear && count > 0 && (
                    <Button mode="text" onPress={onClear} compact>
                        Clear
                    </Button>
                )}
            </View>
        </View>
    );

    const isEmpty = downloads.length === 0;

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            <View style={styles.header}>
                <Text variant="headlineMedium" style={{ fontWeight: 'bold', color: theme.colors.onSurface }}>
                    Downloads
                </Text>
            </View>

            {isEmpty ? (
                <View style={styles.emptyState}>
                    <Icon name="download-off" size={64} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.5 }} />
                    <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginTop: 16 }}>
                        No downloads yet
                    </Text>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 8, paddingHorizontal: 40 }}>
                        Download songs from your Jellyfin server to listen offline
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={[
                        // Active downloads section with grouped albums
                        ...(groupedActiveDownloads.length > 0 ? [{ type: 'header', title: 'Active', count: activeDownloads.length, showCancelAll: true }] : []),
                        ...groupedActiveDownloads.map(g => ({ type: 'albumGroup', data: g })),
                        // Completed downloads section
                        ...(completedDownloads.length > 0 ? [{ type: 'header', title: 'Completed', count: completedDownloads.length, showClear: true }] : []),
                        ...completedDownloads.map(d => ({ type: 'item', data: d })),
                        // Failed downloads section
                        ...(failedDownloads.length > 0 ? [{ type: 'header', title: 'Failed', count: failedDownloads.length, showClear: true }] : []),
                        ...failedDownloads.map(d => ({ type: 'item', data: d })),
                    ]}
                    keyExtractor={(item, index) => {
                        if (item.type === 'header') return `header-${(item as any).title}`;
                        if (item.type === 'albumGroup') return `group-${(item as any).data.key}`;
                        return `item-${(item as any).data.id}`;
                    }}
                    renderItem={({ item }) => {
                        if (item.type === 'header') {
                            return renderSectionHeader(
                                (item as any).title as string,
                                (item as any).count as number,
                                (item as any).showClear,
                                clearCompleted,
                                (item as any).showCancelAll
                            );
                        }
                        if (item.type === 'albumGroup') {
                            return renderAlbumGroup((item as any).data);
                        }
                        return renderDownloadItem((item as any).data);
                    }}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        paddingHorizontal: 20,
        paddingVertical: 16,
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingBottom: 100,
    },
    listContent: {
        paddingBottom: 100,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    albumHeader: {
        marginHorizontal: 16,
        marginVertical: 4,
        borderRadius: 12,
        overflow: 'hidden',
    },
    albumHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    albumHeaderInfo: {
        marginLeft: 8,
        marginRight: 16,
    },
    expandedTracks: {
        marginLeft: 24,
    },
    downloadItem: {
        marginHorizontal: 16,
        marginVertical: 4,
        borderRadius: 12,
        overflow: 'hidden',
    },
    compactItem: {
        marginHorizontal: 8,
        marginVertical: 2,
        borderRadius: 8,
    },
    itemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
    },
    albumArt: {
        width: 50,
        height: 50,
        borderRadius: 8,
    },
    placeholderArt: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemInfo: {
        flex: 1,
        marginLeft: 12,
    },
    progressContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 6,
        gap: 8,
    },
    progressBar: {
        flex: 1,
        height: 4,
        borderRadius: 2,
    },
    itemActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
});
