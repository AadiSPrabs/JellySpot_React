import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { useRemoteStore, RemoteSession } from '../store/remoteStore';
import { Monitor, Headphones, ChevronRight, Volume2, X, Check } from 'lucide-react-native';
import Slider from '@react-native-community/slider';
import { webSocketService } from '../services/WebSocketService';
import { jellyfinApi } from '../api/jellyfin';
import { RefreshCw } from 'lucide-react-native';

export const ConnectMenu = ({ onClose }: { onClose: () => void }) => {
    const { activeSessions, targetSessionId, setTargetSessionId } = useRemoteStore();

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
            <View key={session.Id} style={styles.deviceItemContainer}>
                <TouchableOpacity
                    style={[styles.deviceItem, isSelected && styles.selectedItem]}
                    onPress={() => handleSelectDevice(session.Id)}
                >
                    <View style={[styles.iconContainer, isSelected && styles.selectedIcon]}>
                        <Icon size={24} color={isSelected ? '#1DB954' : '#fff'} />
                    </View>
                    <View style={styles.deviceInfo}>
                        <Text style={[styles.deviceName, isSelected && styles.selectedText]}>
                            {isSelected && 'Now Playing on '}
                            {session.DeviceName}
                        </Text>
                        {isSelected && <Text style={styles.connectedText}>Connected</Text>}
                    </View>

                    {isSelected ? (
                        <Check size={20} color="#1DB954" />
                    ) : (
                        <TouchableOpacity
                            onPress={() => setSigningOutId(signingOutId === session.Id ? null : session.Id)}
                            style={styles.arrowContainer}
                        >
                            <ChevronRight size={20} color="#999" />
                        </TouchableOpacity>
                    )}
                </TouchableOpacity>

                {!isSelected && signingOutId === session.Id && (
                    <TouchableOpacity
                        style={styles.signOutButton}
                        onPress={() => {
                            handleSignOut(session.Id);
                            setSigningOutId(null);
                        }}
                    >
                        <Text style={styles.signOutText}>Sign out from device</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.titleRow}>
                    <Text style={styles.title}>Connect to a device</Text>
                    <TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
                        <RefreshCw size={20} color="#999" />
                    </TouchableOpacity>
                </View>
                <TouchableOpacity onPress={onClose}>
                    <X size={24} color="#fff" />
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
                <View style={styles.footer}>
                    <View style={styles.volumeContainer}>
                        <Volume2 size={20} color="#fff" />
                        <Slider
                            style={styles.slider}
                            minimumValue={0}
                            maximumValue={100}
                            value={useRemoteStore.getState().volumeLevel}
                            onValueChange={(val) => {
                                useRemoteStore.getState().setVolumeLevel(val);
                                webSocketService.sendCommand(targetSessionId, 'SetVolume', { Volume: val });
                            }}
                            minimumTrackTintColor="#1DB954"
                            maximumTrackTintColor="#333"
                            thumbTintColor="#1DB954"
                        />
                    </View>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#121212',
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
        color: '#fff',
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
        borderBottomColor: '#333',
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
        backgroundColor: '#282828',
        padding: 12,
        borderRadius: 8,
        marginBottom: 10,
        alignItems: 'center',
    },
    signOutText: {
        color: '#ff4444',
        fontSize: 14,
        fontWeight: '500',
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#282828',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    selectedIcon: {
        backgroundColor: 'rgba(29, 185, 84, 0.1)',
    },
    deviceInfo: {
        flex: 1,
    },
    deviceName: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    selectedText: {
        color: '#1DB954',
    },
    connectedText: {
        color: '#1DB954',
        fontSize: 12,
        marginTop: 2,
    },
    footer: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: '#333',
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
