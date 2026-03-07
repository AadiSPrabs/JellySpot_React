import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useRemoteStore } from '../store/remoteStore';
import { Monitor, Headphones, Volume2 } from 'lucide-react-native';

export const RemoteVolumeIndicator = () => {
    const { showVolumeIndicator, volumeLevel, targetSessionId, activeSessions } = useRemoteStore();
    const fadeAnim = useRef(new Animated.Value(0)).current;

    const selectedSession = activeSessions.find(s => s.Id === targetSessionId);
    const isDesktop = selectedSession?.Client.toLowerCase().includes('web') || selectedSession?.Client.toLowerCase().includes('desktop');
    const Icon = isDesktop ? Monitor : Headphones;

    useEffect(() => {
        if (showVolumeIndicator) {
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
            }).start();

            const timer = setTimeout(() => {
                useRemoteStore.getState().setShowVolumeIndicator(false);
            }, 2000);

            return () => clearTimeout(timer);
        } else {
            Animated.timing(fadeAnim, {
                toValue: 0,
                duration: 300,
                useNativeDriver: true,
            }).start();
        }
    }, [showVolumeIndicator]);

    return (
        <Animated.View style={[styles.container, { opacity: fadeAnim }]} pointerEvents="none">
            <View style={styles.content}>
                <View style={styles.iconRow}>
                    <Icon size={18} color="#fff" style={styles.deviceIcon} />
                    <Volume2 size={18} color="#fff" />
                </View>
                <View style={styles.barBackground}>
                    <View style={[styles.barFill, { width: `${volumeLevel}%` }]} />
                </View>
            </View>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        top: 50,
        left: '20%',
        right: '20%',
        alignItems: 'center',
        zIndex: 10000,
    },
    content: {
        backgroundColor: 'rgba(20, 20, 20, 0.95)',
        borderRadius: 30,
        paddingHorizontal: 20,
        paddingVertical: 12,
        flexDirection: 'column',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 8,
        width: '100%',
    },
    iconRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    deviceIcon: {
        marginRight: 6,
    },
    barBackground: {
        height: 4,
        backgroundColor: '#333',
        borderRadius: 2,
        width: '100%',
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        backgroundColor: '#1DB954',
    },
});
