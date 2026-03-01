import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import * as Network from 'expo-network';
import { useSettingsStore } from '../store/settingsStore';
import { useTheme } from 'react-native-paper';
import { CloudOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const OfflineIndicator = () => {
    const [isOffline, setIsOffline] = useState(false);
    const { dataSource, isAmoledMode } = useSettingsStore();
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const fadeAnim = useState(new Animated.Value(0))[0];

    useEffect(() => {
        let isMounted = true;

        const checkNetwork = async () => {
            try {
                const networkState = await Network.getNetworkStateAsync();
                if (isMounted) {
                    setIsOffline(!networkState.isConnected && !networkState.isInternetReachable);
                }
            } catch (error) {
                console.error('Network check error:', error);
            }
        };

        checkNetwork();

        // We aren't able to subscribe to expo-network events directly in a solid cross-platform way 
        // without @react-native-community/netinfo. So we poll occasionally or rely on the user.
        // For now, let's poll every 5s if we are using Jellyfin.
        const interval = setInterval(() => {
            if (dataSource !== 'local') {
                checkNetwork();
            }
        }, 5000);

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [dataSource]);

    useEffect(() => {
        // Only show if Jellyfin is part of the data source
        const shouldShow = isOffline && dataSource !== 'local';

        Animated.timing(fadeAnim, {
            toValue: shouldShow ? 1 : 0,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [isOffline, dataSource]);

    if (!isOffline || dataSource === 'local') return null;

    const backgroundColor = isAmoledMode ? '#000000' : theme.colors.elevation.level2;

    return (
        <Animated.View style={[
            styles.container,
            {
                opacity: fadeAnim,
                backgroundColor,
                bottom: insets.bottom + 85 // Above bottom nav (approx 80px)
            }
        ]}>
            <CloudOff size={16} color={theme.colors.error} />
            <Text style={[styles.text, { color: theme.colors.error }]}>
                Offline - Jellyfin unavailable
            </Text>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        zIndex: 1000,
    },
    text: {
        marginLeft: 8,
        fontSize: 12,
        fontWeight: '600',
    },
});
