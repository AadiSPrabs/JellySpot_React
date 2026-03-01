import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
    // Generate a new UUID
    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
    cachedDeviceId = id;
    AsyncStorage.setItem('jellyspot-device-id', id).catch(() => { });
    return id;
};

// Synchronous getter for the device ID (uses cached value, falls back to sync init)
const getDeviceIdSync = (): string => {
    return cachedDeviceId || 'jellyspot-mobile';
};

// Initialize device ID eagerly at module load
getDeviceId();

const getAuthHeader = (token?: string): string => {
    const deviceId = getDeviceIdSync();
    return `MediaBrowser Client="Jellyspot", Device="React Native", DeviceId="${deviceId}", Version="1.0.0"${token ? `, Token="${token}"` : ''}`;
};

// Module-level singleton Axios instance
let apiClient: ReturnType<typeof axios.create> | null = null;
let lastServerUrl: string | null = null;
let lastToken: string | null = null;

const getApiClient = () => {
    const { serverUrl, user } = useAuthStore.getState();
    const token = user?.token || '';

    // Reuse existing client if auth state hasn't changed
    if (apiClient && lastServerUrl === serverUrl && lastToken === token) {
        return apiClient;
    }

    apiClient = axios.create({
        baseURL: serverUrl || '',
        headers: {
            'X-Emby-Authorization': getAuthHeader(token),
        },
    });
    lastServerUrl = serverUrl;
    lastToken = token;

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

        const response = await axios.post(`${serverUrl}/Users/AuthenticateByName`, {
            Username: username,
            Pw: pw,
        }, {
            headers: {
                'X-Emby-Authorization': getAuthHeader(),
            }
        });
        return response.data;
    },

    getUser: async (userId: string, token: string) => {
        const { serverUrl } = useAuthStore.getState();
        const response = await axios.get(`${serverUrl}/Users/${userId}`, {
            headers: {
                'X-Emby-Authorization': getAuthHeader(token)
            },
            timeout: 5000
        });
        return response.data;
    },

    getMe: async (token: string) => {
        const { serverUrl } = useAuthStore.getState();
        const response = await axios.get(`${serverUrl}/Users/Me`, {
            headers: {
                'X-Emby-Authorization': getAuthHeader(token)
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

    getImageUrl: (itemId: string, type: 'Primary' | 'Backdrop' = 'Primary') => {
        const { serverUrl } = useAuthStore.getState();
        return `${serverUrl}/Items/${itemId}/Images/${type}`;
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
        const response = await api.get(`/Genres`, {
            params: {
                Recursive: true,
                Fields: 'PrimaryImageAspectRatio,ItemCounts',
                UserId: user?.id,
                IncludeItemTypes: 'Audio', // Filter to only Audio genres
                Limit: limit,
                SortBy: 'ItemCounts', // Sort by popularity
                SortOrder: 'Descending'
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

        // Strategy 1: Try the dedicated Lyrics endpoint (Jellyfin 10.9+)
        // This is the correct endpoint for synced lyrics
        try {
            const response = await api.get(`/Audio/${itemId}/Lyrics`, { timeout: 5000 });
            // The response should have a Lyrics array with Start (ticks) and Text
            if (response.data && response.data.Lyrics && Array.isArray(response.data.Lyrics) && response.data.Lyrics.length > 0) {

                return response.data;
            }
        } catch (e: any) {
            // Ignore 404 (Not Found) - expected if no lyrics or older server
            if (e.response?.status !== 404) {
                console.warn('[Jellyfin] /Audio Lyrics endpoint failed:', e.message);
            }
        }

        // Strategy 2: Try /Items/{id}/Lyrics (alternative endpoint)
        try {
            const response = await api.get(`/Items/${itemId}/Lyrics`, { timeout: 5000 });
            if (response.data && response.data.Lyrics && Array.isArray(response.data.Lyrics) && response.data.Lyrics.length > 0) {

                return response.data;
            }
        } catch (e: any) {
            if (e.response?.status !== 404) {
                console.warn('[Jellyfin] /Items Lyrics endpoint failed:', e.message);
            }
        }

        // Strategy 3: Fetch Item Details - check if HasLyrics is true, then check for embedded lyrics
        try {
            const response = await api.get(`/Users/${user?.id}/Items/${itemId}`, {
                params: {
                    Fields: 'Path,MediaSources'
                },
                timeout: 5000
            });

            // If HasLyrics is true but we couldn't fetch them, the server may not support the endpoint
            if (response.data?.HasLyrics === false) {

                return null;
            }

            // No embedded lyrics in item details - return null

        } catch (e) {
            console.warn('[Jellyfin] Item details fetch failed:', e);
        }

        return null; // No lyrics found
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

        const headers = {
            'X-Emby-Authorization': getAuthHeader()
        };

        const response = await axios.post(`${serverUrl}/QuickConnect/Initiate`, {}, { headers, timeout: 10000 });
        return response.data; // { Code, Secret, Expiry }
    },

    checkQuickConnect: async (secret: string) => {
        const { serverUrl } = useAuthStore.getState();
        if (!serverUrl) throw new Error("Server URL not set");

        const headers = {
            'X-Emby-Authorization': getAuthHeader()
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
        const headers = {
            'X-Emby-Authorization': getAuthHeader()
        };

        // Exchange the validated secret for an access token
        const response = await axios.post(`${serverUrl}/Users/AuthenticateWithQuickConnect`,
            { Secret: secret },
            { headers, timeout: 5000 }
        );
        return response.data;
    }
};
