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

    // Animation values
    const slideAnim = useRef(new Animated.Value(dataSource === 'jellyfin' ? 0 : 1)).current;
    const scaleJellyfin = useRef(new Animated.Value(dataSource === 'jellyfin' ? 1 : 0.95)).current;
    const scaleLocal = useRef(new Animated.Value(dataSource === 'local' ? 1 : 0.95)).current;

    useEffect(() => {
        const isJellyfin = dataSource === 'jellyfin';

        // Animate the sliding indicator
        Animated.parallel([
            Animated.spring(slideAnim, {
                toValue: isJellyfin ? 0 : 1,
                useNativeDriver: false,
                speed: 15,
                bounciness: 4,
            }),
            Animated.spring(scaleJellyfin, {
                toValue: isJellyfin ? 1 : 0.95,
                useNativeDriver: true,
                speed: 15,
            }),
            Animated.spring(scaleLocal, {
                toValue: isJellyfin ? 0.95 : 1,
                useNativeDriver: true,
                speed: 15,
            }),
        ]).start();
    }, [dataSource]);

    const handleSwitch = (source: 'jellyfin' | 'local') => {
        if (source === 'jellyfin' && !isAuthenticated) {
            // User wants to switch to Jellyfin but is not authenticated
            // Navigate to Source Mode settings to enter credentials
            // SourceSwitcher is rendered in HomeStack, so navigate directly
            navigation.navigate('SourceModeSettings' as any);
            return;
        }

        // Trigger LayoutAnimation for content change
        LayoutAnimation.configureNext({
            duration: 300,
            create: { type: 'easeOut', property: 'opacity' },
            update: { type: 'spring', springDamping: 0.7 },
            delete: { type: 'easeIn', property: 'opacity' },
        });
        setDataSource(source);

        // Reset Library and Search stacks to prevent invalid state persistence
        // We need to access the parent Loop (Tab Navigator) to modify sibling stacks
        const parentNav = navigation.getParent();
        if (parentNav) {
            parentNav.dispatch(state => {
                // Keep the current routes but strip the state from Library and Search
                const routes = state.routes.map(r => {
                    if (r.name === 'LibraryStack' || r.name === 'SearchStack') {
                        // Return the route without its nested state (resetting it)
                        return { name: r.name, key: r.key };
                    }
                    return r;
                });

                return CommonActions.reset({
                    ...state,
                    routes,
                    index: state.index,
                });
            });
        }
    };

    // Calculate sliding indicator position
    const indicatorLeft = slideAnim.interpolate({
        inputRange: [0, 1],
        outputRange: ['0%', '50%'],
    });

    return (
        <View style={[styles.container, { backgroundColor: theme.colors.elevation.level1 }]}>
            {/* Animated sliding indicator */}
            <Animated.View
                style={[
                    styles.indicator,
                    {
                        backgroundColor: theme.colors.primaryContainer,
                        left: indicatorLeft,
                    }
                ]}
            />

            {/* Jellyfin option */}
            <Animated.View style={{ flex: 1, transform: [{ scale: scaleJellyfin }] }}>
                <TouchableOpacity
                    style={styles.option}
                    onPress={() => handleSwitch('jellyfin')}
                    activeOpacity={0.7}
                >
                    <Text
                        style={[
                            styles.text,
                            dataSource === 'jellyfin'
                                ? { color: theme.colors.onPrimaryContainer, fontWeight: 'bold' }
                                : { color: theme.colors.onSurfaceVariant }
                        ]}
                    >
                        Jellyfin
                    </Text>
                </TouchableOpacity>
            </Animated.View>

            {/* Local option */}
            <Animated.View style={{ flex: 1, transform: [{ scale: scaleLocal }] }}>
                <TouchableOpacity
                    style={styles.option}
                    onPress={() => handleSwitch('local')}
                    activeOpacity={0.7}
                >
                    <Text
                        style={[
                            styles.text,
                            dataSource === 'local'
                                ? { color: theme.colors.onPrimaryContainer, fontWeight: 'bold' }
                                : { color: theme.colors.onSurfaceVariant }
                        ]}
                    >
                        Local
                    </Text>
                </TouchableOpacity>
            </Animated.View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        borderRadius: 20,
        padding: 4,
        position: 'relative',
        overflow: 'hidden',
    },
    indicator: {
        position: 'absolute',
        top: 4,
        bottom: 4,
        width: '50%',
        borderRadius: 16,
    },
    option: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        fontSize: 12,
    }
});
