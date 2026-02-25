import { useEffect, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';

/**
 * Hook to track app state (active, background, inactive)
 * Used to pause expensive operations when app is backgrounded
 */
export function useAppState(): AppStateStatus {
    const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);

    useEffect(() => {
        const subscription = AppState.addEventListener('change', setAppState);
        return () => subscription.remove();
    }, []);

    return appState;
}

/**
 * Convenience hook to check if app is currently active (in foreground)
 */
export function useIsAppActive(): boolean {
    return useAppState() === 'active';
}
