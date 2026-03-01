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

// Rapid Skip Accumulator State
let skipTimer: NodeJS.Timeout | null = null;
let pendingSkips = 0;

// Queue Persistence Debounce (saves every 2 seconds max while changes are happening)
let persistTimer: NodeJS.Timeout | null = null;
const persistQueueState = () => {
    if (persistTimer) {
        clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(() => {
        const state = usePlayerStore.getState();
        DatabaseService.saveQueueState({
            currentTrack: state.currentTrack,
            queue: state.queue,
            originalQueue: state.originalQueue,
            shuffleMode: state.shuffleMode,
            repeatMode: state.repeatMode,
            positionMillis: state.positionMillis,
        });
        persistTimer = null;
    }, 2000); // Debounce: save 2s after last change
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
            const { queue, repeatMode, shuffleMode, currentTrack } = get();

            // If event.track is null, it means playback stopped or queue ended
            if (!event.track) return;

            // Handle 'endOfTrack' sleep timer
            if (get().sleepTimerTarget === 'endOfTrack') {
                set({ sleepTimerTarget: null, isPlaying: false });
                await audioService.pause();
                // We still want to let it set the new track so UI updates, but paused.
            }

            // Update current track in store
            // We need to find the full track object from our queue
            const newTrack = queue.find(t => t.id === event.track.id || t.streamUrl === event.track.url);

            if (newTrack) {
                // Determine the NEXT track to buffer
                // Logic duplicates getNextTrack but we need it here to buffer
                let nextTrack: Track | undefined;
                const currentIndex = queue.findIndex(t => t.id === newTrack.id);

                if (repeatMode === 'one') {
                    nextTrack = newTrack;
                } else if (currentIndex < queue.length - 1) {
                    nextTrack = queue[currentIndex + 1];
                } else if (repeatMode === 'all') {
                    nextTrack = queue[0];
                }

                if (nextTrack) {
                    // Check if next track is already in native queue to prevent duplicates
                    const nativeQueue = await TrackPlayer.getQueue();
                    const currentNativeIndex = await TrackPlayer.getActiveTrackIndex();

                    // We only need to add if the NEXT native track doesn't match our desired next track
                    const nextNativeTrack = nativeQueue[currentNativeIndex + 1];
                    const shouldAdd = !nextNativeTrack || nextNativeTrack.id !== nextTrack.id;

                    if (shouldAdd) {
                        const nextUrl = await getStreamUrl(nextTrack);
                        if (nextUrl) {
                            try {
                                await audioService.addToQueue({
                                    id: nextTrack.id,
                                    url: nextUrl,
                                    title: nextTrack.name,
                                    artist: nextTrack.artist,
                                    artwork: nextTrack.imageUrl && !nextTrack.imageUrl.startsWith('data:') ? nextTrack.imageUrl : undefined,
                                    duration: (nextTrack.durationMillis || 0) / 1000
                                });
                            } catch (e) {
                                console.warn('[PlayerStore] Failed to buffer next track:', e);
                            }
                        }
                    }
                }

                set({ currentTrack: newTrack });
            }
        });
        listenerCleanups.push(() => sub3.remove());

        const sub4 = TrackPlayer.addEventListener(Event.PlaybackState, (event: any) => {
            set({ isPlaying: event.state === 'playing' });
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
        // Reset skip accumulator on direct play
        pendingSkips = 0;
        if (skipTimer) {
            clearTimeout(skipTimer);
            skipTimer = null;
        }

        set({ playbackError: null }); // Clear previous errors

        try {
            const streamUrl = await getStreamUrl(track);

            // Determine next track for buffering
            let { queue, repeatMode, shuffleMode } = get();

            // If track is not in queue, add it (ensures single songs can repeat)
            let currentIndex = queue.findIndex(t => t.id === track.id);
            if (currentIndex === -1) {
                // Track not in queue - create a single-track queue
                queue = [track];
                set({ queue: [track], originalQueue: [track] });
                currentIndex = 0;
            }

            let nextTrack: Track | undefined;

            if (repeatMode === 'one') {
                nextTrack = track;
            } else if (currentIndex < queue.length - 1 && currentIndex !== -1) {
                nextTrack = queue[currentIndex + 1];
            } else if (repeatMode === 'all') {
                nextTrack = queue[0];
            }

            // Prepare next track object if it exists
            let nextTrackParam = undefined;
            if (nextTrack) {
                const nextUrl = await getStreamUrl(nextTrack);
                nextTrackParam = {
                    id: nextTrack.id,
                    url: nextUrl,
                    title: nextTrack.name,
                    artist: nextTrack.artist,
                    artwork: nextTrack.imageUrl && !nextTrack.imageUrl.startsWith('data:') ? nextTrack.imageUrl : undefined,
                    duration: (nextTrack.durationMillis || 0) / 1000
                };
            }

            // Play via AudioService (Seamless Mode)
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
            }, nextTrackParam);

            set({
                currentTrack: track,
                isPlaying: true,
                positionMillis: 0,
                durationMillis: track.durationMillis || 0
            });

            // Persist queue state for instant restoration on next wake
            persistQueueState();

        } catch (error: any) {
            console.error('Failed to play track:', error);
            set({ playbackError: error.message || 'Failed to start playback' });
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
        const tracksWithIds = tracks.map(t => ({ ...t, queueItemId: t.queueItemId || `${t.id}-${Date.now()}-${Math.random()}` }));
        set({ queue: tracksWithIds, originalQueue: [], shuffleMode: false });
        persistQueueState();
    },

    addToQueueNext: (track) => {
        const { queue, currentTrack } = get();
        const trackWithId = { ...track, queueItemId: `${track.id}-${Date.now()}-${Math.random()}` };

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
        const trackWithId = { ...track, queueItemId: `${track.id}-${Date.now()}-${Math.random()}` };
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

        pendingSkips++;

        if (skipTimer) {
            clearTimeout(skipTimer);
        }

        skipTimer = setTimeout(async () => {
            const skips = pendingSkips;
            pendingSkips = 0;
            skipTimer = null;

            if (skips === 0) return;

            const { queue, currentTrack } = get(); // Re-get state
            if (!currentTrack) return;

            const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
            if (currentIndex === -1) return;

            // Calculate target index
            let targetIndex = currentIndex + skips;

            // Handle looping/bounds based on repeatMode
            if (repeatMode === 'one' && skips === 1) {
                targetIndex = currentIndex; // Repeat one
            } else if (repeatMode === 'all') {
                targetIndex = targetIndex % queue.length;
                if (targetIndex < 0) targetIndex += queue.length;
            } else {
                // Repeat off: Clamp to end
                if (targetIndex >= queue.length) targetIndex = queue.length - 1;
            }

            if (targetIndex === currentIndex && repeatMode !== 'one') return;

            const targetTrack = queue[targetIndex];

            // Seamless Skip Check
            try {
                const nativeQueue = await audioService.getQueue();
                const currentNativeIndex = await audioService.getActiveTrackIndex();

                if (currentNativeIndex !== undefined && nativeQueue && nativeQueue.length > 0) {
                    // Calculate relative offset in native queue
                    // It's safer to find by ID
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
        }, 300);
    },

    playPrevious: async () => {
        const { queue, currentTrack, playTrack } = get();
        if (!currentTrack) return;

        pendingSkips--; // Negative for previous

        if (skipTimer) {
            clearTimeout(skipTimer);
        }

        skipTimer = setTimeout(async () => {
            const skips = pendingSkips;
            pendingSkips = 0;
            skipTimer = null;

            if (skips === 0) return;

            const { queue, currentTrack, repeatMode } = get();
            if (!currentTrack) return;

            const currentIndex = queue.findIndex(t => t.id === currentTrack.id);
            if (currentIndex === -1) return;

            let targetIndex = currentIndex + skips;

            if (targetIndex < 0) {
                if (repeatMode === 'all') {
                    targetIndex = (targetIndex % queue.length + queue.length) % queue.length;
                } else {
                    targetIndex = 0;
                }
            }

            if (targetIndex === currentIndex) return;

            await playTrack(queue[targetIndex]);
        }, 300);
    },

    seek: async (positionMillis) => {
        const { currentTrack } = get();
        if (currentTrack) {
            await audioService.seek(positionMillis); // Service handles conversion
            set({ positionMillis });
        }
    },

    toggleShuffle: () => {
        const { shuffleMode, queue, originalQueue } = get();
        const newMode = !shuffleMode;

        if (newMode) {
            // Shuffle on: Save original order, shuffle queue
            const shuffled = [...queue].sort(() => Math.random() - 0.5);
            set({ shuffleMode: true, originalQueue: [...queue], queue: shuffled });
        } else {
            // Shuffle off: Restore original order
            set({ shuffleMode: false, queue: originalQueue.length ? [...originalQueue] : queue });
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
