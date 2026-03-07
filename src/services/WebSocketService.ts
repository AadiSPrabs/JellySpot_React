import { useAuthStore } from '../store/authStore';
import { useRemoteStore, RemoteSession } from '../store/remoteStore';
import { audioService } from './AudioService';
import { getDeviceIdSync } from '../api/jellyfin';

class WebSocketService {
    private socket: WebSocket | null = null;
    private reconnectTimeout: any = null;
    private isManuallyClosed = false;
    private capabilitiesInterval: any = null;

    async connect() {
        const { serverUrl, user } = useAuthStore.getState();
        if (!serverUrl || !user?.token) return;

        // Ensure we have the device ID before doing anything
        const { waitForDeviceId } = require('../api/jellyfin');
        const deviceId = await waitForDeviceId();
        const wsUrl = serverUrl.replace('http', 'ws') +
            '/socket?api_key=' + user.token +
            '&deviceId=' + deviceId +
            '&Client=' + encodeURIComponent('Jellyspot') +
            '&Device=' + encodeURIComponent('React Native') +
            '&Version=1.0.0';

        // Ensure capabilities are reported BEFORE connecting to the socket
        const { jellyfinApi } = require('../api/jellyfin');
        try {
            await jellyfinApi.reportCapabilities();
        } catch (e) {
            console.warn('[WebSocket] Pre-connection reportCapabilities failed:', e);
        }

        if (this.socket) {
            // Null out handlers on the old socket so its asynchronous 'close' event doesn't trigger our reconnect logic
            this.socket.onopen = null;
            this.socket.onmessage = null;
            this.socket.onerror = null;
            this.socket.onclose = null;

            this.isManuallyClosed = true;
            this.socket.close();
            this.isManuallyClosed = false;
        }

        this.socket = new WebSocket(wsUrl);

        this.socket.onopen = () => {


            // Maintain connection with initial KeepAlive (empty object data)
            this.sendMessage('KeepAlive', {});

            // Delay subscriptions slightly more to ensure Identity is established
            setTimeout(() => {
                // Subscribe to session updates
                this.sendMessage('SessionsStart', '0,1500');
            }, 500);
        };

        this.socket.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (e) {
                console.warn('[WebSocket] Error parsing message:', event.data, e);
            }
        };

        this.socket.onerror = (error) => {
            console.warn('[WebSocket] Error:', error);
        };

        this.socket.onclose = () => {
            console.log('[WebSocket] Disconnected');
            if (!this.isManuallyClosed) {
                this.reconnect();
            }
        };
    }

    private reconnect() {
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        // Slower reconnect to avoid loop madness
        this.reconnectTimeout = setTimeout(() => this.connect(), 10000);
    }

    disconnect() {
        this.isManuallyClosed = true;
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
        if (this.capabilitiesInterval) clearInterval(this.capabilitiesInterval);
    }

    private handleMessage(message: any) {
        const { MessageType, Data } = message;
        const currentDeviceId = getDeviceIdSync();

        switch (MessageType) {
            case 'ForceKeepAlive':
                this.sendMessage('KeepAlive', {});
                break;

            case 'Sessions':
                // Filter out self using deviceId
                const otherSessions = (Data as RemoteSession[]).filter(s => s.DeviceId !== currentDeviceId);
                useRemoteStore.getState().setSessions(otherSessions);
                break;

            case 'Playstate':
                // If we are controlling someone, update their state in our store
                const targetId = useRemoteStore.getState().targetSessionId;
                if (targetId && Data.SessionId === targetId) {
                    // Update remote playback status
                    // This is simplified, real implementation would map Data to remotePlaybackStatus
                }
                break;

            case 'GeneralCommand':
                // If someone is controlling US, execute the command
                this.handleRemoteCommand(Data);
                break;
        }
    }

    private async handleRemoteCommand(command: any) {
        // Only handle if we aren't the one initiating? Usually Jellyfin sends to the targeted session
        const { Name, Arguments } = command;
        console.log('[WebSocket] Received Remote Command:', Name, Arguments);

        switch (Name) {
            case 'Play':
                // If ItemId is provided, we should fetch and play it
                if (Arguments.ItemIds && Arguments.ItemIds.length > 0) {
                    // This would requires more logic to fetch item and play
                }
                break;
            case 'TogglePause':
            case 'PlayPause':
                const { usePlayerStore } = require('../store/playerStore');
                usePlayerStore.getState().togglePlayPause();
                break;
            case 'Stop':
                audioService.stop();
                break;
            case 'SetVolume':
                if (Arguments.Volume !== undefined) {
                    audioService.setVolume(Arguments.Volume / 100);
                }
                break;
            case 'Seek':
                if (Arguments.PositionTicks !== undefined) {
                    audioService.seek(Arguments.PositionTicks / 10000); // Ticks to ms
                }
                break;
            case 'NextTrack':
                {
                    const { usePlayerStore } = require('../store/playerStore');
                    usePlayerStore.getState().playNext();
                }
                break;
            case 'PreviousTrack':
                {
                    const { usePlayerStore } = require('../store/playerStore');
                    usePlayerStore.getState().playPrevious();
                }
                break;
        }
    }

    sendMessage(type: string, data: any) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                MessageType: type,
                Data: data
            }));
        } else {
            console.warn('[WebSocket] Cannot send message, socket not open:', type);
        }
    }

    sendCommand(sessionId: string, command: string, args: Record<string, any> = {}) {
        this.sendMessage('GeneralCommand', {
            TargetSessionId: sessionId,
            Name: command,
            Arguments: args
        });
    }
}

export const webSocketService = new WebSocketService();
