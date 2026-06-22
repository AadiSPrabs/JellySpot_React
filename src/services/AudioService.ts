import TrackPlayer, {
  AppKilledPlaybackBehavior,
  Capability,
  RepeatMode,
  Event,
  State,
} from "react-native-track-player";

class AudioService {
  private isSetup = false;
  private setupPromise: Promise<void> | null = null;

  async setup() {
    if (this.isSetup) return;
    if (this.setupPromise) return this.setupPromise;

    this.setupPromise = (async () => {
      try {
        await TrackPlayer.setupPlayer();
        await TrackPlayer.updateOptions({
          android: {
            appKilledPlaybackBehavior:
              AppKilledPlaybackBehavior.StopPlaybackAndRemoveNotification,
          },
          capabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
            Capability.Stop,
          ],
          notificationCapabilities: [
            Capability.Play,
            Capability.Pause,
            Capability.SkipToNext,
            Capability.SkipToPrevious,
            Capability.SeekTo,
            Capability.Stop,
          ],
          progressUpdateEventInterval: 1,
        });
        this.isSetup = true;
      } catch (error) {
        this.isSetup = true;
      } finally {
        this.setupPromise = null;
      }
    })();

    return this.setupPromise;
  }

  async play(track: {
    id: string;
    url: string;
    title: string;
    artist: string;
    artwork?: string;
    duration: number;
  }) {
    await this.setup();

    try {
      await TrackPlayer.reset();
      await TrackPlayer.add({
        id: track.id,
        url: track.url,
        title: track.title,
        artist: track.artist,
        artwork: track.artwork,
        duration: track.duration,
      });
      await TrackPlayer.play();
    } catch (error) {
      console.error("[AudioService] Play failed:", error);
    }
  }

  async addToQueue(track: {
    id: string;
    url: string;
    title: string;
    artist: string;
    artwork?: string;
    duration: number;
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
      console.warn("[AudioService] Failed to skip to next:", error);
      throw error;
    }
  }

  async skipToPrevious() {
    await this.setup();
    try {
      await TrackPlayer.skipToPrevious();
    } catch (error) {
      console.warn("[AudioService] Failed to skip to previous:", error);
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
      console.warn("[AudioService] Failed to skip to index:", error);
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

  async setVolume(volume: number) {
    await this.setup();
    await TrackPlayer.setVolume(volume);
  }

  async getVolume(): Promise<number> {
    await this.setup();
    return await TrackPlayer.getVolume();
  }

  // Remote Volume Helper
  private remoteStoreDeps: {
    setVolumeLevel?: (level: number) => void;
    setShowVolumeIndicator?: (show: boolean) => void;
    targetSessionId?: string | null;
  } = {};

  setRemoteStoreDependencies(deps: typeof this.remoteStoreDeps) {
    this.remoteStoreDeps = { ...this.remoteStoreDeps, ...deps };
  }

  triggerRemoteVolumeIndicator(level: number) {
    const targetSessionId = this.remoteStoreDeps.targetSessionId;

    if (targetSessionId) {
      if (this.remoteStoreDeps.setVolumeLevel)
        this.remoteStoreDeps.setVolumeLevel(level);
      if (this.remoteStoreDeps.setShowVolumeIndicator)
        this.remoteStoreDeps.setShowVolumeIndicator(true);
    } else {
      // Fallback to require if not injected
      try {
        const { useRemoteStore } = require("../store/remoteStore");
        const state = useRemoteStore.getState();
        if (state.targetSessionId) {
          state.setVolumeLevel(level);
          state.setShowVolumeIndicator(true);
        }
      } catch (e) {}
    }
  }
}

export const audioService = new AudioService();
