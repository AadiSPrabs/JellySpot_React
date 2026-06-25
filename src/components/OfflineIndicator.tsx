import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useSettingsStore } from '../store/settingsStore';
import { useConnectivityStore } from '../store/connectivityStore';
import { useUISettingsStore } from '../store/uiSettingsStore';
import { useTheme } from 'react-native-paper';
import { CloudOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const OfflineIndicator = () => {
    const isOnline = useConnectivityStore((s) => s.isOnline);
    const { dataSource } = useSettingsStore();
    const { isAmoledMode } = useUISettingsStore();
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const prevOnline = useRef(isOnline);

    const isOffline = !isOnline;

    useEffect(() => {
        if (prevOnline.current !== isOnline) {
            prevOnline.current = isOnline;
        }

        const shouldShow = isOffline && dataSource !== "local";

        Animated.timing(fadeAnim, {
            toValue: shouldShow ? 1 : 0,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [isOffline, dataSource]);

    if (!isOffline || dataSource === "local") return null;

    const backgroundColor = isAmoledMode
        ? "#000000"
        : theme.colors.elevation.level2;

    return (
        <Animated.View
            style={[
                styles.container,
                {
                    opacity: fadeAnim,
                    backgroundColor,
                    bottom: insets.bottom + 85,
                },
            ]}
        >
            <CloudOff size={16} color={theme.colors.error} />
            <Text style={[styles.text, { color: theme.colors.error }]}>
                Offline - Jellyfin unavailable
            </Text>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: {
        position: "absolute",
        alignSelf: "center",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        elevation: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        zIndex: 1000,
    },
    text: {
        marginLeft: 8,
        fontSize: 12,
        fontWeight: "600",
    },
});
