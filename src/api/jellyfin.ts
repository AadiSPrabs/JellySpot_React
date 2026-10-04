import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logError, isNotFoundError, getErrorMessage } from '../utils/errorUtils';
import { generateUuid } from '../utils/uuid';

// Unique device ID (generated once, persisted forever)
let cachedDeviceId: string | null = null;

const getDeviceId = async (): Promise<string> => {
    if (cachedDeviceId) return cachedDeviceId;
    try {
        const stored = await AsyncStorage.getItem('jellyspot-device-id');
        if (stored) {
            cachedDeviceId = stored;
            return stored;
        }
    } catch { }
    const id = generateUuid();
    cachedDeviceId = id;
    try {
        await AsyncStorage.setItem('jellyspot-device-id', id);
    } catch { }
    return id;
};

// Internal init to be called at module scope
let initPromise: Promise<string> | null = null;
const ensureDeviceId = (): Promise<string> => {
    if (initPromise) return initPromise;
    initPromise = getDeviceId();
    return initPromise;
};

// Synchronous getter for the device ID (uses cached value, falls back to sync init)
export const getDeviceIdSync = (): string => {
    return cachedDeviceId || 'jellyspot-mobile';
};

// Initialize device ID eagerly at module load
ensureDeviceId();

// Wait for device ID to be loaded
export const waitForDeviceId = async (): Promise<string> => {
    return await ensureDeviceId();
};

const getAuthHeaderAsync = async (token?: string): Promise<string> => {
    const deviceId = await waitForDeviceId();
    return `MediaBrowser Client="Jellyspot", Device="React Native", DeviceId="${deviceId}", Version="1.0.0"${token ? `, Token="${token}"` : ''}`;
};

// Module-level singleton Axios instance
let apiClient: ReturnType<typeof axios.create> | null = null;
let lastServerUrl: string | null = null;

const getApiClient = () => {
    const { serverUrl } = useAuthStore.getState();

    // Reuse existing client if server URL hasn't changed
    // Token is fetched fresh on every request via the interceptor
    if (apiClient && lastServerUrl === serverUrl) {
        return apiClient;
    }

    apiClient = axios.create({
        baseURL: serverUrl || undefined,
    });

    // Add auth header on every request using the LATEST token from store
    apiClient.interceptors.request.use(async (config) => {
        const currentToken = useAuthStore.getState().user?.token || '';
        config.headers['Authorization'] = await getAuthHeaderAsync(currentToken);
        return config;
    });

    lastServerUrl = serverUrl;

    return apiClient;
};


// Helper to get selected library IDs or undefined if all libraries should be used
const getSelectedParentIds = (): string | undefined => {
    const { selectedJellyfinLibraries } = useSettingsStore.getState();
    if (selectedJellyfinLibraries.length === 0) return undefined;
    return selectedJellyfinLibraries.join(',');
};

export const jellyfinApi = {
    authenticate: async (username: string, pw: string) => {
        const { serverUrl } = useAuthStore.getState();
        if (!serverUrl) throw new Error("Server URL not set");

        const authHeader = await getAuthHeaderAsync();
        const response = await axios.post(`${serverUrl}/Users/AuthenticateByName`, {
            Username: username,
            Pw: pw,
        }, {
            headers: {
                'Authorization': authHeader,
            }
        });
        return response.data;
    },

    getUser: async (userId: string, token: string) => {
        const { serverUrl } = useAuthStore.getState();
        const authHeader = await getAuthHeaderAsync(token);
        const response = await axios.get(`${serverUrl}/Users/${userId}`, {
            headers: {
                'Authorization': authHeader
            },
            timeout: 5000
        });
        return response.data;
    },

    getMe: async (token: string) => {
        const { serverUrl } = useAuthStore.getState();
        const authHeader = await getAuthHeaderAsync(token);
        const response = await axios.get(`${serverUrl}/Users/Me`, {
            headers: {
                'Authorization': authHeader
            },
            timeout: 5000
        });
        return response.data;
    },

    getPublicSystemInfo: async (url: string) => {
        const response = await axios.get(`${url}/System/Info/Public`, { timeout: 5000 });
        return response.data;
    },

    getUserViews: async () => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.get(`/Users/${user?.id}/Views`, { timeout: 10000 });
        return response.data;
    },

    // Get only music libraries from user views
    getMusicLibraries: async () => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.get(`/Users/${user?.id}/Views`, { timeout: 10000 });
        const views = response.data?.Items || [];
        // Filter for music collection types
        return views.filter((view: any) =>
            view.CollectionType === 'music' ||
            view.CollectionType === 'musicvideos' ||
            (view.Type === 'CollectionFolder' && view.Name?.toLowerCase().includes('music'))
        );
    },

    getLatestMusic: async (limit = 20) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const { selectedJellyfinLibraries } = useSettingsStore.getState();
        // Latest endpoint works better with a single ParentId, so use first selected library or none
        const parentId = selectedJellyfinLibraries.length > 0 ? selectedJellyfinLibraries[0] : undefined;
        const response = await api.get(`/Users/${user?.id}/Items/Latest`, {
            params: {
                Limit: limit,
                IncludeItemTypes: 'MusicAlbum',
                Fields: 'PrimaryImageAspectRatio,DateCreated,BasicSyncInfo,ImageBlurHashes,MediaSources',
                ImageTypeLimit: 1,
                EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
                ...(parentId && { ParentId: parentId }),
            },
            timeout: 10000
        });
        return response.data;
    },

    getResumeItems: async (limit = 10) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.get(`/Users/${user?.id}/Items/Resume`, {
            params: {
                Limit: limit,
                Recursive: true,
                Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,ImageBlurHashes,ArtistItems,MediaSources',
                ImageTypeLimit: 1,
                EnableImageTypes: 'Primary,Backdrop,Banner,Thumb',
                MediaTypes: 'Audio',
            },
            timeout: 10000
        });
        return response.data;
    },

    getItems: async (params: any) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const parentIds = getSelectedParentIds();
        const response = await api.get(`/Users/${user?.id}/Items`, {
            params: {
                ...params,
                Recursive: params.Recursive !== undefined ? params.Recursive : true,
                Fields: params.Fields ? `${params.Fields},ImageBlurHashes,ArtistItems,MediaSources` : 'ImageBlurHashes,ArtistItems,MediaSources',
                // Only apply parent filter if not already specified and libraries are selected
                ...(parentIds && !params.ParentId && { ParentId: parentIds }),
            },
            timeout: 30000 // Increased for large libraries
        });
        return response.data;
    },

    getItem: async (itemId: string) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.get(`/Users/${user?.id}/Items/${itemId}`, {
            params: {
                Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,Path,MediaSources,ImageBlurHashes'
            },
            timeout: 10000
        });
        return response.data;
    },

    getImageUrl: (itemId: string, type: 'Primary' | 'Backdrop' = 'Primary', options?: { maxWidth?: number, maxHeight?: number, quality?: number }) => {
        const { serverUrl } = useAuthStore.getState();
        let url = `${serverUrl}/Items/${itemId}/Images/${type}`;
        if (options) {
            const params = new URLSearchParams();
            if (options.maxWidth) params.append('maxWidth', options.maxWidth.toString());
            if (options.maxHeight) params.append('maxHeight', options.maxHeight.toString());
            if (options.quality) params.append('quality', options.quality.toString());
            const queryString = params.toString();
            if (queryString) {
                url += `?${queryString}`;
            }
        }
        return url;
    },

    getUserImageUrl: (userId: string) => {
        const { serverUrl } = useAuthStore.getState();
        return `${serverUrl}/Users/${userId}/Images/Primary`;
    },

    searchItems: async (query: string, includeItemTypes: string = 'Audio,MusicAlbum,MusicArtist') => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const parentIds = getSelectedParentIds();
        const response = await api.get(`/Users/${user?.id}/Items`, {
            params: {
                SearchTerm: query,
                Recursive: true,
                IncludeItemTypes: includeItemTypes,
                Limit: 20,
                Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,ArtistItems,ImageBlurHashes,MediaSources',
                ...(parentIds && { ParentId: parentIds }),
            },
            timeout: 10000
        });
        return response.data;
    },

    // Restored Methods
    getRecommendations: async (limit = 20) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const parentIds = getSelectedParentIds();
        // Use random items as robust "Quick Picks" instead of Suggestions
        // Suggestions endpoint is often empty or returns mixed media types
        const response = await api.get(`/Users/${user?.id}/Items`, {
            params: {
                SortBy: 'Random',
                IncludeItemTypes: 'Audio',
                Limit: limit,
                Recursive: true,
                Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,ImageBlurHashes,MediaSources',
                ...(parentIds && { ParentId: parentIds }),
            },
            timeout: 20000
        });
        return response.data;
    },

    getPlaylists: async () => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.get(`/Users/${user?.id}/Items`, {
            params: {
                IncludeItemTypes: 'Playlist',
                Recursive: true,
                Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,ImageBlurHashes,MediaSources',
            },
            timeout: 20000
        });
        return response.data;
    },

    getPlaylistItems: async (playlistId: string) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        // Correct endpoint per Jellyfin API docs: /Playlists/{playlistId}/Items
        const response = await api.get(`/Playlists/${playlistId}/Items`, {
            params: {
                UserId: user?.id,
                Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,ImageBlurHashes,MediaSources',
            },
            timeout: 20000
        });
        return response.data;
    },

    getGenres: async (limit = 20) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.get(`/MusicGenres`, {
            params: {
                Recursive: true,
                Fields: 'PrimaryImageAspectRatio,ItemCounts',
                UserId: user?.id,
                Limit: limit,
                SortBy: 'SortName',
                SortOrder: 'Ascending'
            },
            timeout: 20000
        });
        return response.data;
    },

    getArtist: async (artistId: string) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.get(`/Users/${user?.id}/Items/${artistId}`, { timeout: 20000 });
        return response.data;
    },

    getAlbum: async (albumId: string) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.get(`/Users/${user?.id}/Items/${albumId}`, { timeout: 20000 });
        return response.data;
    },

    markFavorite: async (itemId: string) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.post(`/Users/${user?.id}/FavoriteItems/${itemId}`);
        return response.data;
    },

    unmarkFavorite: async (itemId: string) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.delete(`/Users/${user?.id}/FavoriteItems/${itemId}`);
        return response.data;
    },

    getFavoriteItems: async (limit = 20) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const parentIds = getSelectedParentIds();
        const response = await api.get(`/Users/${user?.id}/Items`, {
            params: {
                Filters: 'IsFavorite',
                IncludeItemTypes: 'Audio',
                Limit: limit,
                Recursive: true,
                Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,ImageBlurHashes,MediaSources',
                ...(parentIds && { ParentId: parentIds }),
            },
            timeout: 20000
        });
        return response.data;
    },

    // Delete an item (playlist, etc.) from the server
    deleteItem: async (itemId: string) => {
        const api = getApiClient();
        const response = await api.delete(`/Items/${itemId}`);
        return response.data;
    },

    getSimilarItems: async (itemId: string) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.get(`/Items/${itemId}/Similar`, {
            params: {
                UserId: user?.id,
                Limit: 10
            },
            timeout: 20000
        });
        return response.data;
    },

    getAudioLyrics: async (itemId: string) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();

        /**
         * Jellyfin 12 lyrics API.
         *
         * Verified against a live 12.0.0 server's OpenAPI document, which
         * exposes exactly:
         *   GET    /Audio/{itemId}/Lyrics                       (item's lyrics)
         *   POST   /Audio/{itemId}/Lyrics                       (upload)
         *   DELETE /Audio/{itemId}/Lyrics                       (delete)
         *   GET    /Audio/{itemId}/RemoteSearch/Lyrics          (search providers)
         *   GET    /Audio/{itemId}/RemoteSearch/Lyrics/{id}     (download one)
         *   GET    /Providers/Lyrics/{lyricId}
         *
         * The old code tried `/Items/{itemId}/Lyrics` as a second strategy.
         * That route does not exist in 12 (or in 10.9+, where it was never a
         * lyrics endpoint), so every call 404'd and the strategy was dead
         * weight - it doubled the request count on the miss path for nothing.
         */
        try {
            const response = await api.get(`/Audio/${itemId}/Lyrics`, { timeout: 5000 });
            // LyricDto: { Metadata, Lyrics: [{ Text, Start (ticks), Cues }] }
            if (response.data && Array.isArray(response.data.Lyrics) && response.data.Lyrics.length > 0) {
                return response.data;
            }
        } catch (e: unknown) {
            // A 404 is expected whenever the track simply has no lyrics.
            if (!isNotFoundError(e)) {
                logError('Jellyfin', `/Audio Lyrics endpoint failed: ${getErrorMessage(e)}`);
            }
        }

        // Item details, to distinguish "no lyrics" from "endpoint unavailable".
        try {
            const response = await api.get(`/Users/${user?.id}/Items/${itemId}`, {
                params: {
                    Fields: 'Path,MediaSources'
                },
                timeout: 5000
            });

            if (response.data?.HasLyrics === false) {
                return null;
            }
        } catch (e) {
            logError('Jellyfin', `Item details fetch failed: ${getErrorMessage(e)}`);
        }

        return null; // No lyrics found
    },

    /**
     * Searches Jellyfin's own lyric providers for a track.
     *
     * New in Jellyfin 12 and previously unused by this app. It lets the server
     * find lyrics the local library does not have, using whichever providers
     * are configured server-side - which for a self-hosted setup is often a
     * better hit rate than querying LRCLIB directly from the phone.
     *
     * Returns the provider's candidates; the caller picks one and downloads it
     * with `downloadRemoteLyrics`.
     */
    searchRemoteLyrics: async (itemId: string) => {
        const api = getApiClient();
        try {
            const response = await api.get(`/Audio/${itemId}/RemoteSearch/Lyrics`, { timeout: 15000 });
            // RemoteLyricInfoDto[]: { Id, ProviderName, Lyrics }
            return Array.isArray(response.data) ? response.data : [];
        } catch (e: unknown) {
            if (!isNotFoundError(e)) {
                logError('Jellyfin', `Remote lyrics search failed: ${getErrorMessage(e)}`);
            }
            return [];
        }
    },

    /**
     * Downloads a specific remote lyric and attaches it to the item server-side.
     * After this succeeds the track has lyrics, so a normal lyrics fetch will
     * return them.
     */
    downloadRemoteLyrics: async (itemId: string, lyricId: string) => {
        const api = getApiClient();
        try {
            await api.get(`/Audio/${itemId}/RemoteSearch/Lyrics/${lyricId}`, { timeout: 15000 });
            return true;
        } catch (e: unknown) {
            logError('Jellyfin', `Remote lyrics download failed: ${getErrorMessage(e)}`);
            return false;
        }
    },

    // Quick Connect
    getRecommendedArtists: async (limit = 10) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.get(`/Users/${user?.id}/Items`, {
            params: {
                SortBy: 'Random',
                IncludeItemTypes: 'MusicArtist',
                Limit: limit,
                Recursive: true,
                Fields: 'PrimaryImageAspectRatio,BasicSyncInfo,ImageBlurHashes,MediaSources',
            },
            timeout: 20000
        });
        return response.data;
    },



    createPlaylist: async (name: string, ids?: string[]) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.post('/Playlists', {
            Name: name,
            Ids: ids || [],
            UserId: user?.id,
            MediaType: 'Audio'
        });
        return response.data;
    },

    addToPlaylist: async (playlistId: string, itemIds: string[]) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.post(`/Playlists/${playlistId}/Items`, {}, {
            params: {
                Ids: itemIds.join(','),
                UserId: user?.id
            }
        });
        return response.data;
    },

    removeFromPlaylist: async (playlistId: string, itemIds: string[]) => {
        const api = getApiClient();
        const { user } = useAuthStore.getState();
        const response = await api.delete(`/Playlists/${playlistId}/Items`, {
            params: {
                EntryIds: itemIds.join(','),
                UserId: user?.id
            }
        });
        return response.data;
    },

    initiateQuickConnect: async () => {
        const { serverUrl } = useAuthStore.getState();
        if (!serverUrl) throw new Error("Server URL not set");

        const authHeader = await getAuthHeaderAsync();
        const headers = {
            'Authorization': authHeader
        };

        const response = await axios.post(`${serverUrl}/QuickConnect/Initiate`, {}, { headers, timeout: 10000 });
        return response.data; // { Code, Secret, Expiry }
    },

    checkQuickConnect: async (secret: string) => {
        const { serverUrl } = useAuthStore.getState();
        if (!serverUrl) throw new Error("Server URL not set");

        const authHeader = await getAuthHeaderAsync();
        const headers = {
            'Authorization': authHeader
        };

        // This endpoint returns 200 { Authenticated: true } if authorized
        // But often lacks the token.
        const response = await axios.get(`${serverUrl}/QuickConnect/Connect`, {
            params: { Secret: secret },
            headers,
            timeout: 5000
        });
        return response.data;
    },

    authenticateWithQuickConnect: async (secret: string) => {
        const { serverUrl } = useAuthStore.getState();
        const authHeader = await getAuthHeaderAsync();
        const headers = {
            'Authorization': authHeader
        };

        // Exchange the validated secret for an access token
        const response = await axios.post(`${serverUrl}/Users/AuthenticateWithQuickConnect`,
            { Secret: secret },
            { headers, timeout: 5000 }
        );
        return response.data;
    },

    // Session Management & Remote Control
    getSessions: async () => {
        const api = getApiClient();
        const response = await api.get('/Sessions', { timeout: 10000 });
        return response.data;
    },

    sendGeneralCommand: async (sessionId: string, command: string, args?: Record<string, string>) => {
        const api = getApiClient();
        const response = await api.post(`/Sessions/${sessionId}/Playing/Command`, {
            Name: command,
            Arguments: args || {}
        });
        return response.data;
    },

    signOutSession: async (sessionId: string) => {
        const api = getApiClient();
        const response = await api.delete(`/Sessions/${sessionId}`);
        return response.data;
    },

    reportCapabilities: async () => {
        const api = getApiClient();
        const deviceId = await waitForDeviceId();

        const capabilities = {
            PlayableMediaTypes: ['Audio'],
            SupportedCommands: [
                'Play', 'Pause', 'Stop', 'Seek',
                'VolumeUp', 'VolumeDown', 'Mute', 'Unmute',
                'NextTrack', 'PreviousTrack'
            ],
            SupportsMediaControl: true,
            SupportsPersistentIdentifier: true,
        };

        try {
            await api.post('/Sessions/Capabilities', capabilities);
        } catch (e) {
            logError('API', `reportCapabilities failure: ${getErrorMessage(e)}`);
        }

        return true;
    },

    reportPlaybackProgress: async (params: {
        ItemId: string;
        PositionTicks: number;
        IsPaused: boolean;
        VolumeLevel?: number;
    }) => {
        const api = getApiClient();
        // This notifies the server about our local playback state
        // /Sessions/Playing/Progress
        const response = await api.post('/Sessions/Playing/Progress', params);
        return response.data;
    },

    reportPlaybackStart: async (itemId: string) => {
        const api = getApiClient();
        const response = await api.post('/Sessions/Playing', { ItemId: itemId });
        return response.data;
    },

    reportPlaybackStopped: async (itemId: string, positionTicks: number) => {
        const api = getApiClient();
        const response = await api.post('/Sessions/Playing/Stopped', {
            ItemId: itemId,
            PositionTicks: positionTicks
        });
        return response.data;
    },
};
