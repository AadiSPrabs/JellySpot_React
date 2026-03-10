import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, useWindowDimensions, Alert, Linking } from 'react-native';
import { Text, List, Avatar, Button, useTheme, Divider, Surface, IconButton, Snackbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { jellyfinApi } from '../api/jellyfin';
import { useNavigation } from '@react-navigation/native';
import { backupService } from '../services/BackupService';

import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { HomeStackParamList } from '../types/navigation';
import SettingsGroup from '../components/SettingsGroup';
import SettingsItem from '../components/SettingsItem';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function SettingsScreen() {
    const theme = useTheme();
    const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
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

                <SettingsGroup title="General">
                    <SettingsItem
                        title="Appearance"
                        description="Colors, Player Background"
                        icon="palette"
                        onPress={() => navigation.navigate('Appearance' as any)}
                        right={() => <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} style={{ alignSelf: 'center', marginRight: 16 }} />}
                    />
                    <SettingsItem
                        title="Playback"
                        description="Audio Quality, Crossfade, Speed"
                        icon="play-circle-outline"
                        onPress={() => navigation.navigate('PlaybackSettings' as any)}
                        right={() => <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} style={{ alignSelf: 'center', marginRight: 16 }} />}
                    />
                    <SettingsItem
                        title="Storage"
                        description="Local music folder"
                        icon="folder-music"
                        onPress={() => navigation.navigate('StorageSettings' as any)}
                        right={() => <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} style={{ alignSelf: 'center', marginRight: 16 }} />}
                    />
                    <SettingsItem
                        title="Music Sources"
                        description="Jellyfin, Local, or Both"
                        icon="music-box-multiple"
                        onPress={() => navigation.navigate('SourceModeSettings' as any)}
                        right={() => <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} style={{ alignSelf: 'center', marginRight: 16 }} />}
                    />
                    <SettingsItem
                        title="Downloads"
                        description="Offline storage, network settings"
                        icon="download"
                        onPress={() => navigation.navigate('DownloadSettings' as any)}
                        right={() => <MaterialCommunityIcons name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} style={{ alignSelf: 'center', marginRight: 16 }} />}
                    />
                </SettingsGroup>

                <SettingsGroup title="Backup & Restore">
                    <SettingsItem
                        title="Export Backup"
                        description="Save settings, playlists & favorites"
                        icon="export"
                        onPress={handleExport}
                        disabled={isExporting}
                        right={() => isExporting ? <Text style={{ marginRight: 16, alignSelf: 'center' }}>Exporting...</Text> : undefined}
                    />
                    <SettingsItem
                        title="Import Backup"
                        description="Restore from a backup file"
                        icon="import"
                        onPress={handleImport}
                        disabled={isImporting}
                        right={() => isImporting ? <Text style={{ marginRight: 16, alignSelf: 'center' }}>Importing...</Text> : undefined}
                    />
                </SettingsGroup>

                <SettingsGroup title="About">
                    <SettingsItem
                        title="Version"
                        description="1.0.0"
                        icon="information-outline"
                    />
                    <SettingsItem
                        title="GitHub Repository"
                        description="View source code"
                        icon="github"
                        onPress={() => Linking.openURL('https://github.com/AadiSPrabs/JellySpot_React')}
                        right={() => <MaterialCommunityIcons name="open-in-new" size={20} color={theme.colors.onSurfaceVariant} style={{ alignSelf: 'center', marginRight: 16 }} />}
                    />
                </SettingsGroup>

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
