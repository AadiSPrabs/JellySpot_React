import { create } from 'zustand';
import { audioService } from '../services/AudioService';
import { useAuthStore } from './authStore';
import { useSettingsStore } from './settingsStore';
// Hybrid player removed, reverting to pure AudioService
import { jellyfinApi } from '../api/jellyfin';
import { DatabaseService } from '../services/DatabaseService';
import * as Network from 'expo-network';
import { AppState } from 'react-native';
import { Track } from '../types/track';

// Re-export Track for consumers already importing from playerStore
export type { Track } from '../types/track';


interface PlayerState {
    currentTrack: Track | null;
    queue: Track[];
    originalQueue: Track[];
    isPlaying: boolean;
    positionMillis: number;
    durationMillis: number;
    shuffleMode: boolean;
    repeatMode: 'off' | 'all' | 'one';
    init: () => Promise<void>;
    playTrack: (track: Track) => Promise<void>;
    togglePlayPause: () => void;
    seek: (position: number) => Promise<void>;
    playNext: () => Promise<void>;
    playPrevious: () => Promise<void>;
    setQueue: (tracks: Track[], startIndex?: number) => void;
    setRawQueue: (rawTracks: any[], dataSource: string, itemId: string, itemType: string) => Track[];
    addToQueueNext: (track: Track) => void;
    addToQueueEnd: (track: Track) => void;
    toggleShuffle: () => void;
    toggleRepeat: () => void;
    updateTrackFavorite: (trackId: string, isFavorite: boolean) => void;
    reset: () => void;
    sleepTimerTarget: number | 'endOfTrack' | null;
    setSleepTimer: (minutes: number | 'endOfTrack' | null) => void;
    playbackError: string | null;
    clearPlaybackError: () => void;
    // Queue manipulation
    reorderQueue: (fromIndex: number, toIndex: number) => void;
    removeFromQueue: (trackId: string) => void;
    clearQueue: () => void;
    toggleCurrentTrackFavorite: () => Promise<void>;
    isPlayerExpanded: boolean;
    setPlayerExpanded: (expanded: boolean) => void;
    heroCardVisible: boolean;
    setHeroCardVisible: (visible: boolean) => void;
    isQueueVisible: boolean;
    setQueueVisible: (visible: boolean) => void;
}

// Network state cache for battery optimization (30-second TTL)
let cachedNetworkState: {
    quality: 'lossless' | 'low';
    timestamp: number;
} | null = null;
const NETWORK_CACHE_TTL = 30000; // 30 seconds

// Helper to get effective audio quality based on auto mode and network
const getEffectiveAudioQuality = async (): Promise<'lossless' | 'high' | 'low'> => {
    const { audioQuality } = useSettingsStore.getState();

    if (audioQuality !== 'auto') {
        return audioQuality;
    }

    // Auto mode: check cache first to avoid repeated network calls
    const now = Date.now();
    if (cachedNetworkState && (now - cachedNetworkState.timestamp) < NETWORK_CACHE_TTL) {
        return cachedNetworkState.quality;
    }

    // Cache expired or doesn't exist - fetch network state
    try {
        const networkState = await Network.getNetworkStateAsync();
        let quality: 'lossless' | 'low';

        if (networkState.type === Network.NetworkStateType.WIFI) {
            quality = 'lossless'; // WiFi → lossless (direct play)
        } else if (networkState.type === Network.NetworkStateType.CELLULAR) {
            quality = 'low'; // Cellular → low quality (128kbps)
        } else {
            quality = 'lossless'; // Unknown/no connection - default to lossless
        }

        // Cache the result
        cachedNetworkState = { quality, timestamp: now };
        return quality;
    } catch (error) {
        console.warn('Failed to detect network type:', error);
        return 'lossless'; // Fallback to lossless
    }
};

const getStreamUrl = async (track: Track): Promise<string> => {
    if (track.streamUrl && track.streamUrl.length > 0) {
        return track.streamUrl;
    }
    const { serverUrl, user } = useAuthStore.getState();
    const effectiveQuality = await getEffectiveAudioQuality();

    if (effectiveQuality === 'lossless') {
        // Direct stream - no transcoding
        return `${serverUrl}/Audio/${track.id}/stream?api_key=${user?.token}&static=true`;
    } else {
        // Use universal endpoint for transcoding (proper Jellyfin API)
        const bitrate = effectiveQuality === 'high' ? 320000 : 128000;
        const params = new URLSearchParams({
            api_key: user?.token || '',
            Container: 'mp3',
            AudioCodec: 'mp3',
            MaxStreamingBitrate: bitrate.toString(),
            TranscodingContainer: 'mp3',
            TranscodingProtocol: 'http',
        });
        return `${serverUrl}/Audio/${track.id}/universal?${params.toString()}`;
    }
};

// Queue Persistence Debounce (saves every 2 seconds max while changes are happening)
let persistTimer: NodeJS.Timeout | null = null;
// JSON replacer that strips heavy fields like lyrics to keep payload small
const HEAVY_FIELDS = new Set(['lyrics']);
const lightweightReplacer = (key: string, value: any) => HEAVY_FIELDS.has(key) ? undefined : value;

const persistQueueState = () => {
    if (persistTimer) {
        clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(() => {
        const state = usePlayerStore.getState();

        let persistentQueue = state.queue;
        let persistentOriginal = state.originalQueue;

        // Limit size for safety
        if (state.queue.length > 500) {
            const currentIndex = state.currentTrack
                ? state.queue.findIndex(t => t.id === state.currentTrack?.id)
                : 0;
            const start = Math.max(0, currentIndex - 100);
            const end = Math.min(state.queue.length, currentIndex + 400);
            persistentQueue = state.queue.slice(start, end);
        }

        if (state.originalQueue.length > 300) {
            persistentOriginal = state.originalQueue.slice(0, 300);
        }

        // Use JSON replacer to strip heavy fields in one pass (no intermediate objects)
        const payload = JSON.stringify({
            currentTrack: state.currentTrack,
            queue: persistentQueue,
            originalQueue: persistentOriginal,
            shuffleMode: state.shuffleMode,
            repeatMode: state.repeatMode,
            positionMillis: state.positionMillis,
        }, lightweightReplacer);

        // Parse back for the DB service (it expects an object)
        DatabaseService.saveQueueState(JSON.parse(payload));
        persistTimer = null;
    }, 2000); // 2s debounce
};
// Guard against duplicate init() calls (e.g., HMR)
let isInitialized = false;
let listenerCleanups: (() => void)[] = [];

export const usePlayerStore = create<PlayerState>((set, get) => ({
    currentTrack: null,
    isPlaying: false,
    queue: [],
    originalQueue: [],
    positionMillis: 0,
    durationMillis: 0,
    shuffleMode: false,
    repeatMode: 'off',
    sleepTimerTarget: null,
    playbackError: null,
    clearPlaybackError: () => set({ playbackError: null }),
    isPlayerExpanded: false,
    setPlayerExpanded: (expanded: boolean) => set({ isPlayerExpanded: expanded }),
    heroCardVisible: false,
    setHeroCardVisible: (visible: boolean) => set({ heroCardVisible: visible }),
    isQueueVisible: false,
    setQueueVisible: (visible: boolean) => set({ isQueueVisible: visible }),

    // Initialize listeners
    init: async () => {
        // Clean up previous listeners if re-initializing
        if (isInitialized) {
            listenerCleanups.forEach(cleanup => cleanup());
            listenerCleanups = [];
        }
        isInitialized = true;

        const { playNext } = get();
        // Import TrackPlayer to set up listeners
        const TrackPlayer = require('react-native-track-player').default;
        const { Event } = require('react-native-track-player');

        const sub1 = TrackPlayer.addEventListener(Event.PlaybackError, (error: any) => {
            console.warn('[PlayerStore] Playback Error:', error);
            set({ playbackError: error.message || 'Playback failed' });
        });
        listenerCleanups.push(() => sub1.remove());

        const sub2 = TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
            // Fallback: Queue ended, playing next
            playNext();
        });
        listenerCleanups.push(() => sub2.remove());

        const sub3 = TrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (event: any) => {
            const { queue, repeatMode, currentTrack: previousTrack } = get();

            if (!event.track) return;

            // Handle 'endOfTrack' sleep timer
            if (get().sleepTimerTarget === 'endOfTrack') {
                set({ sleepTimerTarget: null, isPlaying: false });
                audioService.pause();
            }

            // INSTANT RESPONSE: Update current track status in store first
            const newTrack = queue.find(t => t.id === event.track.id || t.streamUrl === event.track.url);
            if (newTrack) {
                set({
                    currentTrack: newTrack,
                    positionMillis: 0,
                    durationMillis: newTrack.durationMillis || 0
                });

                // Record play for the PREVIOUS track now that we know we moved on
                if (previousTrack && previousTrack.id !== newTrack.id) {
                    // Fire and forget recording to not block track change
                    const source = previousTrack.streamUrl?.startsWith('file://') ? 'local' : 'jellyfin';
                    DatabaseService.recordPlay(previousTrack, source, 0, false, previousTrack.playlistId).catch(() => { });
                }
            }

            // BACKGROUND TASK: Determine and buffer NEXT track
            // This happens in a short timeout to ensure the UI update above is processed first
            setTimeout(async () => {
                if (!newTrack) return;

                const { queue: currentQueue, repeatMode: currentRepeat } = get();
                let nextTrack: Track | undefined;
                const currentIndex = currentQueue.findIndex(t => t.id === newTrack.id);

                if (currentRepeat === 'one') {
                    nextTrack = newTrack;
                } else if (currentIndex < currentQueue.length - 1) {
                    nextTrack = currentQueue[currentIndex + 1];
                } else if (currentRepeat === 'all') {
                    nextTrack = currentQueue[0];
                }

                if (nextTrack) {
                    try {
                        const nativeQueue = await TrackPlayer.getQueue();
                        const currentNativeIndex = await TrackPlayer.getActiveTrackIndex();
                        const nextNativeTrack = nativeQueue[currentNativeIndex + 1];

                        if (!nextNativeTrack || nextNativeTrack.id !== nextTrack.id) {
                            const nextUrl = await getStreamUrl(nextTrack);
                            if (nextUrl) {
                                await audioService.addToQueue({
                                    id: nextTrack.id,
                                    url: nextUrl,
                                    title: nextTrack.name,
                                    artist: nextTrack.artist,
                                    artwork: nextTrack.imageUrl && !nextTrack.imageUrl.startsWith('data:') ? nextTrack.imageUrl : undefined,
                                    duration: (nextTrack.durationMillis || 0) / 1000
                                });
                            }
                        }
                    } catch (e) {
                        // Silent fail for background buffering
                    }
                }
            }, 50);
        });
        listenerCleanups.push(() => sub3.remove());

        const sub4 = TrackPlayer.addEventListener(Event.PlaybackState, (event: any) => {
            const isPlayingState = event.state === 'playing' || event.state === 'buffering' || event.state === 'loading';
            set((state) => (state.isPlaying !== isPlayingState ? { isPlaying: isPlayingState } : {}));
        });
        listenerCleanups.push(() => sub4.remove());

        // Progress update throttling for battery optimization
        let lastProgressUpdate = 0;
        const BACKGROUND_THROTTLE_MS = 5000; // Only update every 5 seconds in background

        const sub5 = TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, async (event: any) => {
            const { sleepTimerTarget, durationMillis: existingDuration } = get();

            // Check Sleep Timer (always check, even when throttled)
            if (sleepTimerTarget && typeof sleepTimerTarget === 'number' && Date.now() > sleepTimerTarget) {
                set({ isPlaying: false, sleepTimerTarget: null });
                audioService.pause();
            }

            // Throttle updates when app is in background to save battery
            const now = Date.now();
            const isBackground = AppState.currentState !== 'active';
            if (isBackground && (now - lastProgressUpdate) < BACKGROUND_THROTTLE_MS) {
                return; // Skip this update
            }
            lastProgressUpdate = now;
            // Only update duration if TrackPlayer reports a valid one (> 0)
            // Transcoded streams may not report duration correctly
            const newDuration = event.duration > 0 ? event.duration * 1000 : existingDuration;
            const positionMs = event.position * 1000;
            const durationMs = newDuration;

            set({
                positionMillis: positionMs,
                durationMillis: durationMs
            });
        });
        listenerCleanups.push(() => sub5.remove());

        // Hydrate state from database first (INSTANT - <50ms)
        // Then validate/sync with native player in background
        try {
            // INSTANT PATH: Load persisted queue from SQLite
            const savedState = await DatabaseService.getQueueState();

            if (savedState && savedState.currentTrack) {

                set({
                    currentTrack: savedState.currentTrack,
                    queue: savedState.queue,
                    originalQueue: savedState.originalQueue,
                    shuffleMode: savedState.shuffleMode,
                    repeatMode: savedState.repeatMode,
                    positionMillis: savedState.positionMillis,
                });
            }

            // Setup audio service
            await audioService.setup();

            // Get native playback state for isPlaying status
            const playbackState = await TrackPlayer.getPlaybackState();
            set({ isPlaying: playbackState.state === 'playing' || playbackState.state === 'buffering' });

            // BACKGROUND VALIDATION: Sync native position (deferred)
            setTimeout(async () => {
                try {
                    const position = await TrackPlayer.getProgress();
                    if (position && position.position > 0) {
                        set({
                            positionMillis: position.position * 1000,
                            durationMillis: position.duration * 1000
                        });
                    }

                    // If no saved state, fall back to native queue
                    if (!savedState?.currentTrack) {
                        const currentNativeIndex = await TrackPlayer.getActiveTrackIndex();
                        if (currentNativeIndex !== undefined) {
                            const currentTrackObj = await TrackPlayer.getTrack(currentNativeIndex);
                            const nativeQueue = await TrackPlayer.getQueue();

                            if (currentTrackObj) {
                                const mappedTrack: Track = {
                                    id: currentTrackObj.id || 'unknown',
                                    artist: currentTrackObj.artist || 'Unknown',
                                    name: currentTrackObj.title || 'Unknown',
                                    imageUrl: currentTrackObj.artwork as string,
                                    streamUrl: currentTrackObj.url as string,
                                    durationMillis: (currentTrackObj.duration || 0) * 1000,
                                    artistId: 'unknown',
                                    album: '',
                                };

                                const mappedQueue: Track[] = (nativeQueue || []).map((t: any) => ({
                                    id: t.id,
                                    name: t.title,
                                    artist: t.artist,
                                    imageUrl: t.artwork,
                                    streamUrl: t.url,
                                    durationMillis: (t.duration || 0) * 1000,
                                    artistId: 'unknown',
                                    album: '',
                                }));

                                set({
                                    currentTrack: mappedTrack,
                                    queue: mappedQueue,
                                    originalQueue: mappedQueue
                                });
                            }
                        }
                    }
                } catch (e) {
                    // Background sync error - expected in some cases
                }
            }, 100); // Very short delay - just to not block initial render

        } catch (e) {
            // Sync error - will reattempt on next initialization
        }
    },

    setSleepTimer: (minutes: number | 'endOfTrack' | null) => {
        if (minutes === null) {
            set({ sleepTimerTarget: null });
        } else if (minutes === 'endOfTrack') {
            set({ sleepTimerTarget: 'endOfTrack' });
        } else {
            set({ sleepTimerTarget: Date.now() + minutes * 60 * 1000 });
        }
    },

    playTrack: async (track) => {
        set({ playbackError: null }); // Clear previous errors

        // INSTANT UI UPDATE: Update store BEFORE native calls so UI reflects immediately
        const { queue } = get();
        let currentIndex = queue.findIndex(t => t.id === track.id);
        if (currentIndex === -1) {
            set({ queue: [track], originalQueue: [track], currentTrack: track, isPlaying: true, positionMillis: 0, durationMillis: track.durationMillis || 0 });
            currentIndex = 0;
        } else {
            set({ currentTrack: track, isPlaying: true, positionMillis: 0, durationMillis: track.durationMillis || 0 });
        }

        // BACKGROUND: All native player operations happen after UI is updated
        try {
            const streamUrl = await getStreamUrl(track);
            const artworkUrl = track.imageUrl && !track.imageUrl.startsWith('data:')
                ? track.imageUrl
                : undefined;

            await audioService.play({
                id: track.id,
                url: streamUrl,
                title: track.name,
                artist: track.artist,
                artwork: artworkUrl,
                duration: (track.durationMillis || 0) / 1000
            });

            // Pre-fetch next track in background
            const { queue: currentQueue, repeatMode } = get();
            const idx = currentQueue.findIndex(t => t.id === track.id);
            let nextTrack: Track | undefined;
            if (repeatMode === 'one') {
                nextTrack = track;
            } else if (idx < currentQueue.length - 1) {
                nextTrack = currentQueue[idx + 1];
            } else if (repeatMode === 'all') {
                nextTrack = currentQueue[0];
            }

            if (nextTrack) {
                const nt = nextTrack;
                setTimeout(async () => {
                    try {
                        const nextUrl = await getStreamUrl(nt);
                        await audioService.addToQueue({
                            id: nt.id,
                            url: nextUrl,
                            title: nt.name,
                            artist: nt.artist,
                            artwork: nt.imageUrl && !nt.imageUrl.startsWith('data:') ? nt.imageUrl : undefined,
                            duration: (nt.durationMillis || 0) / 1000
                        });
                    } catch (e) { /* silent */ }
                }, 200);
            }

            persistQueueState();
        } catch (error: any) {
            console.error('Failed to play track:', error);
            set({ playbackError: error.message || 'Failed to start playback', isPlaying: false });
        }
    },

    togglePlayPause: async () => {
        const { isPlaying, currentTrack, playTrack } = get();

        if (isPlaying) {
            set({ isPlaying: false });
            audioService.pause();
        } else {
            // Check if native player has a track loaded
            const activeIndex = await audioService.getActiveTrackIndex();

            if (activeIndex === undefined || activeIndex === null) {
                // No track in native player - need to reload the current track
                // This happens after app restart when queue is restored from database
                if (currentTrack) {
                    // No track in native player, reload restored track
                    await playTrack(currentTrack);
                    return;
                }
            }

            set({ isPlaying: true });
            audioService.resume();
        }
    },

    setQueue: (tracks) => {
        const { queueLimit } = useSettingsStore.getState();
        let limitedTracks = tracks;
        if (queueLimit > 0 && tracks.length > queueLimit) {
            limitedTracks = tracks.slice(0, queueLimit);
        }

        // Preserve existing queueItemIds if they exist, otherwise generate ONE stable ID per track
        // This prevents massive re-renders when the queue is updated or shuffled
        const tracksWithIds = limitedTracks.map(t => {
            if (t.queueItemId) return t;
            return {
                ...t,
                queueItemId: `${t.id}-${Math.random().toString(36).substring(2, 9)}`
            };
        });

        set({ queue: tracksWithIds, originalQueue: [], shuffleMode: false });
        persistQueueState();
    },

    // DEEP OPTIMIZATION: Map tracks in the store to avoid component-level overhead
    setRawQueue: (rawTracks: any[], dataSource: string, itemId: string, itemType: string) => {
        const { queueLimit } = useSettingsStore.getState();
        const isLocal = dataSource === 'local';
        const serverUrl = useAuthStore.getState().serverUrl;
        const token = useAuthStore.getState().user?.token;

        const mapped = rawTracks.slice(0, queueLimit > 0 ? queueLimit : undefined).map((t: any) => ({
            id: t.Id || t.id,
            name: t.Name || t.name,
            artist: t.AlbumArtist || t.Artists?.[0] || t.artist || 'Unknown',
            album: t.Album || t.album || 'Unknown',
            imageUrl: t.ImageUrl || t.imageUrl || (dataSource === 'jellyfin' ? `${serverUrl}/Items/${t.Id}/Images/Primary?api_key=${token}` : ''),
            imageBlurHash: t.ImageBlurHashes?.Primary ? Object.values(t.ImageBlurHashes.Primary)[0] as string : undefined,
            durationMillis: t.RunTimeTicks ? t.RunTimeTicks / 10000 : (t.durationMillis || 0),
            streamUrl: t.streamUrl || '',
            artistId: t.ArtistItems?.[0]?.Id || t.artistId || '',
            playlistId: itemType === 'Playlist' ? itemId : undefined,
            playlistItemId: t.PlaylistItemId,
            bitrate: isLocal ? t.bitrate : t.MediaSources?.[0]?.Bitrate,
            codec: isLocal ? t.codec : (t.MediaSources?.[0]?.Codec || t.MediaSources?.[0]?.MediaStreams?.find((s: any) => s.Type === 'Audio')?.Codec),
            lyrics: isLocal ? t.lyrics : undefined,
            queueItemId: `${t.Id || t.id}-${Math.random().toString(36).substring(2, 9)}`
        }));

        set({ queue: mapped, originalQueue: [], shuffleMode: false });
        persistQueueState();
        return mapped;
    },

    addToQueueNext: (track) => {
        const { queue, currentTrack } = get();
        const { queueLimit } = useSettingsStore.getState();
        if (queueLimit > 0 && queue.length >= queueLimit) return; // Queue full
        const trackWithId = {
            ...track,
            queueItemId: track.queueItemId || `${track.id}-${Math.random().toString(36).substring(2, 9)}`
        };

        if (!currentTrack) {
            set({ queue: [trackWithId, ...queue] });
            return;
        }
        const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
        const newQueue = [...queue];
        newQueue.splice(currentIndex + 1, 0, trackWithId);
        set({ queue: newQueue });
        persistQueueState();
    },

    addToQueueEnd: (track) => {
        const { queue } = get();
        const { queueLimit } = useSettingsStore.getState();
        if (queueLimit > 0 && queue.length >= queueLimit) return; // Queue full
        const trackWithId = {
            ...track,
            queueItemId: track.queueItemId || `${track.id}-${Math.random().toString(36).substring(2, 9)}`
        };
        set({ queue: [...queue, trackWithId] });
        persistQueueState();
    },

    reorderQueue: (fromIndex, toIndex) => {
        const { queue } = get();
        const newQueue = [...queue];
        const [movedItem] = newQueue.splice(fromIndex, 1);
        newQueue.splice(toIndex, 0, movedItem);
        set({ queue: newQueue });
        persistQueueState();
    },

    removeFromQueue: (queueItemId) => {
        const { queue, originalQueue } = get();
        // Fallback to track ID if queueItemId isn't present
        set({
            queue: queue.filter(t => (t.queueItemId || t.id) !== queueItemId),
            originalQueue: originalQueue.filter(t => (t.queueItemId || t.id) !== queueItemId),
        });
        persistQueueState();
    },

    clearQueue: () => {
        const { currentTrack } = get();
        // Keep only current track in queue
        if (currentTrack) {
            set({ queue: [currentTrack], originalQueue: [currentTrack] });
        } else {
            set({ queue: [], originalQueue: [] });
        }
        persistQueueState();
    },

    playNext: async () => {
        const { queue, currentTrack, playTrack, repeatMode } = get();
        if (!currentTrack || queue.length === 0) return;

        const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
        if (currentIndex === -1) return;

        // Calculate target index
        let targetIndex = currentIndex + 1;

        // Handle looping/bounds based on repeatMode
        if (repeatMode === 'one') {
            targetIndex = currentIndex; // Repeat one
        } else if (repeatMode === 'all') {
            targetIndex = targetIndex % queue.length;
        } else {
            // Repeat off: Clamp to end
            if (targetIndex >= queue.length) return; // Do nothing if at end and not repeating
        }

        if (targetIndex === currentIndex && repeatMode !== 'one') return;

        const targetTrack = queue[targetIndex];

        // Seamless Skip Check
        try {
            const nativeQueue = await audioService.getQueue();
            const currentNativeIndex = await audioService.getActiveTrackIndex();

            if (currentNativeIndex !== undefined && nativeQueue && nativeQueue.length > 0) {
                const targetNativeIndex = nativeQueue.findIndex(t => t.id === targetTrack.id);

                // Only skip if found AND it's different (unless repeating one)
                if (targetNativeIndex !== -1 && (targetNativeIndex !== currentNativeIndex || repeatMode === 'one')) {
                    await audioService.skip(targetNativeIndex);
                    return;
                }
            }
        } catch (e) {
            // Seamless skip check failed, will use full reload
        }

        await playTrack(targetTrack);
    },

    playPrevious: async () => {
        const { queue, currentTrack, playTrack, repeatMode, positionMillis, seek } = get();
        if (!currentTrack) return;

        // Standard UX: If we are more than 3 seconds into a track, pressing "previous" should just restart it.
        if (positionMillis > 3000) {
            await seek(0);
            return;
        }

        const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
        if (currentIndex === -1) return;

        let targetIndex = currentIndex - 1;

        if (targetIndex < 0) {
            if (repeatMode === 'all') {
                targetIndex = queue.length - 1;
            } else {
                targetIndex = 0; // Just restart first track if not repeating
            }
        }

        if (targetIndex === currentIndex) {
            await seek(0);
            return;
        }

        await playTrack(queue[targetIndex]);
    },

    seek: async (positionMillis) => {
        const { currentTrack } = get();
        if (currentTrack) {
            await audioService.seek(positionMillis); // Service handles conversion
            set({ positionMillis });
        }
    },

    toggleShuffle: () => {
        const { shuffleMode, queue, currentTrack, originalQueue } = get();
        const { queueLimit } = useSettingsStore.getState();
        const newMode = !shuffleMode;

        if (newMode) {
            // Save original order as-is (no copy needed — we only read it later)
            const original = queue;
            // Single copy + in-place Fisher-Yates shuffle O(n)
            const shuffled = [...queue];
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            // Move current track to front so playback continues naturally
            if (currentTrack) {
                const idx = shuffled.findIndex(t => t.id === currentTrack.id);
                if (idx > 0) {
                    [shuffled[0], shuffled[idx]] = [shuffled[idx], shuffled[0]];
                }
            }
            // Respect queueLimit
            const limited = (queueLimit > 0 && shuffled.length > queueLimit)
                ? shuffled.slice(0, queueLimit)
                : shuffled;
            set({ shuffleMode: true, originalQueue: original, queue: limited });
        } else {
            // Shuffle off: Restore original order (no copy — original is immutable from our perspective)
            set({ shuffleMode: false, queue: originalQueue.length ? originalQueue : queue });
        }
        persistQueueState();
    },

    toggleRepeat: () => {
        const { repeatMode } = get();
        const modes: ('off' | 'all' | 'one')[] = ['off', 'all', 'one'];
        const nextIndex = (modes.indexOf(repeatMode) + 1) % modes.length;
        set({ repeatMode: modes[nextIndex] });
        persistQueueState();
    },

    updateTrackFavorite: (trackId, isFavorite) => {
        const { queue, currentTrack } = get();

        // Update in queue
        const newQueue = queue.map(t =>
            t.id === trackId ? { ...t, isFavorite } : t
        );

        // Update current track if matches
        const newCurrent = currentTrack && currentTrack.id === trackId
            ? { ...currentTrack, isFavorite }
            : currentTrack;

        set({ queue: newQueue, currentTrack: newCurrent });
    },

    toggleCurrentTrackFavorite: async () => {
        const { currentTrack, updateTrackFavorite } = get();
        if (!currentTrack) return;

        const newStatus = !currentTrack.isFavorite;
        updateTrackFavorite(currentTrack.id, newStatus);

        try {
            // Determine if track is local
            const isLocal = currentTrack.streamUrl?.startsWith('file://') ||
                useSettingsStore.getState().dataSource === 'local';

            if (isLocal) {
                await DatabaseService.toggleFavorite(currentTrack.id, newStatus);
            } else {
                if (newStatus) {
                    await jellyfinApi.markFavorite(currentTrack.id);
                } else {
                    await jellyfinApi.unmarkFavorite(currentTrack.id);
                }
            }
        } catch (e) {
            console.error('Failed to toggle favorite API:', e);
            updateTrackFavorite(currentTrack.id, !newStatus); // Revert
        }
    },

    reset: () => {
        audioService.stop(); // Use service stop method
        set({
            currentTrack: null,
            isPlaying: false,
            positionMillis: 0,
            durationMillis: 0,
            queue: [],
            originalQueue: []
        });
    }
}));
