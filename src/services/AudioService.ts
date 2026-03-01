import TrackPlayer, {
    AppKilledPlaybackBehavior,
    Capability,
    RepeatMode,
    Event,
    State
} from 'react-native-track-player';

class AudioService {
    private isSetup = false;

    async setup() {
        if (this.isSetup) return;

        try {
            await TrackPlayer.setupPlayer();
            await TrackPlayer.updateOptions({
                android: {
                    // Stop playback and remove notification when app is killed (swiped away)
                    appKilledPlaybackBehavior: AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,

                },
                capabilities: [
                    Capability.Play,
                    Capability.Pause,
                    Capability.SkipToNext,
                    Capability.SkipToPrevious,
                    Capability.SeekTo,
                    Capability.Stop,
                ],
                // compactCapabilities removed as it is not in UpdateOptions type
                progressUpdateEventInterval: 1,
            });
            this.isSetup = true;
        } catch (error) {
            // Player might already be set up
            this.isSetup = true;
            // Player setup error (likely already setup)
        }
    }

    async play(track: {
        id: string;
        url: string;
        title: string;
        artist: string;
        artwork?: string;
        duration?: number
    }, nextTrack?: {
        id: string;
        url: string;
        title: string;
        artist: string;
        artwork?: string;
        duration?: number
    }) {
        await this.setup();

        try {
            const queue = await TrackPlayer.getQueue();

            // Prepare tracks to add
            const tracksToAdd = [{
                id: track.id,
                url: track.url,
                title: track.title,
                artist: track.artist,
                artwork: track.artwork,
                duration: track.duration,
            }];

            if (nextTrack) {
                tracksToAdd.push({
                    id: nextTrack.id,
                    url: nextTrack.url,
                    title: nextTrack.title,
                    artist: nextTrack.artist,
                    artwork: nextTrack.artwork,
                    duration: nextTrack.duration,
                });
            }

            // Smart Play Strategy: Avoid reset if possible to prevent flicker
            if (queue.length > 0) {
                // Check for queue bloat - reset if too large to prevent memory issues
                if (queue.length > 50) {
                    await TrackPlayer.reset();
                    await TrackPlayer.add(tracksToAdd);
                    await TrackPlayer.play();
                    return;
                }

                const insertIndex = queue.length;
                await TrackPlayer.add(tracksToAdd);
                await TrackPlayer.skip(insertIndex);
                await TrackPlayer.play();

                // Optional: Clean up old tracks to keep queue small?
                // For now, let's keep it simple.
            } else {
                // Empty queue, just add and play (reset effectively does this but maybe cleaner to explicit add)
                await TrackPlayer.reset(); // Ensure clean state
                await TrackPlayer.add(tracksToAdd);
                await TrackPlayer.play();
            }

        } catch (error) {
            console.warn("[AudioService] Play failed with smart strategy, trying fallback reset:", error);
            try {
                await TrackPlayer.reset();

                const tracksToAdd = [{
                    id: track.id,
                    url: track.url,
                    title: track.title,
                    artist: track.artist,
                    artwork: track.artwork,
                    duration: track.duration,
                }];

                if (nextTrack) {
                    tracksToAdd.push({
                        id: nextTrack.id,
                        url: nextTrack.url,
                        title: nextTrack.title,
                        artist: nextTrack.artist,
                        artwork: nextTrack.artwork,
                        duration: nextTrack.duration,
                    });
                }

                await TrackPlayer.add(tracksToAdd);
                await TrackPlayer.play();
            } catch (resetError) {
                console.error("[AudioService] Hard reset failed:", resetError);
            }
        }
    }

    async addToQueue(track: {
        id: string;
        url: string;
        title: string;
        artist: string;
        artwork?: string;
        duration?: number
    }) {
        if (!this.isSetup) return;
        try {
            await TrackPlayer.add({
                id: track.id,
                url: track.url,
                title: track.title,
                artist: track.artist,
                artwork: track.artwork,
                duration: track.duration,
            });
        } catch (error) {
            console.warn("[AudioService] Failed to add to queue:", error);
        }
    }

    async pause() {
        await TrackPlayer.pause();
    }

    async resume() {
        await TrackPlayer.play();
    }

    async stop() {
        if (!this.isSetup) return; // Ignore if not setup
        try {
            await TrackPlayer.reset();
        } catch (error) {
            // Ignore stop/reset errors
        }
    }

    async seek(positionMillis: number) {
        // TrackPlayer uses seconds
        await TrackPlayer.seekTo(positionMillis / 1000);
    }

    async getPosition(): Promise<number> {
        const position = await TrackPlayer.getProgress();
        return position.position * 1000; // Convert to ms
    }

    async getDuration(): Promise<number> {
        const position = await TrackPlayer.getProgress();
        return position.duration * 1000; // Convert to ms
    }

    async skipToNext() {
        await this.setup();
        try {
            await TrackPlayer.skipToNext();
        } catch (error) {
            console.warn('[AudioService] Failed to skip to next:', error);
            throw error;
        }
    }

    async skipToPrevious() {
        await this.setup();
        try {
            await TrackPlayer.skipToPrevious();
        } catch (error) {
            console.warn('[AudioService] Failed to skip to previous:', error);
            throw error;
        }
    }

    async getQueue() {
        await this.setup();
        return await TrackPlayer.getQueue();
    }

    async getActiveTrackIndex() {
        await this.setup();
        return await TrackPlayer.getActiveTrackIndex();
    }

    async skip(index: number) {
        await this.setup();
        try {
            await TrackPlayer.skip(index);
        } catch (error) {
            console.warn('[AudioService] Failed to skip to index:', error);
            throw error;
        }
    }



    // Playback speed control (0.5 to 2.0)
    async setPlaybackRate(rate: number): Promise<void> {
        await this.setup();
        // Clamp rate between 0.5 and 2.0
        const clampedRate = Math.max(0.5, Math.min(2.0, rate));
        await TrackPlayer.setRate(clampedRate);
    }

    async getPlaybackRate(): Promise<number> {
        await this.setup();
        return await TrackPlayer.getRate();
    }
}

export const audioService = new AudioService();
