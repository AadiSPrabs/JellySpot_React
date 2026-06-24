import React, { useState, useEffect, useRef } from "react";
import { View, BackHandler, ToastAndroid, Platform } from "react-native";
import {
  NavigationContainer,
  NavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { RootStackParamList } from "../types/navigation";
import AuthNavigator from "./AuthNavigator";
import MainNavigator from "./MainNavigator";
import PlayerScreen from "../screens/PlayerScreen";
import QueueScreen from "../screens/QueueScreen";
import OnboardingScreen from "../screens/OnboardingScreen";
import { useAuthStore } from "../store/authStore";
import { usePlayerStore } from "../store/playerStore";
import { useSettingsStore } from "../store/settingsStore";
import { StatusBar } from "expo-status-bar";
import SettingsScreen from "../screens/SettingsScreen";
import StatsScreen from "../screens/StatsScreen";
import AppearanceScreen from "../screens/AppearanceScreen";
import PlaybackSettingsScreen from "../screens/PlaybackSettingsScreen";
import StorageSettingsScreen from "../screens/StorageSettingsScreen";
import SourceModeSettingsScreen from "../screens/SourceModeSettingsScreen";
import DownloadSettingsScreen from "../screens/DownloadSettingsScreen";
import DependenciesScreen from "../screens/DependenciesScreen";
import MiniPlayer from "../components/MiniPlayer";
import GlobalPlayer from "../components/GlobalPlayer";
import { useTheme } from "react-native-paper";

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
  const navigationRef =
    React.useRef<NavigationContainerRef<RootStackParamList>>(null);

  const backPressRef = useRef(false);
  const backTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const onBackPress = () => {
      const nav = navigationRef.current;
      if (!nav) return false;

      const { isPlayerExpanded, setPlayerExpanded } = usePlayerStore.getState();

      // Collapse fullscreen player on back press
      if (isPlayerExpanded) {
        setPlayerExpanded(false);
        return true;
      }

      if (nav.canGoBack()) return false;

      if (backPressRef.current) {
        if (backTimerRef.current) clearTimeout(backTimerRef.current);
        backPressRef.current = false;
        return false;
      }

      backPressRef.current = true;
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      backTimerRef.current = setTimeout(() => {
        backPressRef.current = false;
      }, 2000);

      return true;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, []);

  // Determine if Jellyfin auth is needed
  // Auth is required if sourceMode includes jellyfin (jellyfin or both) AND user is not authenticated
  const needsJellyfinAuth =
    (sourceMode === "jellyfin" || sourceMode === "both") && !isAuthenticated;

  // Can access main if:
  // - local-only mode
  // - OR authenticated for jellyfin
  // - OR in 'both' mode but chose to use local (skipped jellyfin login)
  const canAccessMain =
    sourceMode === "local" ||
    isAuthenticated ||
    (sourceMode === "both" && dataSource === "local");

  // Show onboarding first if not completed
  if (!onboardingComplete) {
    return (
      <NavigationContainer theme={theme as any} ref={navigationRef}>
        <StatusBar style="light" />
        <OnboardingScreen />
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer theme={theme as any} ref={navigationRef}>
      <StatusBar style="light" />
      <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            animation: "slide_from_right",
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          {canAccessMain ? (
            <>
              <Stack.Screen name="Main" component={MainShell} />
              <Stack.Screen
                name="Queue"
                component={QueueScreen}
                options={{
                  presentation: "transparentModal",
                  animation: "slide_from_right",
                  animationDuration: 200, // Quicker transition
                  contentStyle: { backgroundColor: theme.colors.background },
                }}
              />
              {/* Common Settings Stack */}
              <Stack.Group
                screenOptions={{
                  animation: "slide_from_right",
                  animationDuration: 200,
                  contentStyle: { backgroundColor: theme.colors.background },
                }}
              >
                <Stack.Screen name="Settings" component={SettingsScreen} />
                <Stack.Screen name="Stats" component={StatsScreen} />
                <Stack.Screen name="Appearance" component={AppearanceScreen} />
                <Stack.Screen
                  name="PlaybackSettings"
                  component={PlaybackSettingsScreen}
                />
                <Stack.Screen
                  name="StorageSettings"
                  component={StorageSettingsScreen}
                />
                <Stack.Screen
                  name="SourceModeSettings"
                  component={SourceModeSettingsScreen}
                />
                <Stack.Screen
                  name="DownloadSettings"
                  component={DownloadSettingsScreen}
                />
                <Stack.Screen
                  name="Dependencies"
                  component={DependenciesScreen}
                />
              </Stack.Group>
            </>
          ) : (
            <Stack.Screen name="Auth" component={AuthNavigator} />
          )}
        </Stack.Navigator>
      </View>
    </NavigationContainer>
  );
}
