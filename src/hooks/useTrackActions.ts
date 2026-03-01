import { useState } from 'react';
import { Alert } from 'react-native';
import { usePlayerStore } from '../store/playerStore';
import { useLocalLibraryStore } from '../store/localLibraryStore';
import { useSettingsStore } from '../store/settingsStore';
import { jellyfinApi } from '../api/jellyfin';
import { downloadService } from '../services/DownloadService';
import { Track } from '../types/track';

export const useTrackActions = () => {
    const { addToQueueNext, addToQueueEnd } = usePlayerStore.getState();
    const { dataSource } = useSettingsStore();

    const [isAddToPlaylistVisible, setIsAddToPlaylistVisible] = useState(false);
    const [playlists, setPlaylists] = useState<any[]>([]);
    const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);

    const handlePlayNext = (track: Track) => {
        addToQueueNext(track);
    };

    const handleAddToQueue = (track: Track) => {
        addToQueueEnd(track);
    };

    const handleOpenAddToPlaylist = async (trackId: string) => {
        setSelectedTrackId(trackId);
        try {
            if (dataSource === 'local') {
                const localPlaylists = useLocalLibraryStore.getState().playlists;
                setPlaylists(localPlaylists.map(p => ({ Id: p.id, Name: p.name })));
            } else {
                const data = await jellyfinApi.getPlaylists();
                setPlaylists(data.Items || []);
            }
            setIsAddToPlaylistVisible(true);
        } catch (error) {
            console.error('Failed to fetch playlists:', error);
        }
    };

    const handleDeleteTrack = async (track: Track, onComplete?: () => void) => {
        const isLocal = dataSource === 'local';

        Alert.alert(
            isLocal ? 'Delete File' : 'Delete from Server',
            isLocal
                ? 'Are you sure you want to delete this file from your device?'
                : 'Are you sure you want to permanently delete this file from your Jellyfin server? This cannot be undone.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            if (isLocal) {
                                const localLib = useLocalLibraryStore.getState();
                                // Track object is likely already in localLibrary format, but ensure it has right fields
                                await localLib.deleteTrack(track as any);
                            } else {
                                await jellyfinApi.deleteItem(track.id);
                            }
                            if (onComplete) onComplete();
                        } catch (error: any) {
                            console.error('Delete failed:', error);
                            const msg = error?.response?.data || error?.message || 'Unknown error';
                            Alert.alert('Error', `Failed to delete item: ${msg}`);
                        }
                    }
                }
            ]
        );
    };

    const handleDownloadTrack = async (track: Track) => {
        if (dataSource === 'local' || !track.imageUrl) {
            return;
        }

        try {
            await downloadService.queueTrack({
                id: track.id,
                name: track.name,
                artist: track.artist,
                album: track.album,
                imageUrl: track.imageUrl,
                durationMillis: track.durationMillis,
            });
        } catch (error) {
            console.error('[useTrackActions] Download error:', error);
        }
    };

    return {
        handlePlayNext,
        handleAddToQueue,
        handleOpenAddToPlaylist,
        handleDeleteTrack,
        handleDownloadTrack,
        isAddToPlaylistVisible,
        setIsAddToPlaylistVisible,
        playlists,
        selectedTrackId,
        setSelectedTrackId,
    };
};
