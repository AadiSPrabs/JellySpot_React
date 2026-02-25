import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, useWindowDimensions, Alert } from 'react-native';
import { Text, List, Avatar, Button, useTheme, Divider, Surface, IconButton, Snackbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { jellyfinApi } from '../api/jellyfin';
import { useNavigation } from '@react-navigation/native';
import { backupService } from '../services/BackupService';

export default function SettingsScreen() {
    const theme = useTheme();
    const navigation = useNavigation();
    const { user, serverUrl } = useAuthStore();
    const { sourceMode, localProfile } = useSettingsStore();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;

    const isLocalOnlyMode = sourceMode === 'local';

    // Determine which profile to display
    const displayName = isLocalOnlyMode ? localProfile.name : (user?.name || 'User');
    const displayImageUri = isLocalOnlyMode ? localProfile.imageUri : (user?.id ? jellyfinApi.getUserImageUrl(user.id) : null);
    const displaySubtitle = isLocalOnlyMode ? 'Local Music Mode' : serverUrl;

    // Backup state
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [snackbarMessage, setSnackbarMessage] = useState('');
    const [snackbarVisible, setSnackbarVisible] = useState(false);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            const result = await backupService.exportBackup();
            if (result) {
                setSnackbarMessage('Backup exported successfully!');
            } else {
                setSnackbarMessage('Export failed. Please try again.');
            }
        } catch (error) {
            setSnackbarMessage('Export failed. Please try again.');
        } finally {
            setIsExporting(false);
            setSnackbarVisible(true);
        }
    };

    const handleImport = async () => {
        setIsImporting(true);
        try {
            const result = await backupService.importBackup();
            setSnackbarMessage(result.message);
        } catch (error) {
            setSnackbarMessage('Import failed. Please try again.');
        } finally {
            setIsImporting(false);
            setSnackbarVisible(true);
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
            <View style={[styles.appBar, isLandscape && styles.appBarLandscape]}>
                <IconButton icon="arrow-left" onPress={() => navigation.goBack()} size={isLandscape ? 20 : 24} />
                <Text variant={isLandscape ? "titleMedium" : "titleLarge"} style={{ fontWeight: 'bold' }}>Settings</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                {/* User Profile Section */}
                <Surface style={[styles.profileCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={1}>
                    <View style={styles.profileHeader}>
                        {displayImageUri ? (
                            <Avatar.Image
                                size={80}
                                source={{ uri: displayImageUri }}
                            />
                        ) : (
                            <Avatar.Icon size={80} icon="account" />
                        )}
                        <View style={styles.profileInfo}>
                            <Text variant="headlineSmall" style={{ fontWeight: 'bold' }}>{displayName}</Text>
                            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>{displaySubtitle}</Text>
                        </View>
                    </View>
                </Surface>

                <List.Section>
                    <List.Subheader>General</List.Subheader>
                    <List.Item
                        title="Appearance"
                        description="Colors, Player Background"
                        left={props => <List.Icon {...props} icon="palette" />}
                        onPress={() => navigation.navigate('Appearance' as any)}
                    />
                    <List.Item
                        title="Playback"
                        description="Audio Quality, Crossfade, Speed"
                        left={props => <List.Icon {...props} icon="play-circle-outline" />}
                        onPress={() => navigation.navigate('PlaybackSettings' as any)}
                    />
                    <List.Item
                        title="Storage"
                        description="Local music folder"
                        left={props => <List.Icon {...props} icon="folder-music" />}
                        onPress={() => navigation.navigate('StorageSettings' as any)}
                    />
                    <List.Item
                        title="Music Sources"
                        description="Jellyfin, Local, or Both"
                        left={props => <List.Icon {...props} icon="music-box-multiple" />}
                        onPress={() => navigation.navigate('SourceModeSettings' as any)}
                    />
                    <List.Item
                        title="Downloads"
                        description="Offline storage, network settings"
                        left={props => <List.Icon {...props} icon="download" />}
                        onPress={() => navigation.navigate('DownloadSettings' as any)}
                    />
                </List.Section>

                <Divider />

                <List.Section>
                    <List.Subheader>Backup & Restore</List.Subheader>
                    <List.Item
                        title="Export Backup"
                        description="Save settings, playlists & favorites"
                        left={props => <List.Icon {...props} icon="export" />}
                        onPress={handleExport}
                        disabled={isExporting}
                        right={() => isExporting ? <Text style={{ marginRight: 16 }}>Exporting...</Text> : null}
                    />
                    <List.Item
                        title="Import Backup"
                        description="Restore from a backup file"
                        left={props => <List.Icon {...props} icon="import" />}
                        onPress={handleImport}
                        disabled={isImporting}
                        right={() => isImporting ? <Text style={{ marginRight: 16 }}>Importing...</Text> : null}
                    />
                </List.Section>

                <Divider />

                <List.Section>
                    <List.Subheader>About</List.Subheader>
                    <List.Item
                        title="Version"
                        description="1.0.0"
                        left={props => <List.Icon {...props} icon="information-outline" />}
                    />
                    <List.Item
                        title="Dependencies"
                        description="View Open Source Libraries"
                        left={props => <List.Icon {...props} icon="package-variant" />}
                        onPress={() => navigation.navigate('Dependencies' as any)}
                    />
                </List.Section>

                <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 24, opacity: 0.7 }}>
                    <Text variant="displayMedium" style={{ fontFamily: 'cursive', fontStyle: 'italic', fontWeight: 'bold', color: theme.colors.primary }}>JellySpot</Text>
                    <Text variant="labelSmall" style={{ marginTop: 4 }}>Made with ❤️</Text>
                </View>

            </ScrollView>

            <Snackbar
                visible={snackbarVisible}
                onDismiss={() => setSnackbarVisible(false)}
                duration={5000}
                wrapperStyle={{ bottom: 80 }}
                action={{
                    label: 'OK',
                    onPress: () => setSnackbarVisible(false),
                }}
            >
                {snackbarMessage}
            </Snackbar>
        </SafeAreaView >
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    appBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        marginBottom: 16,
    },
    appBarLandscape: {
        marginBottom: 8,
        paddingVertical: 4,
    },
    content: {
        paddingBottom: 180,
    },
    profileCard: {
        margin: 16,
        padding: 24,
        borderRadius: 16,
    },
    profileHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    profileInfo: {
        marginLeft: 20,
        flex: 1,
    },
});
