import React, { useState, useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { List, Button, Text, Snackbar, Portal } from 'react-native-paper';
import { jellyfinApi } from '../api/jellyfin';
import ActionSheet from './ActionSheet';

interface AddToPlaylistDialogProps {
    visible: boolean;
    onDismiss: () => void;
    trackId: string | null;
}

export default function AddToPlaylistDialog({ visible, onDismiss, trackId }: AddToPlaylistDialogProps) {
    const [playlists, setPlaylists] = useState<any[]>([]);
    const [isDuplicateDialogVisible, setIsDuplicateDialogVisible] = useState(false);
    const [pendingPlaylistId, setPendingPlaylistId] = useState<string | null>(null);
    const [snackbarVisible, setSnackbarVisible] = useState(false);

    useEffect(() => {
        if (visible) {
            fetchPlaylists();
        }
    }, [visible]);

    const fetchPlaylists = async () => {
        try {
            const data = await jellyfinApi.getPlaylists();
            if (data && data.Items) {
                setPlaylists(data.Items);
            }
        } catch (error) {
            console.error('Failed to fetch playlists:', error);
        }
    };

    const handleAddToPlaylist = async (playlistId: string) => {
        if (!trackId) return;

        try {
            // Check for duplicates
            const playlistItems = await jellyfinApi.getItems({ ParentId: playlistId });
            const isDuplicate = playlistItems.Items.some((item: any) => item.Id === trackId);

            if (isDuplicate) {
                setPendingPlaylistId(playlistId);
                setIsDuplicateDialogVisible(true);
            } else {
                await confirmAddToPlaylist(playlistId);
            }
        } catch (error) {
            console.error('Failed to check playlist items:', error);
            await confirmAddToPlaylist(playlistId);
        }
    };

    const confirmAddToPlaylist = async (playlistId: string) => {
        if (!trackId) return;
        try {
            await jellyfinApi.addToPlaylist(playlistId, [trackId]);
            setIsDuplicateDialogVisible(false);
            setPendingPlaylistId(null);
            setSnackbarVisible(true);
            onDismiss();
        } catch (error) {
            console.error('Failed to add to playlist:', error);
        }
    };

    return (
        <>
            <ActionSheet visible={visible && !isDuplicateDialogVisible} onClose={onDismiss} title="Add to Playlist" scrollable>
                <View style={{ gap: 4 }}>
                    {playlists.map(playlist => (
                        <List.Item
                            key={playlist.Id}
                            title={playlist.Name}
                            left={props => <List.Icon {...props} icon="playlist-music" />}
                            onPress={() => handleAddToPlaylist(playlist.Id)}
                        />
                    ))}
                </View>
            </ActionSheet>

            <ActionSheet visible={isDuplicateDialogVisible} onClose={() => setIsDuplicateDialogVisible(false)} title="Duplicate Song" heightPercentage={30}>
                <View style={{ gap: 16 }}>
                    <Text variant="bodyMedium">This song is already in the playlist. Do you want to add it anyway?</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                        <Button mode="text" onPress={() => setIsDuplicateDialogVisible(false)}>Cancel</Button>
                        <Button mode="contained" onPress={() => pendingPlaylistId && confirmAddToPlaylist(pendingPlaylistId)}>Add Anyway</Button>
                    </View>
                </View>
            </ActionSheet>

            <Portal>
                <Snackbar
                    visible={snackbarVisible}
                    onDismiss={() => setSnackbarVisible(false)}
                    duration={3000}
                    action={{
                        label: 'OK',
                        onPress: () => setSnackbarVisible(false),
                    }}
                >
                    Successfully added to playlist
                </Snackbar>
            </Portal>
        </>
    );
}
