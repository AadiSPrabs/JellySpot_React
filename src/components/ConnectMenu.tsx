import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useRemoteStore, RemoteSession } from '../store/remoteStore';
import { Monitor, Headphones, ChevronRight, Volume2, X, Check } from 'lucide-react-native';
import Slider from '@react-native-community/slider';
import { webSocketService } from '../services/WebSocketService';
import { jellyfinApi } from '../api/jellyfin';
import { RefreshCw } from 'lucide-react-native';

export const ConnectMenu = ({ onClose }: { onClose: () => void }) => {
    const { activeSessions, targetSessionId, setTargetSessionId } = useRemoteStore();
    const theme = useTheme();

    /**
     * Colours come from the app theme.
     *
     * This component previously carried a complete Spotify palette - `#1DB954`
     * green, `#121212` background, `#282828` surfaces, `#333` borders. Those
     * are another product's brand values, and they made this the one surface
     * that visibly ignored Jellyspot's own theme.
     */
    const colors = {
        accent: theme.colors.primary,
        accentSoft: `${theme.colors.primary}1A`, // ~10% for the selected row
        background: theme.colors.background,
        surface: theme.colors.surfaceVariant,
        border: theme.colors.outlineVariant,
        text: theme.colors.onSurface,
        textMuted: theme.colors.onSurfaceVariant,
        danger: theme.colors.error,
    };

    const sortedSessions = [...activeSessions].filter(s => s.SupportsRemoteControl);

    const handleSelectDevice = (sessionId: string) => {
        setTargetSessionId(sessionId);
    };

    const handleSignOut = async (sessionId: string) => {
        try {
            await jellyfinApi.signOutSession(sessionId);
        } catch (e) {
            console.error('Sign out failed:', e);
        }
    };

    const handleRefresh = async () => {
        try {
            await jellyfinApi.reportCapabilities();
        } catch (e) {
            console.error('Refresh report failed:', e);
        }
    };

    const [signingOutId, setSigningOutId] = React.useState<string | null>(null);

    const renderDeviceItem = (session: RemoteSession, isSelected: boolean) => {
        const isDesktop = session.Client.toLowerCase().includes('web') ||
            session.Client.toLowerCase().includes('desktop') ||
            session.DeviceName.toLowerCase().includes('pc') ||
            session.DeviceName.toLowerCase().includes('computer');
        const Icon = isDesktop ? Monitor : Headphones;

        return (
            <View key={session.Id} style={[styles.deviceItemContainer, { borderBottomColor: colors.border }]}>
                <TouchableOpacity
                    style={[styles.deviceItem, isSelected && styles.selectedItem]}
                    onPress={() => handleSelectDevice(session.Id)}
                >
                    <View style={[styles.iconContainer, { backgroundColor: colors.surface }, isSelected && { backgroundColor: colors.accentSoft }]}>
                        <Icon size={24} color={isSelected ? colors.accent : colors.text} />
                    </View>
                    <View style={styles.deviceInfo}>
                        <Text style={[styles.deviceName, { color: isSelected ? colors.accent : colors.text }]}>
                            {isSelected && 'Now Playing on '}
                            {session.DeviceName}
                        </Text>
                        {isSelected && <Text style={[styles.connectedText, { color: colors.accent }]}>Connected</Text>}
                    </View>

                    {isSelected ? (
                        <Check size={20} color={colors.accent} />
                    ) : (
                        <TouchableOpacity
                            onPress={() => setSigningOutId(signingOutId === session.Id ? null : session.Id)}
                            style={styles.arrowContainer}
                        >
                            <ChevronRight size={20} color={colors.textMuted} />
                        </TouchableOpacity>
                    )}
                </TouchableOpacity>

                {!isSelected && signingOutId === session.Id && (
                    <TouchableOpacity
                        style={[styles.signOutButton, { backgroundColor: colors.surface }]}
                        onPress={() => {
                            handleSignOut(session.Id);
                            setSigningOutId(null);
                        }}
                    >
                        <Text style={[styles.signOutText, { color: colors.danger }]}>Sign out from device</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <View
            style={[
                styles.container,
                { backgroundColor: colors.background, borderTopColor: colors.border },
            ]}
        >
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Text style={[styles.title, { color: colors.text }]}>Connect to a device</Text>
                    <TouchableOpacity
                        onPress={handleRefresh}
                        style={styles.refreshButton}
                        accessibilityLabel="Refresh device list"
                    >
                        <RefreshCw size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
                    <X size={24} color={colors.text} />
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.scroll}>
                {renderDeviceItem({
                    Id: 'local',
                    DeviceName: 'This phone',
                    Client: 'Jellyspot',
                    SupportsRemoteControl: true,
                    DeviceId: 'self'
                } as any, !targetSessionId || targetSessionId === 'local')}

                {sortedSessions.map(session => renderDeviceItem(session, targetSessionId === session.Id))}
            </ScrollView>

            {targetSessionId && targetSessionId !== 'local' && (
                <View style={[styles.footer, { borderTopColor: colors.border }]}>
                    <View style={styles.volumeContainer}>
                        <Volume2 size={20} color={colors.text} />
                        <Slider
                            style={styles.slider}
                            minimumValue={0}
                            maximumValue={100}
                            value={useRemoteStore.getState().volumeLevel}
                            onValueChange={(val) => {
                                useRemoteStore.getState().setVolumeLevel(val);
                                webSocketService.sendCommand(targetSessionId, 'SetVolume', { Volume: val });
                            }}
                            minimumTrackTintColor={colors.accent}
                            maximumTrackTintColor={colors.border}
                            thumbTintColor={colors.accent}
                        />
                    </View>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        // Background and top border are supplied inline from the theme.
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: 20,
        maxHeight: '80%',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        // Colour is supplied inline from the theme.
        fontSize: 20,
        fontWeight: 'bold',
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    refreshButton: {
        marginLeft: 10,
        padding: 5,
    },
    scroll: {
        marginBottom: 10,
    },
    deviceItemContainer: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        // Border colour is supplied inline from the theme.
    },
    deviceItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 15,
    },
    selectedItem: {
        // Option to highlight further
    },
    arrowContainer: {
        padding: 5,
    },
    signOutButton: {
        // Background is supplied inline from the theme.
        padding: 12,
        borderRadius: 8,
        marginBottom: 10,
        alignItems: 'center',
    },
    signOutText: {
        // Colour is supplied inline from the theme.
        fontSize: 14,
        fontWeight: '500',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        // Background is supplied inline from the theme.
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    deviceInfo: {
        flex: 1,
    },
    deviceName: {
        // Colour is supplied inline from the theme.
        fontSize: 16,
        fontWeight: '500',
    },
    connectedText: {
        // Colour is supplied inline from the theme.
        fontSize: 12,
        marginTop: 2,
    },
    footer: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        // Border colour is supplied inline from the theme.
    },
    volumeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
    },
    slider: {
        flex: 1,
        height: 40,
        marginLeft: 10,
    },
});
