import TrackPlayer, { Event } from 'react-native-track-player';
import { usePlayerStore } from '../store/playerStore';

export const PlaybackService = async function () {
    TrackPlayer.addEventListener(Event.RemotePlay, () => {
        usePlayerStore.getState().togglePlayPause();
    });

    TrackPlayer.addEventListener(Event.RemotePause, () => {
        usePlayerStore.getState().togglePlayPause();
    });

    TrackPlayer.addEventListener(Event.RemoteStop, () => {
        usePlayerStore.getState().reset();
    });

    TrackPlayer.addEventListener(Event.RemoteNext, () => {
        usePlayerStore.getState().playNext();
    });

    TrackPlayer.addEventListener(Event.RemotePrevious, () => {
        usePlayerStore.getState().playPrevious();
    });

    TrackPlayer.addEventListener(Event.RemoteSeek, (event) => {
        usePlayerStore.getState().seek(event.position * 1000); // Store uses ms
    });

    let wasPlaying = false;
    TrackPlayer.addEventListener(Event.RemoteDuck, (event) => {
        const { paused, permanent } = event;
        const playerState = usePlayerStore.getState();

        if (permanent) {
            wasPlaying = playerState.isPlaying;
            if (wasPlaying) {
                playerState.togglePlayPause();
            }
            return;
        }

        if (paused) {
            wasPlaying = playerState.isPlaying;
            if (wasPlaying) {
                playerState.togglePlayPause();
            }
        } else {
            if (wasPlaying) {
                playerState.togglePlayPause();
            }
        }
    });
};
