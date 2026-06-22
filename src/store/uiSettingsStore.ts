import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, persist } from 'zustand/middleware';

export type BackgroundType = 'off' | 'blurred' | 'dominant';

interface UISettingsState {
    adaptiveBackground: boolean;
    backgroundType: BackgroundType;
    themeColor: string;
    isAmoledMode: boolean;
    showTechnicalDetails: boolean;
    setAdaptiveBackground: (enabled: boolean) => void;
    setBackgroundType: (type: BackgroundType) => void;
    setThemeColor: (color: string) => void;
    setAmoledMode: (enabled: boolean) => void;
    setShowTechnicalDetails: (enabled: boolean) => void;
}

export const useUISettingsStore = create<UISettingsState>()(
    persist(
        (set) => ({
            adaptiveBackground: true,
            backgroundType: 'blurred',
            themeColor: '#D0BCFF',
            isAmoledMode: false,
            showTechnicalDetails: false,

            setAdaptiveBackground: (enabled) => set({ adaptiveBackground: enabled }),
            setBackgroundType: (type) => set({
                backgroundType: type,
                adaptiveBackground: type !== 'off'
            }),
            setThemeColor: (color) => set({ themeColor: color }),
            setAmoledMode: (enabled) => set({ isAmoledMode: enabled }),
            setShowTechnicalDetails: (enabled) => set({ showTechnicalDetails: enabled }),
        }),
        {
            name: 'ui-settings-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
