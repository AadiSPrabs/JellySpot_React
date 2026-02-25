import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage, persist } from 'zustand/middleware';

interface User {
    id: string;
    name: string;
    token: string;
}

interface AuthState {
    serverUrl: string | null;
    user: User | null;
    isAuthenticated: boolean;
    setServerUrl: (url: string) => void;
    login: (user: User) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            serverUrl: null,
            user: null,
            isAuthenticated: false,
            setServerUrl: (url) => set({ serverUrl: url }),
            login: (user) => set({ user, isAuthenticated: true }),
            logout: () => {
                // Stop playback and clear player state
                // We access the store directly to avoid circular dependency issues in imports if possible,
                // or just import it. Since authStore is imported IN playerStore, we might have a cycle if we import playerStore here.
                // However, accessing it via inline require or just assuming global access is tricky.
                // Better: Use a listener or just import it? 
                // Cycle: playerStore -> authStore (for token). authStore -> playerStore (for logout).
                // Solution: We can import usePlayerStore here. Zustand handles cycles fine usually if we use the hook/store instance.
                // But `usePlayerStore` is defined in `playerStore.ts`, which imports `useAuthStore`.
                // Let's try importing. If it crashes, we'll move the logic to a subscriber.

                // Actually, let's use the require here to be safe, or direct import if supported.
                // Direct import 'usePlayerStore' might return undefined if cycle.

                // Let's assume standard import works or use `require`.
                const { usePlayerStore } = require('./playerStore');
                usePlayerStore.getState().reset();

                set({ user: null, isAuthenticated: false, serverUrl: null });
            },
        }),
        {
            name: 'auth-storage',
            storage: createJSONStorage(() => AsyncStorage),
        }
    )
);
