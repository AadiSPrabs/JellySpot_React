import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, persist } from 'zustand/middleware';

export type SourceMode = 'jellyfin' | 'local' | 'both';

export interface LocalProfile {
    name: string;
    imageUri: string | null;
}

interface SettingsState {
    dataSource: 'jellyfin' | 'local';
    setDataSource: (source: 'jellyfin' | 'local') => void;
    sourceMode: SourceMode;
    setSourceMode: (mode: SourceMode) => void;
    onboardingComplete: boolean;
    setOnboardingComplete: (complete: boolean) => void;
    localProfile: LocalProfile;
    setLocalProfile: (profile: Partial<LocalProfile>) => void;
    downloadPath: string | null;
    setDownloadPath: (path: string | null) => void;
    maxConcurrentDownloads: number;
    setMaxConcurrentDownloads: (count: number) => void;
    wifiOnlyDownloads: boolean;
    setWifiOnlyDownloads: (enabled: boolean) => void;
    selectedJellyfinLibraries: string[];
    setSelectedJellyfinLibraries: (libraryIds: string[]) => void;
    audioQuality: 'lossless' | 'high' | 'low' | 'auto';
    setAudioQuality: (quality: 'lossless' | 'high' | 'low' | 'auto') => void;
    lyricsSourcePreference: 'jellyfin' | 'lrclib' | 'offline-only';
    setLyricsSourcePreference: (pref: 'jellyfin' | 'lrclib' | 'offline-only') => void;
    preferJellyfinLyrics: boolean;
    setPreferJellyfinLyrics: (prefer: boolean) => void;
    queueLimit: number;
    setQueueLimit: (limit: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            dataSource: 'jellyfin',
            sourceMode: 'both',
            onboardingComplete: false,
            localProfile: {
                name: 'User',
                imageUri: null,
            },
            downloadPath: null,
            maxConcurrentDownloads: 1,
            wifiOnlyDownloads: false,
            selectedJellyfinLibraries: [],
            audioQuality: 'lossless',
            lyricsSourcePreference: 'lrclib',
            preferJellyfinLyrics: false,
            queueLimit: 500,

            setDataSource: (source) => set({ dataSource: source }),
            setSourceMode: (mode) => set({ sourceMode: mode }),
            setOnboardingComplete: (complete) => set({ onboardingComplete: complete }),
            setLocalProfile: (profile) => set((state) => ({
                localProfile: { ...state.localProfile, ...profile }
            })),
            setDownloadPath: (path) => set({ downloadPath: path }),
            setMaxConcurrentDownloads: (count) => set({ maxConcurrentDownloads: count }),
            setWifiOnlyDownloads: (enabled) => set({ wifiOnlyDownloads: enabled }),
            setSelectedJellyfinLibraries: (libraryIds) => set({ selectedJellyfinLibraries: libraryIds }),
            setAudioQuality: (quality) => set({ audioQuality: quality }),
            setLyricsSourcePreference: (pref) => set({ lyricsSourcePreference: pref }),
            setPreferJellyfinLyrics: (prefer) => set({ preferJellyfinLyrics: prefer }),
            setQueueLimit: (limit) => set({ queueLimit: limit }),
        }),
        {
            name: 'settings-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
