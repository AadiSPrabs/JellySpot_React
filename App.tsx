import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import RootNavigator from './src/navigation/RootNavigator';

import { PaperProvider } from 'react-native-paper';
import { theme } from './src/theme/theme';

import { useSettingsStore } from './src/store/settingsStore';
import { darkenColor, lightenHexColor } from './src/utils/colorUtils';
import { ErrorBoundary } from './src/components/ErrorBoundary';

function AppContent() {
  const { themeColor, isAmoledMode } = useSettingsStore();

  // Use the shared colorUtils instead of duplicated helpers
  const darkenHex = (hex: string, factor: number): string => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const d = darkenColor(r, g, b, factor);
    return `#${d.r.toString(16).padStart(2, '0')}${d.g.toString(16).padStart(2, '0')}${d.b.toString(16).padStart(2, '0')}`;
  };

  const dynamicTheme = {
    ...theme,
    colors: {
      ...theme.colors,
      primary: themeColor,
      primaryContainer: darkenHex(themeColor, 0.3),
      onPrimaryContainer: lightenHexColor(themeColor, 0.8),
      secondary: lightenHexColor(themeColor, 0.2),
      secondaryContainer: darkenHex(themeColor, 0.5),
      tertiary: themeColor,
      // Use already-destructured isAmoledMode instead of getState() in render
      background: isAmoledMode ? '#000000' : theme.colors.background,
      surface: isAmoledMode ? '#000000' : theme.colors.surface,
      surfaceVariant: isAmoledMode ? '#121212' : theme.colors.surfaceVariant,
      elevation: isAmoledMode ? {
        level0: 'transparent',
        level1: '#121212',
        level2: '#121212',
        level3: '#121212',
        level4: '#121212',
        level5: '#121212',
      } : theme.colors.elevation,
    }
  };

  return (
    <PaperProvider theme={dynamicTheme}>
      <RootNavigator />
    </PaperProvider>
  );
}

import TrackPlayer from 'react-native-track-player';

import { usePlayerStore } from './src/store/playerStore';
import { useLocalLibraryStore } from './src/store/localLibraryStore';

import { initializeDatabase } from './src/db/init';

import { OfflineIndicator } from './src/components/OfflineIndicator';

export default function App() {
  React.useEffect(() => {
    // Initialize Database and load local library tracks
    initializeDatabase();
    useLocalLibraryStore.getState().loadTracksFromDb();

    // Initialize player listeners
    usePlayerStore.getState().init();
  }, []);

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <AppContent />
          <OfflineIndicator />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
