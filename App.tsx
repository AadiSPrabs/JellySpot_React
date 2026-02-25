import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RootNavigator from './src/navigation/RootNavigator';

import { PaperProvider } from 'react-native-paper';
import { theme } from './src/theme/theme';

import { useSettingsStore } from './src/store/settingsStore';

// Helper to darken a hex color
function darkenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `#${Math.round(r * (1 - factor)).toString(16).padStart(2, '0')}${Math.round(g * (1 - factor)).toString(16).padStart(2, '0')}${Math.round(b * (1 - factor)).toString(16).padStart(2, '0')}`;
}

// Helper to lighten a hex color
function lightenColor(hex: string, factor: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `#${Math.min(255, Math.round(r + (255 - r) * factor)).toString(16).padStart(2, '0')}${Math.min(255, Math.round(g + (255 - g) * factor)).toString(16).padStart(2, '0')}${Math.min(255, Math.round(b + (255 - b) * factor)).toString(16).padStart(2, '0')}`;
}

function AppContent() {
  const { themeColor, isAmoledMode } = useSettingsStore();

  const dynamicTheme = {
    ...theme,
    colors: {
      ...theme.colors,
      primary: themeColor,
      primaryContainer: darkenColor(themeColor, 0.3),
      onPrimaryContainer: lightenColor(themeColor, 0.8),
      secondary: lightenColor(themeColor, 0.2),
      secondaryContainer: darkenColor(themeColor, 0.5),
      tertiary: themeColor,
      background: useSettingsStore.getState().isAmoledMode ? '#000000' : theme.colors.background,
      surface: useSettingsStore.getState().isAmoledMode ? '#000000' : theme.colors.surface,
      surfaceVariant: useSettingsStore.getState().isAmoledMode ? '#121212' : theme.colors.surfaceVariant,
      elevation: useSettingsStore.getState().isAmoledMode ? {
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

import { initializeDatabase } from './src/db/init';

export default function App() {
  React.useEffect(() => {
    // Initialize Database
    initializeDatabase();

    // Initialize player listeners
    usePlayerStore.getState().init();
  }, []);

  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}
