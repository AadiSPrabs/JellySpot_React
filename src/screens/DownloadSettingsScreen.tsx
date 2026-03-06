import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { Text, List, useTheme, IconButton, Switch, Surface, Button, Menu } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useSettingsStore } from '../store/settingsStore';
import { Directory } from 'expo-file-system';
import * as Network from 'expo-network';
import { downloadService } from '../services/DownloadService';
import ConfirmationDialog, { ConfirmationType } from '../components/ConfirmationDialog';
import SettingsGroup from '../components/SettingsGroup';
import SettingsItem from '../components/SettingsItem';

const CONCURRENT_OPTIONS = [
    { label: '1 download at a time', value: 1 },
    { label: '2 simultaneous', value: 2 },
    { label: '3 simultaneous', value: 3 },
    { label: '5 simultaneous', value: 5 },
];

export default function DownloadSettingsScreen() {
    const theme = useTheme();
    const navigation = useNavigation();
    const { width, height } = useWindowDimensions();
    const isLandscape = width > height;
    const {
        downloadPath,
        setDownloadPath,
        maxConcurrentDownloads,
        setMaxConcurrentDownloads,
        wifiOnlyDownloads,
        setWifiOnlyDownloads,
    } = useSettingsStore();

    const [isConnectedWifi, setIsConnectedWifi] = useState(false);
    const [concurrentMenuVisible, setConcurrentMenuVisible] = useState(false);

    // Confirmation dialog state
    const [dialogVisible, setDialogVisible] = useState(false);
    const [dialogTitle, setDialogTitle] = useState('');
    const [dialogMessage, setDialogMessage] = useState('');
    const [dialogType, setDialogType] = useState<ConfirmationType>('info');

    const showConfirmation = (title: string, message: string, type: ConfirmationType = 'info') => {
        setDialogTitle(title);
        setDialogMessage(message);
        setDialogType(type);
        setDialogVisible(true);
    };

    useEffect(() => {
        // Check initial network state
        Network.getNetworkStateAsync().then(state => {
            setIsConnectedWifi(state.type === Network.NetworkStateType.WIFI);
        });

        // Poll network state every 5 seconds (expo-network doesn't have subscription)
        const interval = setInterval(async () => {
            const state = await Network.getNetworkStateAsync();
            setIsConnectedWifi(state.type === Network.NetworkStateType.WIFI);
        }, 5000);

        return () => clearInterval(interval);
    }, []);

    const getDisplayPath = () => {
        if (downloadPath) {
            // Show just the last part of the path for readability
            try {
                const decoded = decodeURIComponent(downloadPath);
                const parts = decoded.split('/');
                return parts.slice(-2).join('/') || 'Custom folder';
            } catch {
                return 'Custom folder';
            }
        }
        return 'App Internal Storage (Default)';
    };

    const handleBrowseFolder = async () => {
        try {
            // Use Directory.pickDirectoryAsync for proper SAF access with write permissions
            const directory = await Directory.pickDirectoryAsync();

            if (directory) {
                // SAF picker grants write permissions automatically
                // Just verify the directory exists
                if (directory.exists) {
                    // Store the URI for persistence
                    setDownloadPath(directory.uri);

                    // Set the directory in the download service
                    downloadService.setCustomDirectory(directory as any);

                    showConfirmation('Success', 'Download location updated! Downloads will now save to this folder.', 'success');
                } else {
                    showConfirmation('Error', 'Selected folder does not exist.', 'error');
                }
            }
        } catch (error) {
            console.error('Error picking folder:', error);
            showConfirmation('Error', 'Failed to select folder. Please try again.', 'error');
        }
    };

    const handleResetPath = () => {
        setDownloadPath(null);
        downloadService.setCustomDirectory(null);
        showConfirmation('Reset', 'Download location reset to app internal storage.', 'info');
    };

    const getConcurrentLabel = () => {
        return CONCURRENT_OPTIONS.find(opt => opt.value === maxConcurrentDownloads)?.label || '1 download at a time';
    };

    return (
        <>
            <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]} edges={['top']}>
                <View style={[styles.appBar, isLandscape && styles.appBarLandscape]}>
                    <IconButton icon="arrow-left" onPress={() => navigation.goBack()} size={isLandscape ? 20 : 24} />
                    <Text variant={isLandscape ? "titleMedium" : "titleLarge"} style={{ fontWeight: 'bold' }}>Download Settings</Text>
                </View>

                <ScrollView contentContainerStyle={styles.content}>
                    {/* Storage Location */}
                    <SettingsGroup title="Download Location">
                        <SettingsItem
                            title="Save Location"
                            description={getDisplayPath()}
                            icon="folder"
                        />
                        <View style={styles.buttonRow}>
                            <Button
                                mode="contained"
                                onPress={handleBrowseFolder}
                                style={{ marginRight: 8 }}
                                icon="folder-open"
                            >
                                Browse
                            </Button>
                            <Button
                                mode="outlined"
                                onPress={handleResetPath}
                            >
                                Reset
                            </Button>
                        </View>
                        <Text variant="bodySmall" style={[styles.helpText, { color: theme.colors.onSurfaceVariant }]}>
                            Select a folder to save downloaded music. Uses Android's Storage Access Framework for full access.
                        </Text>
                    </SettingsGroup>

                    {/* Concurrent Downloads */}
                    <SettingsGroup title="Simultaneous Downloads">
                        <View style={styles.dropdownContainer}>
                            <Text variant="bodyLarge" style={{ color: theme.colors.onSurface }}>Max Downloads</Text>
                            <Menu
                                visible={concurrentMenuVisible}
                                onDismiss={() => setConcurrentMenuVisible(false)}
                                anchor={
                                    <Button
                                        mode="outlined"
                                        onPress={() => setConcurrentMenuVisible(true)}
                                        icon="chevron-down"
                                        contentStyle={{ flexDirection: 'row-reverse' }}
                                    >
                                        {getConcurrentLabel()}
                                    </Button>
                                }
                            >
                                {CONCURRENT_OPTIONS.map(option => (
                                    <Menu.Item
                                        key={option.value}
                                        onPress={() => {
                                            setMaxConcurrentDownloads(option.value);
                                            setConcurrentMenuVisible(false);
                                        }}
                                        title={option.label}
                                        leadingIcon={maxConcurrentDownloads === option.value ? 'check' : undefined}
                                    />
                                ))}
                            </Menu>
                        </View>
                        <Text variant="bodySmall" style={[styles.helpText, { color: theme.colors.onSurfaceVariant }]}>
                            More simultaneous downloads complete faster but use more bandwidth.
                        </Text>
                    </SettingsGroup>

                    {/* WiFi Only */}
                    <SettingsGroup title="Network">
                        <SettingsItem
                            title="Download on WiFi only"
                            description={wifiOnlyDownloads ? 'Downloads will wait for WiFi' : 'Downloads use any network'}
                            icon="wifi"
                            onPress={() => setWifiOnlyDownloads(!wifiOnlyDownloads)}
                            right={() => (
                                <Switch
                                    value={wifiOnlyDownloads}
                                    onValueChange={setWifiOnlyDownloads}
                                />
                            )}
                        />
                        {wifiOnlyDownloads && !isConnectedWifi && (
                            <Text variant="bodySmall" style={[styles.helpText, { color: theme.colors.error, marginTop: -4 }]}>
                                ⚠️ Not connected to WiFi - downloads will wait
                            </Text>
                        )}
                    </SettingsGroup>
                </ScrollView>
            </SafeAreaView>

            {/* Styled Confirmation Dialog */}
            <ConfirmationDialog
                visible={dialogVisible}
                onDismiss={() => setDialogVisible(false)}
                title={dialogTitle}
                message={dialogMessage}
                type={dialogType}
            />
        </>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    appBar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 4,
    },
    appBarLandscape: {
        paddingVertical: 4,
    },
    content: {
        paddingVertical: 16,
    },
    buttonRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 16,
    },
    helpText: {
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    dropdownContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
});
