import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PermissionsAndroid, Platform } from 'react-native';
import { getTracksAsync, getTrackMetadataAsync, type Track as MusicTrack } from '@nodefinity/react-native-music-library';
import { DatabaseService } from '../services/DatabaseService';
import { Directory, File, Paths } from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Track } from '../types/track';

// Re-export Track for backward compatibility
export type { Track } from '../types/track';

interface LocalPlaylist {
    id: string;
    name: string;
    trackIds: string[];
    createdAt: number;
}

interface FolderInfo {
    path: string;       // Full folder path
    displayName: string; // Short display name (last folder in path)
    trackCount: number;  // Number of tracks in this folder
}

export interface LocalLibraryState {
    tracks: Track[];           // All scanned tracks (isFavorite is stored per track)
    isScanning: boolean;
    isEnriching: boolean;
    enrichProgress: number;
    scanProgress: number;
    playlists: LocalPlaylist[];
    permissionGranted: boolean;

    // Folder filtering (whitelist)
    availableFolders: FolderInfo[];     // All folders found during scan
    selectedFolderPaths: string[];       // Whitelisted folder paths (empty = all selected)

    requestPermissions: () => Promise<boolean>;
    refreshLibrary: (force?: boolean) => Promise<void>;  // Full rescan
    checkForNewTracks: () => Promise<boolean>;  // Quick check for new tracks, returns true if new tracks found
    enrichMetadata: () => Promise<void>;

    // Folder selection
    toggleFolderSelection: (folderPath: string) => void;
    selectAllFolders: () => void;
    deselectAllFolders: () => void;
    getFilteredTracks: () => Track[];  // Returns tracks from selected folders only

    // Playlist logic
    createPlaylist: (name: string) => LocalPlaylist;
    deletePlaylist: (id: string) => void;
    renamePlaylist: (id: string, newName: string) => void;
    addToPlaylist: (playlistId: string, trackId: string) => void;
    removeFromPlaylist: (playlistId: string, trackId: string) => void;
    getPlaylistTracks: (playlistId: string) => Track[];

    // Favorites logic
    toggleFavorite: (trackId: string) => void;
    isFavorite: (trackId: string) => boolean;
    getFavoriteTracks: () => Track[];
    deleteTrack: (track: Track) => Promise<boolean>;
    loadTracksFromDb: () => Promise<void>;
}

// Generate a random ID
const generateId = () => Math.random().toString(36).substring(2, 15);

// Helper to extract folder path from file URL
// e.g., "file:///storage/emulated/0/Music/Artist/song.mp3" -> "/storage/emulated/0/Music/Artist"
const getFolderPath = (url: string): string => {
    try {
        // Remove file:// prefix and decode
        let path = url.replace(/^file:\/\//, '');
        path = decodeURIComponent(path);
        // Get directory by removing filename
        const lastSlash = path.lastIndexOf('/');
        return lastSlash > 0 ? path.substring(0, lastSlash) : path;
    } catch {
        return url;
    }
};

export const useLocalLibraryStore = create<LocalLibraryState>()(
    persist(
        (set, get) => ({
            tracks: [],
            isScanning: false,
            isEnriching: false,
            enrichProgress: 0,
            scanProgress: 0,
            playlists: [],
            permissionGranted: false,
            availableFolders: [],
            selectedFolderPaths: [], // Empty = all folders selected

            loadTracksFromDb: async () => {
                try {
                    const dbTracks = await DatabaseService.getAllTracks();
                    set({ tracks: dbTracks as Track[] });
                } catch (error) {
                    console.error("Failed to load tracks from DB:", error);
                }
            },

            requestPermissions: async () => {
                if (Platform.OS === 'android') {
                    try {
                        // For Android 13+ (API 33+), use READ_MEDIA_AUDIO
                        // For older versions, use READ_EXTERNAL_STORAGE
                        const permission = Platform.Version >= 33
                            ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO
                            : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;

                        const result = await PermissionsAndroid.request(permission, {
                            title: 'Music Library Access',
                            message: 'This app needs access to your music library to play local audio files.',
                            buttonNeutral: 'Ask Me Later',
                            buttonNegative: 'Cancel',
                            buttonPositive: 'OK',
                        });

                        const granted = result === PermissionsAndroid.RESULTS.GRANTED;
                        set({ permissionGranted: granted });
                        return granted;
                    } catch (err) {
                        console.error('Permission request failed:', err);
                        return false;
                    }
                }
                // iOS - not yet supported by the library
                return false;
            },

            // Helper to extract folder path from file URL
            // e.g., "file:///storage/emulated/0/Music/Artist/song.mp3" -> "/storage/emulated/0/Music/Artist"


            refreshLibrary: async () => {
                const { permissionGranted, selectedFolderPaths, tracks: existingTracks } = get();

                if (!permissionGranted) {
                    const granted = await get().requestPermissions();
                    if (!granted) return;
                }

                set({ isScanning: true, scanProgress: 0 });

                // Build a set of existing favorite track IDs from current tracks
                const favoriteIds = new Set(existingTracks.filter(t => t.isFavorite).map(t => t.id));

                try {
                    // Get all tracks (the library returns them with full metadata!)
                    const result = await getTracksAsync({
                        first: 10000,
                    });


                    // Map the library's Track type to our Track type
                    const newTracks: Track[] = result.items.map((musicTrack: MusicTrack) => {
                        // The library's artwork field might be empty on Android
                        // This is a known limitation - MediaStore doesn't store embedded artwork
                        let artworkUrl = musicTrack.artwork || '';
                        const hasArtwork = Boolean(artworkUrl);

                        return {
                            id: musicTrack.id,
                            name: musicTrack.title || 'Unknown Track',
                            artist: musicTrack.artist || 'Unknown Artist',
                            album: musicTrack.album || 'Unknown Album',
                            genre: (musicTrack as any).genre || undefined,
                            imageUrl: artworkUrl,
                            durationMillis: (musicTrack.duration || 0) * 1000,
                            streamUrl: musicTrack.url,
                            artistId: `local_artist_${(musicTrack.artist || 'Unknown Artist').toLowerCase().replace(/\s+/g, '_')}`,
                            isFavorite: favoriteIds.has(musicTrack.id), // Preserve favorites from existing tracks
                            metadataEnriched: hasArtwork,
                            fileSize: (musicTrack as any).fileSize || undefined, // Actual file size from system
                            trackNumber: (musicTrack as any).track || (musicTrack as any).trackNumber || undefined,
                        };
                    });

                    // Extract unique folder paths from all tracks
                    const folderMap = new Map<string, number>();
                    newTracks.forEach(track => {
                        const folderPath = getFolderPath(track.streamUrl);
                        folderMap.set(folderPath, (folderMap.get(folderPath) || 0) + 1);
                    });

                    // Create FolderInfo array
                    const folders: FolderInfo[] = Array.from(folderMap.entries()).map(([path, count]) => ({
                        path,
                        displayName: path.split('/').pop() || path,
                        trackCount: count,
                    })).sort((a, b) => a.displayName.localeCompare(b.displayName));

                    // If no folders are selected yet (first scan), select all
                    const newSelectedPaths = selectedFolderPaths.length === 0
                        ? folders.map(f => f.path)
                        : selectedFolderPaths.filter(p => folders.some(f => f.path === p)); // Remove paths that no longer exist

                    set({
                        tracks: newTracks,
                        availableFolders: folders,
                        selectedFolderPaths: newSelectedPaths,
                        isScanning: false,
                        scanProgress: 100
                    });

                    // Sync to Database (Background)
                    // We clear old tracks and insert new ones to ensure partial scans don't result in duplicates or stale data
                    // This is fast enough (< 1s for 5k tracks) to do on every full refresh
                    Promise.resolve().then(async () => {
                        try {
                            await DatabaseService.clearAllTracks();
                            await DatabaseService.insertTracks(newTracks);

                        } catch (dbErr) {
                            console.error("Database sync failed:", dbErr);
                        }
                    });

                    // Automatically enrich with technical metadata in the background
                    // This is async and won't block the UI
                    get().enrichMetadata();

                } catch (error) {
                    console.error("Failed to scan local media:", error);
                    set({ isScanning: false, scanProgress: 0 });
                }
            },

            // Quick check for new tracks - only rescans if count increased in whitelisted folders
            checkForNewTracks: async () => {
                const { tracks, permissionGranted, selectedFolderPaths, availableFolders } = get();

                // Skip if no permission or no cached tracks (first run needs full scan)
                if (!permissionGranted || tracks.length === 0) {
                    return false;
                }

                try {
                    // Get quick count of all tracks from device
                    const result = await getTracksAsync({ first: 10000 });


                    // Count tracks only in whitelisted folders
                    let newTrackCount = 0;
                    result.items.forEach((track: MusicTrack) => {
                        const folderPath = getFolderPath(track.url);
                        // If no folders selected yet, count all; otherwise only whitelisted
                        if (selectedFolderPaths.length === 0 || selectedFolderPaths.includes(folderPath)) {
                            newTrackCount++;
                        }
                    });

                    // Count current cached tracks in whitelisted folders
                    const cachedCount = get().getFilteredTracks().length;

                    // If new tracks found, trigger full scan
                    if (newTrackCount > cachedCount) {

                        await get().refreshLibrary();
                        return true;
                    }


                    return false;
                } catch (error) {
                    console.error("Failed to check for new tracks:", error);
                    return false;
                }
            },

            enrichMetadata: async () => {
                const { tracks } = get();
                if (tracks.length === 0) return;

                set({ isEnriching: true, enrichProgress: 0 });

                try {
                    const enrichedTracks: Track[] = [];
                    const total = tracks.length;

                    for (let i = 0; i < tracks.length; i++) {
                        const track = tracks[i];

                        try {
                            // Fetch detailed metadata including audio header info and artwork
                            const metadata = await getTrackMetadataAsync(track.id) as any;

                            // Extract technical details from the metadata
                            // The library returns bitrate and format directly on the metadata object
                            const bitrate = metadata?.bitrate ? metadata.bitrate * 1000 : undefined; // Convert kbps to bps
                            const codec = metadata?.format || undefined;
                            const container = track.streamUrl.split('.').pop()?.toUpperCase() || undefined;
                            // Extract embedded lyrics
                            const lyrics = metadata?.lyrics || undefined;
                            // Extract artwork - prefer metadata artwork (file path) over existing
                            const artwork = metadata?.artwork || track.imageUrl || '';

                            enrichedTracks.push({
                                ...track,
                                bitrate,
                                codec,
                                container,
                                lyrics,
                                imageUrl: artwork,
                                metadataEnriched: true,
                            });
                        } catch (error) {
                            // If metadata fetch fails for this track, keep original data
                            enrichedTracks.push({
                                ...track,
                                container: track.streamUrl.split('.').pop()?.toUpperCase() || undefined,
                            });
                        }

                        // Update progress
                        set({ enrichProgress: Math.round(((i + 1) / total) * 100) });
                    }

                    set({ tracks: enrichedTracks, isEnriching: false, enrichProgress: 100 });
                } catch (error) {
                    console.error('Failed to enrich metadata:', error);
                    set({ isEnriching: false, enrichProgress: 0 });
                }
            },

            createPlaylist: (name: string) => {
                // Create in DB (fire and forget for speed, store is just cache now)
                const id = generateId();
                const newPlaylist: LocalPlaylist = {
                    id,
                    name,
                    trackIds: [],
                    createdAt: Date.now(),
                };
                // Update local cache for reactivity
                set(state => ({ playlists: [...state.playlists, newPlaylist] }));
                // Sync to DB async
                DatabaseService.createPlaylist(name).catch(console.error);
                return newPlaylist;
            },

            deletePlaylist: (id: string) => {
                // Update local cache
                set(state => ({
                    playlists: state.playlists.filter(p => p.id !== id)
                }));
                // Sync to DB async
                DatabaseService.deletePlaylist(id).catch(console.error);
            },

            renamePlaylist: (id: string, newName: string) => {
                // Update local cache
                set(state => ({
                    playlists: state.playlists.map(p =>
                        p.id === id ? { ...p, name: newName } : p
                    )
                }));
                // Sync to DB async
                DatabaseService.renamePlaylist(id, newName).catch(console.error);
            },

            addToPlaylist: (playlistId: string, trackId: string) => {
                // Update local cache
                set(state => ({
                    playlists: state.playlists.map(p =>
                        p.id === playlistId && !(p.trackIds || []).includes(trackId)
                            ? { ...p, trackIds: [...(p.trackIds || []), trackId] }
                            : p
                    )
                }));
                // Sync to DB async
                DatabaseService.addTrackToPlaylist(playlistId, trackId).catch(console.error);
            },

            removeFromPlaylist: (playlistId: string, trackId: string) => {
                // Update local cache
                set(state => ({
                    playlists: state.playlists.map(p =>
                        p.id === playlistId
                            ? { ...p, trackIds: (p.trackIds || []).filter(id => id !== trackId) }
                            : p
                    )
                }));
                // Sync to DB async
                DatabaseService.removeTrackFromPlaylist(playlistId, trackId).catch(console.error);
            },

            getPlaylistTracks: (playlistId: string) => {
                // Use local cache for sync access (reactivity)
                // For DB-backed data, use DatabaseService.getPlaylistTracks() directly in components
                const { playlists, tracks } = get();
                const playlist = playlists.find(p => p.id === playlistId);
                if (!playlist) return [];
                return (playlist.trackIds || [])
                    .map(id => tracks.find(t => t.id === id))
                    .filter((t): t is Track => t !== undefined);
            },

            toggleFavorite: (trackId: string) => {
                // Get current state
                const track = get().tracks.find(t => t.id === trackId);
                const newFavState = !(track?.isFavorite || false);

                // Update local cache for instant UI feedback
                set(state => ({
                    tracks: state.tracks.map(t =>
                        t.id === trackId ? { ...t, isFavorite: newFavState } : t
                    )
                }));

                // Sync to DB async (source of truth)
                DatabaseService.toggleFavorite(trackId, newFavState).catch(console.error);
            },

            isFavorite: (trackId: string) => {
                // Check track object directly (DB is synced)
                const track = get().tracks.find(t => t.id === trackId);
                return track?.isFavorite || false;
            },

            getFavoriteTracks: () => {
                // Filter from tracks directly (isFavorite is synced from DB)
                const filtered = get().getFilteredTracks();
                return filtered.filter(t => t.isFavorite === true);
            },

            // Folder selection methods
            toggleFolderSelection: (folderPath: string) => {
                set(state => {
                    const isSelected = state.selectedFolderPaths.includes(folderPath);
                    return {
                        selectedFolderPaths: isSelected
                            ? state.selectedFolderPaths.filter(p => p !== folderPath)
                            : [...state.selectedFolderPaths, folderPath]
                    };
                });
            },

            selectAllFolders: () => {
                set(state => ({
                    selectedFolderPaths: state.availableFolders.map(f => f.path)
                }));
            },

            deselectAllFolders: () => {
                set({ selectedFolderPaths: [] });
            },

            getFilteredTracks: () => {
                const { tracks, selectedFolderPaths, availableFolders } = get();

                // If no folders are selected, return empty (whitelist approach)
                // But if availableFolders is empty (not scanned yet), return all tracks
                if (availableFolders.length === 0) return tracks;
                if (selectedFolderPaths.length === 0) return [];


                return tracks.filter(track => {
                    const folderPath = getFolderPath(track.streamUrl);
                    return selectedFolderPaths.includes(folderPath);
                });
            },

            deleteTrack: async (track: Track) => {
                try {
                    let deleted = false;

                    // 1. Try deleting via MediaLibrary (for shared storage/scanned files)
                    // Note: deleteAssetsAsync handles the system permission dialog internally
                    // Android's Scoped Storage requires per-file consent for files not created by the app
                    try {
                        const result = await MediaLibrary.deleteAssetsAsync([track.id]);
                        deleted = result;
                    } catch (mediaLibErr) {
                        // MediaLibrary delete failed, try FileSystem
                        // 2. Fallback to FileSystem (for app-private files/downloads)
                        try {
                            let fileUri = track.streamUrl;
                            if (!fileUri.startsWith('file://')) {
                                if (fileUri.startsWith('/')) {
                                    fileUri = 'file://' + fileUri;
                                }
                            }
                            await FileSystemLegacy.deleteAsync(fileUri, { idempotent: true });
                            deleted = true;
                        } catch (fsErr) {
                            console.error("FileSystem delete also failed:", fsErr);
                            deleted = false;
                        }
                    }

                    if (deleted) {
                        // 3. Remove from SQLite
                        await DatabaseService.deleteTrack(track.id);

                        // 4. Update Store State
                        set(state => ({
                            tracks: state.tracks.filter(t => t.id !== track.id),
                            playlists: state.playlists.map(p => ({
                                ...p,
                                trackIds: (p.trackIds || []).filter(id => id !== track.id)
                            }))
                        }));
                        return true;
                    }
                    return false;
                } catch (error) {
                    console.error("Delete track failed:", error);
                    return false;
                }
            }
        }),
        {
            name: 'local-library-storage',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                playlists: state.playlists,
                permissionGranted: state.permissionGranted,
                selectedFolderPaths: state.selectedFolderPaths,
                availableFolders: state.availableFolders,
            }),
        }
    )
);
