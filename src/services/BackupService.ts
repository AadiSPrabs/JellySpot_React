import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Backup file format version for future compatibility
const BACKUP_VERSION = 1;

export interface BackupData {
    version: number;
    timestamp: string;
    settings: Record<string, any>;
    localLibrary: {
        playlists: any[];
        favorites: string[];
    };
}

class BackupService {
    /**
     * Export all app data as a JSON backup file
     * Returns the path to the exported file or null if failed
     */
    async exportBackup(): Promise<string | null> {
        try {
            // Collect settings from AsyncStorage
            const settingsJson = await AsyncStorage.getItem('settings-storage');
            const settings = settingsJson ? JSON.parse(settingsJson) : {};

            // Collect local library data
            const localLibraryJson = await AsyncStorage.getItem('local-library-storage');
            const localLibraryData = localLibraryJson ? JSON.parse(localLibraryJson) : {};

            // Create backup object
            const backup: BackupData = {
                version: BACKUP_VERSION,
                timestamp: new Date().toISOString(),
                settings: settings.state || settings,
                localLibrary: {
                    playlists: localLibraryData.state?.playlists || [],
                    favorites: localLibraryData.state?.favorites || [],
                },
            };

            // Generate filename with timestamp
            const filename = `jellyspot_backup_${new Date().toISOString().slice(0, 10)}.json`;
            const backupContent = JSON.stringify(backup, null, 2);

            // Use Storage Access Framework to let user pick save location
            const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

            if (!permissions.granted) {
                return null; // User cancelled
            }

            // Create the file in the selected directory
            const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
                permissions.directoryUri,
                filename,
                'application/json'
            );

            // Write content to the file
            await FileSystem.writeAsStringAsync(fileUri, backupContent, {
                encoding: FileSystem.EncodingType.UTF8,
            });

            return fileUri;
        } catch (error) {
            console.error('Backup export failed:', error);
            return null;
        }
    }

    /**
     * Import backup data from a JSON file
     * Returns true if successful, false otherwise
     */
    async importBackup(): Promise<{ success: boolean; message: string }> {
        try {
            // Pick a JSON file
            const result = await DocumentPicker.getDocumentAsync({
                type: 'application/json',
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets?.[0]) {
                return { success: false, message: 'File selection cancelled' };
            }

            const fileUri = result.assets[0].uri;

            // Read file contents
            const contents = await FileSystem.readAsStringAsync(fileUri);
            const backup: BackupData = JSON.parse(contents);

            // Validate backup structure
            if (!backup.version || !backup.settings) {
                return { success: false, message: 'Invalid backup file format' };
            }

            // Check version compatibility
            if (backup.version > BACKUP_VERSION) {
                return {
                    success: false,
                    message: 'Backup file is from a newer version of the app. Please update the app first.'
                };
            }

            // Restore settings
            if (backup.settings) {
                const currentSettingsJson = await AsyncStorage.getItem('settings-storage');
                const currentSettings = currentSettingsJson ? JSON.parse(currentSettingsJson) : {};

                // Merge with existing settings, preserving any new fields
                const mergedSettings = {
                    ...currentSettings,
                    state: {
                        ...currentSettings.state,
                        ...backup.settings,
                    },
                };

                await AsyncStorage.setItem('settings-storage', JSON.stringify(mergedSettings));
            }

            // Restore local library data (playlists)
            if (backup.localLibrary && backup.localLibrary.playlists) {
                const currentLibraryJson = await AsyncStorage.getItem('local-library-storage');
                const currentLibrary = currentLibraryJson ? JSON.parse(currentLibraryJson) : {};

                // Replace playlists with backup data (don't merge, fully overwrite playlist array)
                const restoredLibrary = {
                    ...currentLibrary,
                    state: {
                        ...currentLibrary.state,
                        playlists: backup.localLibrary.playlists,
                    },
                };

                await AsyncStorage.setItem('local-library-storage', JSON.stringify(restoredLibrary));
                console.log('Restored playlists:', backup.localLibrary.playlists.length);
            }

            return {
                success: true,
                message: `Backup from ${new Date(backup.timestamp).toLocaleDateString()} restored successfully. Please restart the app.`
            };
        } catch (error) {
            console.error('Backup import failed:', error);
            return {
                success: false,
                message: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`
            };
        }
    }
}

export const backupService = new BackupService();
