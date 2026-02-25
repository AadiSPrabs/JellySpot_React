import { create } from 'zustand';
import { openDatabaseSync } from 'expo-sqlite';

// Download status types
export type DownloadStatus = 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface Download {
    id: string;
    name: string;
    artist: string;
    album?: string;
    groupId?: string;      // For grouping batch downloads together
    groupName?: string;    // Display name for the group (e.g., "5 Selected Songs")
    status: DownloadStatus;
    progress: number; // 0-100
    localPath?: string;
    jellyfinUrl: string;
    imageUrl?: string;
    durationMillis?: number;
    fileSize?: number;
    downloadedBytes: number;
    errorMessage?: string;
    addedAt: number;
    completedAt?: number;
}

interface DownloadState {
    downloads: Download[];
    activeDownloadId: string | null;
    isProcessing: boolean;

    // Actions
    loadDownloads: () => Promise<void>;
    addToQueue: (download: Omit<Download, 'status' | 'progress' | 'downloadedBytes' | 'addedAt'>) => Promise<void>;
    updateProgress: (id: string, progress: number, downloadedBytes: number) => void;
    setDownloading: (id: string) => Promise<void>;
    markCompleted: (id: string, localPath: string) => Promise<void>;
    markFailed: (id: string, errorMessage: string) => Promise<void>;
    markCancelled: (id: string) => Promise<void>;
    cancelAllPending: () => Promise<void>;
    removeDownload: (id: string) => Promise<void>;
    clearCompleted: () => Promise<void>;
    retryDownload: (id: string) => Promise<void>;
    getNextPending: () => Download | undefined;
    setActiveDownload: (id: string | null) => void;
    setProcessing: (isProcessing: boolean) => void;
}

const db = openDatabaseSync('jellyspot.db');

export const useDownloadStore = create<DownloadState>((set, get) => ({
    downloads: [],
    activeDownloadId: null,
    isProcessing: false,

    loadDownloads: async () => {
        try {
            const result = db.getAllSync<any>(`
                SELECT * FROM downloads ORDER BY added_at DESC
            `);

            const downloads: Download[] = result.map(row => ({
                id: row.id,
                name: row.name,
                artist: row.artist,
                album: row.album,
                groupId: row.group_id,
                groupName: row.group_name,
                status: row.status as DownloadStatus,
                progress: row.progress || 0,
                localPath: row.local_path,
                jellyfinUrl: row.jellyfin_url,
                imageUrl: row.image_url,
                durationMillis: row.duration_millis,
                fileSize: row.file_size,
                downloadedBytes: row.downloaded_bytes || 0,
                errorMessage: row.error_message,
                addedAt: row.added_at,
                completedAt: row.completed_at,
            }));

            set({ downloads });
        } catch (error) {
            console.error('Failed to load downloads:', error);
        }
    },

    addToQueue: async (download) => {
        const now = Date.now();
        const newDownload: Download = {
            ...download,
            status: 'pending',
            progress: 0,
            downloadedBytes: 0,
            addedAt: now,
        };

        try {
            db.runSync(`
                INSERT OR REPLACE INTO downloads 
                (id, name, artist, album, group_id, group_name, status, progress, jellyfin_url, image_url, duration_millis, file_size, downloaded_bytes, added_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                newDownload.id,
                newDownload.name,
                newDownload.artist,
                newDownload.album || null,
                newDownload.groupId || null,
                newDownload.groupName || null,
                newDownload.status,
                newDownload.progress,
                newDownload.jellyfinUrl,
                newDownload.imageUrl || null,
                newDownload.durationMillis || null,
                newDownload.fileSize || null,
                newDownload.downloadedBytes,
                newDownload.addedAt,
            ]);

            set(state => ({
                downloads: [newDownload, ...state.downloads.filter(d => d.id !== newDownload.id)]
            }));
        } catch (error) {
            console.error('Failed to add download:', error);
        }
    },

    updateProgress: (id, progress, downloadedBytes) => {
        set(state => ({
            downloads: state.downloads.map(d =>
                d.id === id
                    ? { ...d, progress, downloadedBytes, status: 'downloading' as DownloadStatus }
                    : d
            )
        }));

        // Update DB periodically (every 10%)
        const download = get().downloads.find(d => d.id === id);
        if (download && Math.floor(progress / 10) !== Math.floor((download.progress || 0) / 10)) {
            db.runSync(`
                UPDATE downloads SET progress = ?, downloaded_bytes = ?, status = 'downloading' WHERE id = ?
            `, [progress, downloadedBytes, id]);
        }
    },

    setDownloading: async (id) => {
        try {
            db.runSync(`
                UPDATE downloads SET status = 'downloading' WHERE id = ?
            `, [id]);

            set(state => ({
                downloads: state.downloads.map(d =>
                    d.id === id
                        ? { ...d, status: 'downloading' as DownloadStatus }
                        : d
                )
            }));
        } catch (error) {
            console.error('Failed to set downloading status:', error);
        }
    },

    markCompleted: async (id, localPath) => {
        const now = Date.now();
        try {
            db.runSync(`
                UPDATE downloads SET status = 'completed', progress = 100, local_path = ?, completed_at = ? WHERE id = ?
            `, [localPath, now, id]);

            set(state => ({
                downloads: state.downloads.map(d =>
                    d.id === id
                        ? { ...d, status: 'completed' as DownloadStatus, progress: 100, localPath, completedAt: now }
                        : d
                ),
                activeDownloadId: state.activeDownloadId === id ? null : state.activeDownloadId
            }));
        } catch (error) {
            console.error('Failed to mark download complete:', error);
        }
    },

    markFailed: async (id, errorMessage) => {
        try {
            db.runSync(`
                UPDATE downloads SET status = 'failed', error_message = ? WHERE id = ?
            `, [errorMessage, id]);

            set(state => ({
                downloads: state.downloads.map(d =>
                    d.id === id
                        ? { ...d, status: 'failed' as DownloadStatus, errorMessage }
                        : d
                ),
                activeDownloadId: state.activeDownloadId === id ? null : state.activeDownloadId
            }));
        } catch (error) {
            console.error('Failed to mark download failed:', error);
        }
    },

    markCancelled: async (id) => {
        try {
            db.runSync(`
                UPDATE downloads SET status = 'cancelled' WHERE id = ?
            `, [id]);

            set(state => ({
                downloads: state.downloads.map(d =>
                    d.id === id ? { ...d, status: 'cancelled' as DownloadStatus } : d
                ),
                activeDownloadId: state.activeDownloadId === id ? null : state.activeDownloadId
            }));
        } catch (error) {
            console.error('Failed to mark download cancelled:', error);
        }
    },

    cancelAllPending: async () => {
        try {
            db.runSync(`
                UPDATE downloads SET status = 'cancelled' WHERE status IN ('pending', 'downloading')
            `);

            set(state => ({
                downloads: state.downloads.map(d =>
                    d.status === 'pending' || d.status === 'downloading'
                        ? { ...d, status: 'cancelled' as DownloadStatus }
                        : d
                ),
                activeDownloadId: null,
                isProcessing: false
            }));
        } catch (error) {
            console.error('Failed to cancel all downloads:', error);
        }
    },

    removeDownload: async (id) => {
        try {
            db.runSync('DELETE FROM downloads WHERE id = ?', [id]);
            set(state => ({
                downloads: state.downloads.filter(d => d.id !== id)
            }));
        } catch (error) {
            console.error('Failed to remove download:', error);
        }
    },

    clearCompleted: async () => {
        try {
            db.runSync("DELETE FROM downloads WHERE status IN ('completed', 'failed', 'cancelled')");
            set(state => ({
                downloads: state.downloads.filter(d => !['completed', 'failed', 'cancelled'].includes(d.status))
            }));
        } catch (error) {
            console.error('Failed to clear completed/failed:', error);
        }
    },

    retryDownload: async (id) => {
        try {
            db.runSync(`
                UPDATE downloads SET status = 'pending', progress = 0, downloaded_bytes = 0, error_message = NULL WHERE id = ?
            `, [id]);

            set(state => ({
                downloads: state.downloads.map(d =>
                    d.id === id
                        ? { ...d, status: 'pending' as DownloadStatus, progress: 0, downloadedBytes: 0, errorMessage: undefined }
                        : d
                )
            }));
        } catch (error) {
            console.error('Failed to retry download:', error);
        }
    },

    getNextPending: () => {
        return get().downloads.find(d => d.status === 'pending');
    },

    setActiveDownload: (id) => {
        set({ activeDownloadId: id });
    },

    setProcessing: (isProcessing) => {
        set({ isProcessing });
    },
}));
