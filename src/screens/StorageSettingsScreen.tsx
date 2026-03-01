import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Text, Button, useTheme, Surface, IconButton, Divider, ActivityIndicator, Checkbox } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useLocalLibraryStore } from '../store/localLibraryStore';
import { Folder, Music, FolderCheck } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import SettingsGroup from '../components/SettingsGroup';

// Storage stats interface
interface StorageStats {
    audioSizeBytes: number;
    artworkSizeBytes: number;
    metadataSizeBytes: number;
    cacheSizeBytes: number;
    totalBytes: number;
    tracksWithActualSize: number;
    totalTracksAnalyzed: number;
    isCalculating: boolean;
}

export default function StorageSettingsScreen() {
    const theme = useTheme();
    const navigation = useNavigation();
    const {
        tracks,
        isScanning,
        isEnriching,
        enrichProgress,
        scanProgress,
        permissionGranted,
        requestPermissions,
        refreshLibrary,
        availableFolders,
        selectedFolderPaths,
        toggleFolderSelection,
        selectAllFolders,
        deselectAllFolders,
        getFilteredTracks,
    } = useLocalLibraryStore();

    const filteredTracksCount = getFilteredTracks().length;

    // Storage stats state
    const [storageStats, setStorageStats] = useState<StorageStats>({
        audioSizeBytes: 0,
        artworkSizeBytes: 0,
        metadataSizeBytes: 0,
        cacheSizeBytes: 0,
        totalBytes: 0,
        tracksWithActualSize: 0,
        totalTracksAnalyzed: 0,
        isCalculating: false,
    });

    // Calculate actual storage sizes
    useEffect(() => {
        if (tracks.length === 0) return;

        const calculateStorageStats = async () => {
            setStorageStats(prev => ({ ...prev, isCalculating: true }));

            let audioSize = 0;
            let tracksWithSize = 0;

            // Calculate audio file sizes
            for (const track of tracks) {
                // First try using stored fileSize from the library
                if (track.fileSize && track.fileSize > 0) {
                    audioSize += track.fileSize;
                    tracksWithSize++;
                } else {
                    // Try to get actual size from filesystem
                    try {
                        let uri = track.streamUrl;
                        // Ensure proper file:// prefix
                        if (!uri.startsWith('file://') && uri.startsWith('/')) {
                            uri = 'file://' + uri;
                        }
                        const info = await FileSystem.getInfoAsync(uri);
                        if (info.exists && 'size' in info && info.size) {
                            audioSize += info.size;
                            tracksWithSize++;
                        } else {
                            // Fallback: estimate from duration and bitrate
                            const durationSec = (track.durationMillis || 0) / 1000;
                            const bitrate = track.bitrate || 320000;
                            audioSize += (bitrate / 8) * durationSec;
                        }
                    } catch {
                        // Fallback: estimate from duration and bitrate
                        const durationSec = (track.durationMillis || 0) / 1000;
                        const bitrate = track.bitrate || 320000;
                        audioSize += (bitrate / 8) * durationSec;
                    }
                }
            }

            // Artwork size - measure actual cache directory if exists
            let artworkSize = 0;
            const artworkCacheDir = FileSystem.cacheDirectory + 'artwork/';
            try {
                const artworkDirInfo = await FileSystem.getInfoAsync(artworkCacheDir);
                if (artworkDirInfo.exists) {
                    const files = await FileSystem.readDirectoryAsync(artworkCacheDir);
                    for (const file of files) {
                        const fileInfo = await FileSystem.getInfoAsync(artworkCacheDir + file);
                        if (fileInfo.exists && 'size' in fileInfo && fileInfo.size) {
                            artworkSize += fileInfo.size;
                        }
                    }
                }
            } catch {
                // Fallback to estimation: ~50KB per track with artwork
                const tracksWithArtwork = tracks.filter(t => t.imageUrl && t.imageUrl.length > 0 && !t.imageUrl.startsWith('file://')).length;
                artworkSize = tracksWithArtwork * 50 * 1024;
            }

            // Database/metadata size - measure SQLite DB file
            let metadataSize = 0;
            const dbPath = FileSystem.documentDirectory + 'SQLite/jellyspot.db';
            try {
                const dbInfo = await FileSystem.getInfoAsync(dbPath);
                if (dbInfo.exists && 'size' in dbInfo && dbInfo.size) {
                    metadataSize = dbInfo.size;
                }
            } catch {
                // Fallback: ~2KB per track
                metadataSize = tracks.length * 2 * 1024;
            }

            // App cache size
            let cacheSize = 0;
            try {
                const cacheDir = FileSystem.cacheDirectory;
                if (cacheDir) {
                    const files = await FileSystem.readDirectoryAsync(cacheDir);
                    for (const file of files.slice(0, 50)) { // Sample first 50 files for performance
                        try {
                            const fileInfo = await FileSystem.getInfoAsync(cacheDir + file);
                            if (fileInfo.exists && 'size' in fileInfo && fileInfo.size) {
                                cacheSize += fileInfo.size;
                            }
                        } catch { }
                    }
                    // Extrapolate if more files
                    if (files.length > 50) {
                        cacheSize = (cacheSize / 50) * files.length;
                    }
                }
            } catch {
                // Fallback: ~10KB per enriched track
                const enrichedTracks = tracks.filter(t => t.metadataEnriched).length;
                cacheSize = enrichedTracks * 10 * 1024;
            }

            setStorageStats({
                audioSizeBytes: audioSize,
                artworkSizeBytes: artworkSize,
                metadataSizeBytes: metadataSize,
                cacheSizeBytes: cacheSize,
                totalBytes: audioSize + artworkSize + metadataSize + cacheSize,
                tracksWithActualSize: tracksWithSize,
                totalTracksAnalyzed: tracks.length,
                isCalculating: false,
            });
        };

        calculateStorageStats();
    }, [tracks.length]); // Recalculate when track count changes

    const handleGrantPermission = async () => {
        try {
            const granted = await requestPermissions();
            if (granted) {
                await refreshLibrary();
            }
        } catch (error) {
            Alert.alert('Error', 'Failed to request permissions: ' + error);
        }
    };

    // Auto-scan library when permissions are granted and tracks are empty
    useEffect(() => {
        if (permissionGranted && tracks.length === 0 && !isScanning) {
            refreshLibrary();
        }
    }, [permissionGranted]);

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            <View style={styles.appBar}>
                <IconButton icon="arrow-left" onPress={() => navigation.goBack()} />
                <Text variant="titleLarge" style={{ fontWeight: 'bold' }}>Storage Settings</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* Permission Section */}
                {!permissionGranted && (
                    <SettingsGroup title="Grant Access">
                        <View style={{ padding: 16 }}>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}>
                                Jellyspot needs permission to access your device's audio files.
                            </Text>

                            <Button
                                mode="contained"
                                onPress={handleGrantPermission}
                                icon="folder-open"
                                style={styles.button}
                            >
                                Grant Permission
                            </Button>
                        </View>
                    </SettingsGroup>
                )}

                {/* Library Status Section */}
                <SettingsGroup title="Library Status">
                    <View style={{ padding: 16 }}>
                        <View style={styles.statsRow}>
                            <View style={[styles.stat, { marginRight: 24 }]}>
                                <Text variant="headlineMedium" style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
                                    {tracks.length}
                                </Text>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                    Total Songs
                                </Text>
                            </View>
                            <View style={[styles.stat, { marginRight: 24 }]}>
                                <Text variant="headlineMedium" style={{ color: theme.colors.secondary, fontWeight: 'bold' }}>
                                    {filteredTracksCount}
                                </Text>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                    In Library
                                </Text>
                            </View>
                            <View style={styles.stat}>
                                <Text variant="headlineMedium" style={{ color: theme.colors.tertiary, fontWeight: 'bold' }}>
                                    {availableFolders.length}
                                </Text>
                                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                                    Folders
                                </Text>
                            </View>
                        </View>

                        {isEnriching && (
                            <View style={{ marginBottom: 12 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                    <ActivityIndicator size="small" color={theme.colors.tertiary} />
                                    <Text variant="bodySmall" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>
                                        Extracting metadata... {enrichProgress}%
                                    </Text>
                                </View>
                                <View style={{ height: 4, backgroundColor: theme.colors.surfaceVariant, borderRadius: 2 }}>
                                    <View style={{
                                        height: 4,
                                        width: `${enrichProgress}%`,
                                        backgroundColor: theme.colors.tertiary,
                                        borderRadius: 2
                                    }} />
                                </View>
                            </View>
                        )}

                        {isScanning && (
                            <View style={{ marginTop: 12 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                    <ActivityIndicator size="small" color={theme.colors.primary} />
                                    <Text variant="bodySmall" style={{ marginLeft: 8, color: theme.colors.onSurfaceVariant }}>
                                        Scanning library... {scanProgress}%
                                    </Text>
                                </View>
                                <View style={{ height: 4, backgroundColor: theme.colors.surfaceVariant, borderRadius: 2 }}>
                                    <View style={{
                                        height: 4,
                                        width: `${scanProgress}%`,
                                        backgroundColor: theme.colors.primary,
                                        borderRadius: 2
                                    }} />
                                </View>
                            </View>
                        )}

                        {/* Refresh Library Button */}
                        {permissionGranted && !isScanning && (
                            <Button
                                mode="outlined"
                                onPress={() => refreshLibrary()}
                                icon="refresh"
                                style={{ marginTop: 16 }}
                            >
                                Refresh Library
                            </Button>
                        )}
                    </View>
                </SettingsGroup>

                {/* Storage Analytics Section */}
                {tracks.length > 0 && (
                    <SettingsGroup title="Storage Analytics">
                        <View style={{ padding: 16 }}>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                                {storageStats.isCalculating
                                    ? 'Calculating storage usage...'
                                    : `Storage breakdown (${storageStats.tracksWithActualSize}/${storageStats.totalTracksAnalyzed} tracks with actual size data)`}
                            </Text>

                            {storageStats.isCalculating ? (
                                <View style={{ alignItems: 'center', padding: 20 }}>
                                    <ActivityIndicator size="small" color={theme.colors.primary} />
                                    <Text variant="bodySmall" style={{ marginTop: 8, color: theme.colors.onSurfaceVariant }}>
                                        Measuring file sizes...
                                    </Text>
                                </View>
                            ) : (() => {
                                const { audioSizeBytes, artworkSizeBytes, metadataSizeBytes, cacheSizeBytes, totalBytes } = storageStats;

                                // Calculate percentages
                                const audioPercent = totalBytes > 0 ? (audioSizeBytes / totalBytes) * 100 : 0;
                                const artworkPercent = totalBytes > 0 ? (artworkSizeBytes / totalBytes) * 100 : 0;
                                const metadataPercent = totalBytes > 0 ? (metadataSizeBytes / totalBytes) * 100 : 0;
                                const cachePercent = totalBytes > 0 ? (cacheSizeBytes / totalBytes) * 100 : 0;

                                // Format size helper
                                const formatSize = (bytes: number) => {
                                    if (bytes < 1024) return `${bytes.toFixed(0)} B`;
                                    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
                                    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
                                    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
                                };

                                const categories = [
                                    { label: 'Audio Files', size: audioSizeBytes, percent: audioPercent, color: '#E53935' },
                                    { label: 'Artwork', size: artworkSizeBytes, percent: artworkPercent, color: '#FFC107' },
                                    { label: 'Database', size: metadataSizeBytes, percent: metadataPercent, color: '#5C6BC0' },
                                    { label: 'Cache', size: cacheSizeBytes, percent: cachePercent, color: '#78909C' },
                                ];

                                return (
                                    <>
                                        {/* Segmented Progress Bar */}
                                        <View style={styles.segmentedBar}>
                                            {categories.map((cat, index) => (
                                                cat.percent > 0 && (
                                                    <View
                                                        key={cat.label}
                                                        style={{
                                                            flex: cat.percent,
                                                            minWidth: cat.percent > 0 ? 8 : 0,
                                                            height: 12,
                                                            backgroundColor: cat.color,
                                                            borderTopLeftRadius: index === 0 ? 6 : 0,
                                                            borderBottomLeftRadius: index === 0 ? 6 : 0,
                                                            borderTopRightRadius: index === categories.length - 1 ? 6 : 0,
                                                            borderBottomRightRadius: index === categories.length - 1 ? 6 : 0,
                                                        }}
                                                    />
                                                )
                                            ))}
                                        </View>

                                        {/* Category List */}
                                        <View style={styles.categoryList}>
                                            {categories.map((cat) => (
                                                <View key={cat.label} style={styles.categoryItem}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                        <View style={[styles.categoryDot, { backgroundColor: cat.color }]} />
                                                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                                                            {cat.label}
                                                        </Text>
                                                    </View>
                                                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                                                        {formatSize(cat.size)}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>

                                        {/* Total */}
                                        <View style={[styles.categoryItem, { marginTop: 8, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: theme.colors.outline }]}>
                                            <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                                                Total
                                            </Text>
                                            <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                                                {formatSize(totalBytes)}
                                            </Text>
                                        </View>
                                    </>
                                );
                            })()}
                        </View>
                    </SettingsGroup>
                )}

                {/* Folder Selection Section */}
                {availableFolders.length > 0 && (
                    <SettingsGroup title="Folder Filter">
                        <View style={{ padding: 16 }}>
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                                Select which folders to include in your library. Only songs from selected folders will appear.
                            </Text>

                            {/* Select All / Deselect All buttons */}
                            <View style={{ flexDirection: 'row', marginBottom: 12, gap: 8 }}>
                                <Button
                                    mode="outlined"
                                    compact
                                    onPress={selectAllFolders}
                                    style={{ flex: 1 }}
                                >
                                    Select All
                                </Button>
                                <Button
                                    mode="outlined"
                                    compact
                                    onPress={deselectAllFolders}
                                    style={{ flex: 1 }}
                                >
                                    Deselect All
                                </Button>
                            </View>

                            {/* Folder list */}
                            <View style={styles.folderList}>
                                {availableFolders.map((folder) => {
                                    const isSelected = selectedFolderPaths.includes(folder.path);
                                    return (
                                        <TouchableOpacity
                                            key={folder.path}
                                            style={styles.folderItem}
                                            onPress={() => toggleFolderSelection(folder.path)}
                                        >
                                            <Checkbox
                                                status={isSelected ? 'checked' : 'unchecked'}
                                                onPress={() => toggleFolderSelection(folder.path)}
                                            />
                                            <View style={{ flex: 1, marginLeft: 8 }}>
                                                <Text
                                                    variant="bodyMedium"
                                                    style={{ color: theme.colors.onSurface }}
                                                    numberOfLines={1}
                                                >
                                                    {folder.displayName}
                                                </Text>
                                                <Text
                                                    variant="bodySmall"
                                                    style={{ color: theme.colors.onSurfaceVariant }}
                                                >
                                                    {folder.trackCount} songs
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    </SettingsGroup>
                )}

                {/* Help Text */}
                <View style={styles.helpSection}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
                        Switch between Jellyfin and Local mode using the toggle on the Home screen.
                    </Text>
                </View>
            </ScrollView>


        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    appBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        marginBottom: 8,
    },
    content: {
        paddingVertical: 16,
        paddingBottom: 40,
    },
    folderDisplay: {
        padding: 12,
        borderRadius: 12,
        marginBottom: 8,
    },
    button: {
        marginTop: 8,
    },
    statsRow: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    stat: {
        alignItems: 'center',
    },
    helpSection: {
        marginTop: 24,
        paddingHorizontal: 16,
    },
    radioItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingRight: 16,
    },
    folderList: {
        marginTop: 8,
    },
    folderItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 0.5,
        borderBottomColor: 'rgba(150, 150, 150, 0.2)',
    },
    segmentedBar: {
        flexDirection: 'row',
        height: 12,
        borderRadius: 6,
        overflow: 'hidden',
        marginBottom: 16,
    },
    categoryList: {
        marginTop: 8,
    },
    categoryItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
    },
    categoryDot: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 12,
    },
});
