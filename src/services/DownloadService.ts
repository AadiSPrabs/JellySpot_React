import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Network from 'expo-network';
import { useDownloadStore, Download } from '../store/downloadStore';
import { useSettingsStore } from '../store/settingsStore';
import { jellyfinApi } from '../api/jellyfin';
import { useAuthStore } from '../store/authStore';
import { DatabaseService } from './DatabaseService';

// Configure notifications
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

const NOTIFICATION_ID = 'download-progress';

class DownloadService {
    private isRunning = false;
    private customDirectory: Directory | null = null;

    // Batch progress tracking
    private currentBatchTotal = 0;
    private currentBatchCompleted = 0;
    private currentBatchGroupName: string | null = null;

    // Clean filename for SAF compatibility
    private cleanFilename(name: string): string {
        return name.replace(/[\\/:*?"<>|]/g, '_');
    }

    // Get the download directory (internal only - SAF is handled separately)
    getInternalDownloadDirectory(): Directory {
        const downloadsDir = new Directory(Paths.document, 'downloads');
        if (!downloadsDir.exists) {
            downloadsDir.create();
        }
        return downloadsDir;
    }

    // Set custom download directory (called from settings)
    setCustomDirectory(directory: Directory | null) {
        this.customDirectory = directory;
    }

    // Get current custom directory
    getCustomDirectory(): Directory | null {
        return this.customDirectory;
    }

    // Get stream URL for a Jellyfin item
    getStreamUrl(itemId: string): string {
        const auth = useAuthStore.getState();
        const token = auth.user?.token;
        if (!auth.serverUrl || !token) {
            throw new Error('Not authenticated to Jellyfin');
        }
        // Direct download URL for audio file
        return `${auth.serverUrl}/Items/${itemId}/File?api_key=${token}`;
    }

    // Queue a single track for download (with optional group info)
    async queueTrack(item: {
        id: string;
        name: string;
        artist: string;
        album?: string;
        imageUrl?: string;
        durationMillis?: number;
        groupId?: string;
        groupName?: string;
    }): Promise<void> {
        const store = useDownloadStore.getState();

        // Check if already in queue
        if (store.downloads.some(d => d.id === item.id && d.status !== 'failed' && d.status !== 'cancelled')) {
            return;
        }

        try {
            const jellyfinUrl = this.getStreamUrl(item.id);

            await store.addToQueue({
                id: item.id,
                name: item.name,
                artist: item.artist,
                album: item.album,
                groupId: item.groupId,
                groupName: item.groupName,
                jellyfinUrl,
                imageUrl: item.imageUrl,
                durationMillis: item.durationMillis,
            });

            // Start processing if not already running
            this.startProcessing();
        } catch (error) {
            console.error('[DownloadService] Error in queueTrack:', error);
        }
    }

    // Queue multiple tracks as a batch (for multi-select downloads)
    async queueBatch(items: Array<{
        id: string;
        name: string;
        artist: string;
        album?: string;
        imageUrl?: string;
        durationMillis?: number;
    }>, customGroupName?: string): Promise<void> {
        if (items.length === 0) return;

        // Generate unique group ID for this batch
        const groupId = `batch_${Date.now()}`;
        const groupName = customGroupName || `${items.length} Selected Songs`;

        for (const item of items) {
            await this.queueTrack({
                ...item,
                groupId,
                groupName,
            });
        }
    }

    // Queue all tracks from an album
    async queueAlbum(albumId: string): Promise<void> {
        try {
            const album = await jellyfinApi.getItem(albumId);
            const albumTracks = await jellyfinApi.getItems({
                parentId: albumId,
                IncludeItemTypes: 'Audio',
                Recursive: true,
                SortBy: 'IndexNumber',
                SortOrder: 'Ascending',
            });

            if (!albumTracks?.Items) return;

            for (const track of albumTracks.Items) {
                await this.queueTrack({
                    id: track.Id,
                    name: track.Name,
                    artist: track.Artists?.[0] || album.AlbumArtist || 'Unknown Artist',
                    album: album.Name,
                    imageUrl: jellyfinApi.getImageUrl(track.Id),
                    durationMillis: (track.RunTimeTicks || 0) / 10000,
                });
            }
        } catch (error) {
            console.error('Failed to queue album:', error);
            throw error;
        }
    }

    // Start processing download queue (public for retry functionality)
    async startProcessing(): Promise<void> {
        if (this.isRunning) return;

        // Ensure permissions and channel are set up
        const hasPermission = await this.requestNotificationPermission();
        if (hasPermission) {
            await this.setupNotificationChannel();
        }

        this.isRunning = true;
        useDownloadStore.getState().setProcessing(true);

        try {
            while (this.isRunning) {
                const store = useDownloadStore.getState();
                const pendingDownloads = store.downloads.filter(d => d.status === 'pending');

                if (pendingDownloads.length === 0) {
                    break;
                }

                // Check wifi-only setting
                const { wifiOnlyDownloads } = useSettingsStore.getState();
                if (wifiOnlyDownloads) {
                    const networkState = await Network.getNetworkStateAsync();
                    if (networkState.type !== Network.NetworkStateType.WIFI) {
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        continue;
                    }
                }

                // Process next download
                const download = pendingDownloads[0];
                await store.setDownloading(download.id);
                await this.downloadTrack(download);

                // Add delay between downloads to prevent UI freeze
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        } finally {
            this.isRunning = false;
            useDownloadStore.getState().setProcessing(false);
            await this.dismissNotification();
        }
    }

    // Download a single track - downloads to internal storage, then copies to SAF if set
    private async downloadTrack(download: Download): Promise<void> {
        const store = useDownloadStore.getState();
        store.setActiveDownload(download.id);

        try {
            // Create safe filename
            const safeFilename = this.cleanFilename(`${download.artist} - ${download.name}`) + '.m4a';

            // Show notification
            await this.showBatchProgressNotification(download.name, 0);

            // Step 1: Create a UNIQUE temp directory per download to avoid any conflicts
            // Use track ID to guarantee uniqueness
            const tempDirName = `dl_${download.id}_${Date.now()}`;
            const cacheDir = new Directory(Paths.cache, tempDirName);

            // Delete if exists, then recreate to guarantee empty
            try {
                if (cacheDir.exists) {
                    cacheDir.delete();
                }
            } catch (e) {
                // Ignore cleanup errors
            }
            cacheDir.create();

            store.updateProgress(download.id, 25, 0);
            await this.showBatchProgressNotification(download.name, 25);

            // Download to unique temp directory
            const result = await File.downloadFileAsync(download.jellyfinUrl, cacheDir);

            if (!result?.exists) {
                throw new Error('Download failed - file not created');
            }

            store.updateProgress(download.id, 75, 0);
            await this.showBatchProgressNotification(download.name, 75);

            // Step 2: Move/copy to final destination
            let finalPath = result.uri;

            // If we have a custom SAF directory, try to copy the file there
            if (this.customDirectory && this.customDirectory.uri.startsWith('content://')) {

                try {
                    // Read the downloaded file content as bytes
                    const fileBytes = await result.bytes();

                    // Try using createFile method on the SAF directory (if available)
                    const safDir = this.customDirectory as any;
                    let finalFile: File;

                    if (typeof safDir.createFile === 'function') {
                        // Pass MIME type as second parameter for proper file extension
                        finalFile = safDir.createFile(safeFilename, 'audio/mp4');
                    } else {
                        finalFile = new File(safDir, safeFilename);
                    }

                    finalFile.write(fileBytes);

                    finalPath = finalFile.uri;

                    // Delete the temp file
                    result.delete();
                } catch (copyError: any) {
                    console.warn('[DownloadService] SAF write failed, using internal storage:', copyError.message || copyError);

                    // Fallback: Move to internal downloads folder
                    const internalDownloads = this.getInternalDownloadDirectory();
                    const fallbackFile = new File(internalDownloads, safeFilename);
                    result.move(fallbackFile);
                    finalPath = fallbackFile.uri;

                }
            } else {
                // No SAF directory set, move to internal downloads folder
                const internalDownloads = this.getInternalDownloadDirectory();
                const finalFile = new File(internalDownloads, safeFilename);

                // Move file to internal downloads with correct name
                result.move(finalFile);
                finalPath = finalFile.uri;
            }

            // Mark as complete
            await store.markCompleted(download.id, finalPath);

            // Add to local library
            await this.addToLocalLibrary(download, finalPath);



            // Clean up the unique temp directory
            try {
                if (cacheDir.exists) {
                    cacheDir.delete();
                }
            } catch (e) {
                // Ignore cleanup errors
            }

        } catch (error: any) {
            console.error('[DownloadService] Download failed:', error);
            await store.markFailed(download.id, error.message || 'Unknown error');
        } finally {
            store.setActiveDownload(null);
        }
    }

    // Add downloaded track to local library
    private async addToLocalLibrary(download: Download, localPath: string): Promise<void> {
        try {

            await DatabaseService.insertTracks([{
                id: `downloaded_${download.id}`,
                name: download.name,
                artist: download.artist,
                album: download.album || 'Downloads',
                genre: undefined,
                imageUrl: download.imageUrl || '',
                durationMillis: download.durationMillis || 0,
                streamUrl: localPath,
                artistId: '',
                isFavorite: false,
                bitrate: undefined,
                codec: undefined,
                container: undefined,
                fileSize: download.fileSize || undefined,
                lyrics: undefined,
                trackNumber: undefined,
            }]);

        } catch (error) {
            console.error('[DownloadService] Failed to add to local library:', error);
        }
    }

    // Cancel current download
    async cancelDownload(downloadId: string): Promise<void> {
        const store = useDownloadStore.getState();
        await store.markCancelled(downloadId);
    }

    // Setup notification channel (Android)
    private async setupNotificationChannel(): Promise<void> {
        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync(NOTIFICATION_ID, {
                name: 'Download Progress',
                importance: Notifications.AndroidImportance.LOW, // Low importance = no sound/vibration
                vibrationPattern: null,
                enableVibrate: false,
                playSound: false,
                lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
            });
        }
    }

    // Show batch progress notification
    private async showBatchProgressNotification(trackName: string, trackProgress: number): Promise<void> {
        try {
            // Calculate overall batch progress
            const store = useDownloadStore.getState();
            const pendingDownloads = store.downloads.filter(d => d.status === 'pending' || d.status === 'downloading');
            const completedDownloads = store.downloads.filter(d => d.status === 'completed');
            const totalInBatch = pendingDownloads.length + completedDownloads.length;
            const completedInBatch = completedDownloads.length;

            // Get group name if available
            const currentDownload = store.downloads.find(d => d.status === 'downloading');
            const groupName = currentDownload?.groupName;

            let title = 'Downloading music';
            let body = '';

            if (groupName && totalInBatch > 1) {
                title = `Downloading ${groupName}`;
                body = `${completedInBatch + 1}/${totalInBatch} songs`;
            } else {
                body = `${trackName} - ${Math.round(trackProgress)}%`;
            }

            await Notifications.scheduleNotificationAsync({
                identifier: NOTIFICATION_ID,
                content: {
                    title,
                    body,
                    data: { type: 'download-progress' },
                    sticky: true,
                    color: '#2b2d42',
                    channelId: NOTIFICATION_ID,
                    priority: Notifications.AndroidNotificationPriority.LOW,
                    vibrate: null,
                },
                trigger: null,
            });
        } catch (e) {

        }
    }

    // Dismiss notification
    private async dismissNotification(): Promise<void> {
        try {
            await Notifications.dismissNotificationAsync(NOTIFICATION_ID);
        } catch (e) {
            // Ignore
        }
    }

    // Request notification permissions
    async requestNotificationPermission(): Promise<boolean> {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        if (existingStatus === 'granted') return true;

        const { status } = await Notifications.requestPermissionsAsync();
        return status === 'granted';
    }
}

export const downloadService = new DownloadService();
