import React, { useState, useEffect } from 'react';
import { ScrollView } from 'react-native';
import { Dialog, Portal, List, Button, Text } from 'react-native-paper';
import { jellyfinApi } from '../api/jellyfin';

interface AddToPlaylistDialogProps {
    visible: boolean;
    onDismiss: () => void;
    trackId: string | null;
}

export default function AddToPlaylistDialog({ visible, onDismiss, trackId }: AddToPlaylistDialogProps) {
    const [playlists, setPlaylists] = useState<any[]>([]);
    const [isDuplicateDialogVisible, setIsDuplicateDialogVisible] = useState(false);
    const [pendingPlaylistId, setPendingPlaylistId] = useState<string | null>(null);

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
            onDismiss();
        } catch (error) {
            console.error('Failed to add to playlist:', error);
        }
    };

    return (
        <Portal>
            <Dialog visible={visible && !isDuplicateDialogVisible} onDismiss={onDismiss}>
                <Dialog.Title>Add to Playlist</Dialog.Title>
                <Dialog.Content>
                    <ScrollView style={{ maxHeight: 300 }}>
                        {playlists.map(playlist => (
                            <List.Item
                                key={playlist.Id}
                                title={playlist.Name}
                                left={props => <List.Icon {...props} icon="playlist-music" />}
                                onPress={() => handleAddToPlaylist(playlist.Id)}
                            />
                        ))}
                    </ScrollView>
                </Dialog.Content>
                <Dialog.Actions>
                    <Button onPress={onDismiss}>Cancel</Button>
                </Dialog.Actions>
            </Dialog>

            <Dialog visible={isDuplicateDialogVisible} onDismiss={() => setIsDuplicateDialogVisible(false)}>
                <Dialog.Title>Duplicate Song</Dialog.Title>
                <Dialog.Content>
                    <Text variant="bodyMedium">This song is already in the playlist. Do you want to add it anyway?</Text>
                </Dialog.Content>
                <Dialog.Actions>
                    <Button onPress={() => setIsDuplicateDialogVisible(false)}>Cancel</Button>
                    <Button onPress={() => pendingPlaylistId && confirmAddToPlaylist(pendingPlaylistId)}>Add Anyway</Button>
                </Dialog.Actions>
            </Dialog>
        </Portal>
    );
}
