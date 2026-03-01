/**
 * Unified Track type — used across all stores, services, and screens.
 * 
 * This is the single source of truth for the Track shape. Fields are
 * optional where they only apply to specific sources (e.g. Jellyfin
 * playlist context, local-only metadata).
 */
export interface Track {
    id: string;
    name: string;
    artist: string;
    album: string;
    imageUrl: string;
    durationMillis: number;
    streamUrl: string;
    artistId: string;

    // Optional metadata
    genre?: string;
    imageBlurHash?: string;
    isFavorite?: boolean;
    trackNumber?: number;

    // Technical details
    bitrate?: number;
    codec?: string;
    container?: string;
    sampleRate?: number;
    fileSize?: number;

    // Lyrics
    lyrics?: string;

    // Playlist context (Jellyfin)
    playlistId?: string;
    playlistItemId?: string;

    // Local library enrichment flag
    metadataEnriched?: boolean;

    // Unique ID for the queue instance (for React rendering)
    queueItemId?: string;
}

/**
 * MediaItem — the shape returned by the Jellyfin API.
 * Used in HomeScreen, SearchScreen, DetailScreen for API responses
 * before conversion to Track.
 */
export interface MediaItem {
    Id: string;
    Name: string;
    Type: string;
    AlbumArtist?: string;
    Artists?: string[];
    Album?: string;
    ImageBlurHashes?: { Primary?: { [key: string]: string } };
    RunTimeTicks?: number;
    UserData?: { IsFavorite: boolean };
    ArtistItems?: { Id: string }[];
    MediaSources?: {
        Bitrate?: number;
        Container?: string;
        Codec?: string;
        MediaStreams?: {
            Type: string;
            Codec: string;
        }[];
    }[];
    // For local files
    streamUrl?: string;
    imageUrl?: string;
    // Technical details (for local tracks - enriched from library)
    bitrate?: number;
    codec?: string;
    container?: string;
    lyrics?: string;
}
