import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, persist } from 'zustand/middleware';

export type BackgroundType = 'off' | 'blurred' | 'blurhash';
export type SourceMode = 'jellyfin' | 'local' | 'both';

interface LocalProfile {
    name: string;
    imageUri: string | null;
}

interface SettingsState {
    adaptiveBackground: boolean;
    backgroundType: BackgroundType;
    themeColor: string;
    audioQuality: 'lossless' | 'high' | 'low' | 'auto';
    setAdaptiveBackground: (enabled: boolean) => void;
    setBackgroundType: (type: BackgroundType) => void;
    setThemeColor: (color: string) => void;
    setAudioQuality: (quality: 'lossless' | 'high' | 'low' | 'auto') => void;
    dataSource: 'jellyfin' | 'local';
    setDataSource: (source: 'jellyfin' | 'local') => void;
    // Source mode settings
    sourceMode: SourceMode;
    setSourceMode: (mode: SourceMode) => void;
    onboardingComplete: boolean;
    setOnboardingComplete: (complete: boolean) => void;
    // Local profile settings (for local-only mode)
    localProfile: LocalProfile;
    setLocalProfile: (profile: Partial<LocalProfile>) => void;
    isAmoledMode: boolean;
    setAmoledMode: (enabled: boolean) => void;
    showTechnicalDetails: boolean;
    setShowTechnicalDetails: (enabled: boolean) => void;
    // Download settings
    downloadPath: string | null; // null = default (documentDirectory/downloads)
    setDownloadPath: (path: string | null) => void;
    maxConcurrentDownloads: number; // 1-5 simultaneous downloads
    setMaxConcurrentDownloads: (count: number) => void;
    wifiOnlyDownloads: boolean;
    setWifiOnlyDownloads: (enabled: boolean) => void;
    // Jellyfin library selection (empty array = all libraries)
    selectedJellyfinLibraries: string[];
    setSelectedJellyfinLibraries: (libraryIds: string[]) => void;
    // Lyrics offset dictionary mapping TrackID -> Offset in milliseconds (positive = show earlier)
    lyricsOffsets: Record<string, number>;
    setLyricsOffset: (trackId: string, offset: number) => void;
    // Playback speed (0.5 - 2.0, default 1.0)
    playbackRate: number;
    setPlaybackRate: (rate: number) => void;
    // External Lyrics Preference
    lyricsSourcePreference: 'jellyfin' | 'lrclib' | 'offline-only';
    setLyricsSourcePreference: (pref: 'jellyfin' | 'lrclib' | 'offline-only') => void;
    // Lyrics Translation
    translationLanguages: Record<string, string>; // Maps trackId -> lang code
    setTranslationLanguage: (trackId: string, lang: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            adaptiveBackground: true,
            backgroundType: 'blurred', // Default to blurred image
            themeColor: '#D0BCFF', // Default Primary
            audioQuality: 'lossless',
            dataSource: 'jellyfin',
            sourceMode: 'both', // Default to both until onboarding
            onboardingComplete: false,
            localProfile: {
                name: 'User',
                imageUri: null,
            },
            isAmoledMode: false,
            showTechnicalDetails: false,
            downloadPath: null, // null = default location
            maxConcurrentDownloads: 1, // default to 1 at a time
            wifiOnlyDownloads: false, // allow downloads on any network by default
            selectedJellyfinLibraries: [], // empty = all libraries
            lyricsOffsets: {}, // Default empty map
            playbackRate: 1.0, // Default normal speed
            lyricsSourcePreference: 'lrclib', // Default to prioritize LRCLIB
            translationLanguages: {}, // Map of trackId to language

            setAdaptiveBackground: (enabled) => set({ adaptiveBackground: enabled }),
            setBackgroundType: (type) => set({
                backgroundType: type,
                adaptiveBackground: type !== 'off'
            }),
            setThemeColor: (color) => set({ themeColor: color }),
            setAudioQuality: (quality) => set({ audioQuality: quality }),
            setDataSource: (source) => set({ dataSource: source }),
            setSourceMode: (mode) => set({ sourceMode: mode }),
            setOnboardingComplete: (complete) => set({ onboardingComplete: complete }),
            setLocalProfile: (profile) => set((state) => ({
                localProfile: { ...state.localProfile, ...profile }
            })),
            setAmoledMode: (enabled) => set({ isAmoledMode: enabled }),
            setShowTechnicalDetails: (enabled) => set({ showTechnicalDetails: enabled }),
            setDownloadPath: (path) => set({ downloadPath: path }),
            setMaxConcurrentDownloads: (count) => set({ maxConcurrentDownloads: count }),
            setWifiOnlyDownloads: (enabled) => set({ wifiOnlyDownloads: enabled }),
            setSelectedJellyfinLibraries: (libraryIds) => set({ selectedJellyfinLibraries: libraryIds }),
            setLyricsOffset: (trackId, offset) => set((state) => ({
                lyricsOffsets: {
                    ...state.lyricsOffsets,
                    [trackId]: offset
                }
            })),
            setPlaybackRate: (rate) => set({ playbackRate: Math.max(0.5, Math.min(2.0, rate)) }),
            setLyricsSourcePreference: (pref) => set({ lyricsSourcePreference: pref }),
            setTranslationLanguage: (trackId, lang) => set((state) => ({
                translationLanguages: {
                    ...state.translationLanguages,
                    [trackId]: lang
                }
            })),
        }),
        {
            name: 'settings-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
