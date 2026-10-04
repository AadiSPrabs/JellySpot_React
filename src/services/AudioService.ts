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
            /**
             * NOTE: this TrackPlayer version (5.0.0-alpha) exposes no
             * `smallIcon` option - the media3 notification provider resolves
             * the icon from `android:icon` in the manifest, which is the
             * COLOURED launcher icon. Android requires a white silhouette for
             * notification small icons, so the launcher icon is flattened to a
             * white blob.
             *
             * The drawable `ic_notification` (generated from the app's
             * monochrome icon) is added under res/drawable-*dpi, but wiring it
             * up needs a native override of the media3 notification provider -
             * see MainApplication.
             */
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
        /**
         * Force the native repeat mode off at startup.
         *
         * TrackPlayer defaults to `RepeatMode.ALL`, which makes the native
         * player loop its small buffer on its own. This app advances from its
         * own logical queue via PlaybackQueueEnded, so leaving the native mode
         * on ALL means two independent advance mechanisms race - the visible
         * symptom being songs that repeat with repeat switched off. The store
         * re-applies the user's real choice through setRepeatMode().
         */
        await TrackPlayer.setRepeatMode(RepeatMode.Off);
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
      throw error;
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

  /**
   * Mirrors the app's repeat mode onto the native player.
   *
   * TrackPlayer's native default is `RepeatMode.ALL` (see the library's
   * PlayerOptions), and nothing in this app ever overrode it. So the native
   * player looped its ~2-track buffer forever, independently of the app's own
   * advance logic - which is why songs repeated even with repeat switched off.
   * `off` must map to `RepeatMode.Off` for the native queue to stop at its end
   * and let `PlaybackQueueEnded` drive the logical queue instead.
   */
  async setRepeatMode(mode: "off" | "all" | "one") {
    if (!this.isSetup) return;
    const native =
      mode === "one"
        ? RepeatMode.Track
        : mode === "all"
          ? RepeatMode.Queue
          : RepeatMode.Off;
    try {
      await TrackPlayer.setRepeatMode(native);
    } catch (error) {
      console.warn("[AudioService] Failed to set repeat mode:", error);
    }
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

}

export const audioService = new AudioService();
