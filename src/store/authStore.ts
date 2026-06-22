import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createJSONStorage, persist, StateStorage } from "zustand/middleware";

const SECURE_TOKEN_KEY = "jellyspot-auth-token";

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

// Custom storage adapter: token goes to SecureStore, everything else to AsyncStorage
const secureAuthStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    // Read base state from AsyncStorage
    const raw = await AsyncStorage.getItem(name);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      // Restore token from SecureStore into the state object
      if (parsed?.state?.user) {
        const secureToken = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
        if (secureToken) {
          parsed.state.user.token = secureToken;
        }
      }
      return JSON.stringify(parsed);
    } catch {
      return raw;
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      const parsed = JSON.parse(value);
      // Extract and store token securely
      if (parsed?.state?.user?.token) {
        await SecureStore.setItemAsync(
          SECURE_TOKEN_KEY,
          parsed.state.user.token,
        );
        // Remove token from the AsyncStorage copy
        parsed.state.user.token = "";
      }
      await AsyncStorage.setItem(name, JSON.stringify(parsed));
    } catch {
      await AsyncStorage.setItem(name, value);
    }
  },
  removeItem: async (name: string): Promise<void> => {
    await AsyncStorage.removeItem(name);
    await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
  },
};

// Injected WebSocket service instance (set from App.tsx startup)
let injectedWebSocket: { connect: () => void; disconnect: () => void } | null = null;
export const setWebSocketService = (ws: typeof injectedWebSocket) => {
    injectedWebSocket = ws;
};

const getWebSocketService = () => {
    if (injectedWebSocket) return injectedWebSocket;
    return require('../services/WebSocketService').webSocketService;
};

// Side effect listener for Auth changes
const initAuthListeners = (store: any) => {
    store.subscribe((state: AuthState, prevState: AuthState) => {
        const webSocketService = getWebSocketService();

        if (state.isAuthenticated && (!prevState.isAuthenticated || state.serverUrl !== prevState.serverUrl)) {
            webSocketService.connect();
        }

        if (!state.isAuthenticated && prevState.isAuthenticated) {
            webSocketService.disconnect();
        }
    });
};

// Injected player store reference (set from App.tsx startup)
let injectedPlayerReset: (() => void) | null = null;
export const setPlayerReset = (reset: () => void) => {
    injectedPlayerReset = reset;
};

const getPlayerReset = () => {
    if (injectedPlayerReset) return injectedPlayerReset;
    return require('./playerStore').usePlayerStore.getState().reset;
};

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            serverUrl: null,
            user: null,
            isAuthenticated: false,
            setServerUrl: (url) => set({ serverUrl: url }),
            login: (user) => set({ user, isAuthenticated: true }),
            logout: () => {
                getPlayerReset()();
                set({ user: null, isAuthenticated: false, serverUrl: null });
            },
        }),
        {
            name: 'auth-storage',
            storage: createJSONStorage(() => secureAuthStorage),
        }
    ),
);

// Start listeners
initAuthListeners(useAuthStore);
