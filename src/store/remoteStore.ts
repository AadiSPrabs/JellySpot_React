import { create } from 'zustand';

export interface RemoteSession {
    Id: string;
    DeviceName: string;
    Client: string;
    DeviceId: string;
    ApplicationVersion: string;
    SupportsRemoteControl: boolean;
    NowPlayingItem?: {
        Name: string;
        Artists?: string[];
        Id: string;
        RunTimeTicks?: number;
    };
    PlayState?: {
        PositionTicks?: number;
        VolumeLevel?: number;
        IsPaused?: boolean;
    };
}

interface RemoteState {
    activeSessions: RemoteSession[];
    targetSessionId: string | null;
    volumeLevel: number;
    showVolumeIndicator: boolean;
    remotePlaybackStatus: {
        isPaused: boolean;
        currentTime: number;
        duration: number;
        title: string;
        artist: string;
        artwork: string | null;
    } | null;

    setSessions: (sessions: RemoteSession[]) => void;
    setTargetSessionId: (id: string | null) => void;
    setVolumeLevel: (level: number) => void;
    setShowVolumeIndicator: (show: boolean) => void;
    setRemotePlaybackStatus: (status: RemoteState['remotePlaybackStatus']) => void;

    // UI Helpers
    getSelectedSession: () => RemoteSession | undefined;
    isTargetLocal: () => boolean;
}

export const useRemoteStore = create<RemoteState>((set, get) => ({
    activeSessions: [],
    targetSessionId: null,
    volumeLevel: 100,
    showVolumeIndicator: false,
    remotePlaybackStatus: null,

    setSessions: (activeSessions) => set({ activeSessions }),
    setTargetSessionId: (targetSessionId) => set({ targetSessionId }),
    setVolumeLevel: (volumeLevel) => set({ volumeLevel }),
    setShowVolumeIndicator: (showVolumeIndicator) => set({ showVolumeIndicator }),
    setRemotePlaybackStatus: (remotePlaybackStatus) => set({ remotePlaybackStatus }),

    getSelectedSession: () => {
        const { activeSessions, targetSessionId } = get();
        if (!targetSessionId) return undefined;
        return activeSessions.find(s => s.Id === targetSessionId);
    },

    isTargetLocal: () => {
        const { targetSessionId } = get();
        // If no target selected, we are playing locally
        return !targetSessionId || targetSessionId === 'local';
    }
}));
