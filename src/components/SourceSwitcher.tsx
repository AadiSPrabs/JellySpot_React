import React, { useRef, useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Animated, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useSettingsStore } from '../store/settingsStore';
import { useAuthStore } from '../store/authStore';
import { useNavigation, CommonActions } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const SourceSwitcher = () => {
    const { dataSource, setDataSource } = useSettingsStore();
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
    const theme = useTheme();

    const [containerWidth, setContainerWidth] = React.useState(0);

    // Animation values
    const slideAnim = useRef(new Animated.Value(dataSource === 'jellyfin' ? 0 : 1)).current;
    const scaleJellyfin = useRef(new Animated.Value(dataSource === 'jellyfin' ? 1 : 0.97)).current;
    const scaleLocal = useRef(new Animated.Value(dataSource === 'local' ? 1 : 0.97)).current;

    useEffect(() => {
        const isJellyfin = dataSource === 'jellyfin';

        Animated.parallel([
            Animated.spring(slideAnim, {
                toValue: isJellyfin ? 0 : 1,
                useNativeDriver: true, // Now uses native driver because we animate transform
                speed: 18,
                bounciness: 2,
            }),
            Animated.spring(scaleJellyfin, {
                toValue: isJellyfin ? 1 : 0.97,
                useNativeDriver: true,
                speed: 15,
            }),
            Animated.spring(scaleLocal, {
                toValue: isJellyfin ? 0.97 : 1,
                useNativeDriver: true,
                speed: 15,
            }),
        ]).start();
    }, [dataSource]);

    const handleSwitch = (source: 'jellyfin' | 'local') => {
        if (source === dataSource) return;

        if (source === 'jellyfin' && !isAuthenticated) {
            navigation.navigate('SourceModeSettings' as any);
            return;
        }

        setDataSource(source);

        // setDataSource(source) is already called above, which will trigger
        // re-renders in all screens watching dataSource.
        // No need for a full navigation reset which causes jumping/flickering.
    };

    // Calculate sliding indicator position and width
    // Use pixel spacing for perfect alignment (4px padding)
    const indicatorWidth = containerWidth > 0 ? (containerWidth - 8) / 2 : 0;
    const indicatorTranslateX = slideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, (containerWidth / 2) - 4], // Subtract padding to align perfectly on the right
    });

    return (
        <View
            style={[
                styles.container,
                {
                    backgroundColor: theme.colors.elevation.level2,
                    borderColor: theme.colors.outlineVariant,
                    borderWidth: 0.5,
                    width: 220, // Fixed width for consistent look
                }
            ]}
            onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
        >
            {/* Animated sliding indicator with shadow */}
            {containerWidth > 0 && (
                <Animated.View
                    style={[
                        styles.indicator,
                        {
                            backgroundColor: theme.colors.secondaryContainer,
                            left: 4, // Initial static position
                            width: indicatorWidth,
                            transform: [{ translateX: indicatorTranslateX }],
                            // High-quality elevation/shadow
                            ...Platform.select({
                                ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3 },
                                android: { elevation: 3 },
                            }),
                        }
                    ]}
                />
            )}

            {/* Jellyfin option */}
            <TouchableOpacity
                style={[styles.option, { flex: 1 }]}
                onPress={() => handleSwitch('jellyfin')}
                activeOpacity={1}
            >
                <Animated.Text
                    style={[
                        styles.text,
                        { transform: [{ scale: scaleJellyfin }] },
                        dataSource === 'jellyfin'
                            ? { color: theme.colors.onSecondaryContainer, fontWeight: 'bold' }
                            : { color: theme.colors.onSurfaceVariant }
                    ]}
                >
                    Jellyfin
                </Animated.Text>
            </TouchableOpacity>

            {/* Local option */}
            <TouchableOpacity
                style={[styles.option, { flex: 1 }]}
                onPress={() => handleSwitch('local')}
                activeOpacity={1}
            >
                <Animated.Text
                    style={[
                        styles.text,
                        { transform: [{ scale: scaleLocal }] },
                        dataSource === 'local'
                            ? { color: theme.colors.onSecondaryContainer, fontWeight: 'bold' }
                            : { color: theme.colors.onSurfaceVariant }
                    ]}
                >
                    Local
                </Animated.Text>
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        borderRadius: 24, // Rounder for a pill look
        padding: 4,
        position: 'relative',
        overflow: 'hidden',
    },
    indicator: {
        position: 'absolute',
        top: 4,
        bottom: 4,
        borderRadius: 20,
    },
    option: {
        paddingVertical: 8, // Taller options
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1, // Ensure text is above indicator
    },
    text: {
        fontSize: 14, // Slightly bigger
    }
});
