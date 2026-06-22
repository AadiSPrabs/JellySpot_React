import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, persist } from 'zustand/middleware';

interface PlaybackSettingsState {
    playbackRate: number;
    lyricsOffsets: Record<string, number>;
    translationLanguages: Record<string, string>;
    setPlaybackRate: (rate: number) => void;
    setLyricsOffset: (trackId: string, offset: number) => void;
    setTranslationLanguage: (trackId: string, lang: string) => void;
}

export const usePlaybackSettingsStore = create<PlaybackSettingsState>()(
    persist(
        (set) => ({
            playbackRate: 1.0,
            lyricsOffsets: {},
            translationLanguages: {},

            setPlaybackRate: (rate) => set({ playbackRate: Math.max(0.5, Math.min(2.0, rate)) }),
            setLyricsOffset: (trackId, offset) => set((state) => ({
                lyricsOffsets: {
                    ...state.lyricsOffsets,
                    [trackId]: offset
                }
            })),
            setTranslationLanguage: (trackId, lang) => set((state) => ({
                translationLanguages: {
                    ...state.translationLanguages,
                    [trackId]: lang
                }
            })),
        }),
        {
            name: 'playback-settings-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
