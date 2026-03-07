import React, { useState } from 'react';
import { View } from 'react-native';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types/navigation';
import AuthNavigator from './AuthNavigator';
import MainNavigator from './MainNavigator';
import PlayerScreen from '../screens/PlayerScreen';
import QueueScreen from '../screens/QueueScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import { useAuthStore } from '../store/authStore';
import { usePlayerStore } from '../store/playerStore';
import { useSettingsStore } from '../store/settingsStore';
import { StatusBar } from 'expo-status-bar';
import MiniPlayer from '../components/MiniPlayer';
import GlobalPlayer from '../components/GlobalPlayer';
import { useTheme } from 'react-native-paper';

const Stack = createNativeStackNavigator<RootStackParamList>();

const MainShell = () => {
    const theme = useTheme();
    return (
        <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
            <MainNavigator />
            <GlobalPlayer />
        </View>
    );
};

export default function RootNavigator() {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const currentTrack = usePlayerStore((state) => state.currentTrack);
    const { onboardingComplete, sourceMode, dataSource } = useSettingsStore();
    const theme = useTheme();
    const navigationRef = React.useRef<NavigationContainerRef<RootStackParamList>>(null);

    // Show onboarding first if not completed
    if (!onboardingComplete) {
        return (
            <NavigationContainer theme={theme as any}>
                <StatusBar style="light" />
                <OnboardingScreen />
            </NavigationContainer>
        );
    }

    // Determine if Jellyfin auth is needed
    // Auth is required if sourceMode includes jellyfin (jellyfin or both) AND user is not authenticated
    const needsJellyfinAuth = (sourceMode === 'jellyfin' || sourceMode === 'both') && !isAuthenticated;

    // Can access main if:
    // - local-only mode
    // - OR authenticated for jellyfin
    // - OR in 'both' mode but chose to use local (skipped jellyfin login)
    const canAccessMain = sourceMode === 'local' || isAuthenticated || (sourceMode === 'both' && dataSource === 'local');

    return (
        <NavigationContainer
            theme={theme as any}
            ref={navigationRef}
        >
            <StatusBar style="light" />
            <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
                <Stack.Navigator
                    screenOptions={{
                        headerShown: false,
                        animation: 'slide_from_right',
                        contentStyle: { backgroundColor: theme.colors.background }
                    }}
                >
                    {canAccessMain ? (
                        <>
                            <Stack.Screen name="Main" component={MainShell} />
                            <Stack.Screen
                                name="Queue"
                                component={QueueScreen}
                                options={{
                                    presentation: 'transparentModal',
                                    animation: 'slide_from_right',
                                    animationDuration: 200, // Quicker transition
                                    contentStyle: { backgroundColor: theme.colors.background }
                                }}
                            />
                        </>
                    ) : (
                        <Stack.Screen name="Auth" component={AuthNavigator} />
                    )}
                </Stack.Navigator>
            </View>
        </NavigationContainer>
    );
}
