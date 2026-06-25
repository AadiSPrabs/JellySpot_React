import React from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import RootNavigator from "./src/navigation/RootNavigator";
import TrackPlayer from 'react-native-track-player';
import { PaperProvider } from "react-native-paper";
import { theme } from "./src/theme/theme";
import { useSettingsStore } from './src/store/settingsStore';
import { useUISettingsStore } from './src/store/uiSettingsStore';
import { usePlayerStore } from './src/store/playerStore';
import { useLocalLibraryStore } from './src/store/localLibraryStore';
import { useShallow } from 'zustand/react/shallow';
import { darkenHexColor, lightenHexColor } from './src/utils/colorUtils';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { OfflineIndicator } from './src/components/OfflineIndicator';
import { RemoteVolumeIndicator } from './src/components/RemoteVolumeIndicator';
import { webSocketService } from './src/services/WebSocketService';
import { setWebSocketService, setPlayerReset } from './src/store/authStore';
import { initializeDatabase } from './src/db/init';
import { useConnectivityStore } from './src/store/connectivityStore';

function AppContent() {
  const { themeColor, isAmoledMode } = useUISettingsStore(
    useShallow((s) => ({
      themeColor: s.themeColor,
      isAmoledMode: s.isAmoledMode,
    })),
  );

  const dynamicTheme = {
    ...theme,
    colors: {
      ...theme.colors,
      primary: themeColor,
      primaryContainer: darkenHexColor(themeColor, 0.3),
      onPrimaryContainer: lightenHexColor(themeColor, 0.8),
      secondary: lightenHexColor(themeColor, 0.2),
      secondaryContainer: darkenHexColor(themeColor, 0.5),
      tertiary: themeColor,
      // Use already-destructured isAmoledMode instead of getState() in render
      background: isAmoledMode ? "#000000" : theme.colors.background,
      surface: isAmoledMode ? "#000000" : theme.colors.surface,
      surfaceVariant: isAmoledMode ? "#121212" : theme.colors.surfaceVariant,
      elevation: isAmoledMode
        ? {
            level0: "transparent",
            level1: "#121212",
            level2: "#121212",
            level3: "#121212",
            level4: "#121212",
            level5: "#121212",
          }
        : theme.colors.elevation,
    },
  };

  return (
    <PaperProvider theme={dynamicTheme}>
      <RootNavigator />
    </PaperProvider>
  );
}

export default function App() {
  React.useEffect(() => {
    // Inject dependencies to break circular imports
    setWebSocketService(webSocketService);
    setPlayerReset(() => usePlayerStore.getState().reset);
    webSocketService.setDependencies({
      playerStore: usePlayerStore,
      waitForDeviceId: require('./src/api/jellyfin').waitForDeviceId,
      jellyfinApi: require('./src/api/jellyfin').jellyfinApi,
    });

    // Initialize Database and load local library tracks
    initializeDatabase();
    useLocalLibraryStore.getState().loadTracksFromDb();

    // Initialize player listeners
    usePlayerStore.getState().init();

    // Initialize network connectivity listener
    useConnectivityStore.getState().init();
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppContent />
          <OfflineIndicator />
          <RemoteVolumeIndicator />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
