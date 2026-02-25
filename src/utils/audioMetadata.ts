// Audio metadata extraction using @nodefinity/react-native-music-library
// This library provides full metadata including artwork as file URIs
import { getTrackMetadataAsync } from '@nodefinity/react-native-music-library';

interface AudioMetadataResult {
    fileType: string;
    metadata: {
        name?: string;
        artist?: string;
        album?: string;
        artwork?: string;
        year?: number;
        genre?: string;
        lyrics?: string;
    };
}

/**
 * Extract audio metadata from a track by its ID
 * Uses @nodefinity/react-native-music-library which has proper encoding support
 */
export const getAudioMetadataById = async (
    trackId: string
): Promise<AudioMetadataResult | null> => {
    try {
        const metadata = await getTrackMetadataAsync(trackId);

        if (metadata) {
            return {
                fileType: metadata.format || 'audio',
                metadata: {
                    name: metadata.title,
                    artist: metadata.artist,
                    album: metadata.album,
                    year: metadata.year,
                    genre: metadata.genre,
                    lyrics: metadata.lyrics,
                    // Note: artwork is available directly from the Track object, not TrackMetadata
                }
            };
        }
        return null;
    } catch (error) {
        // Only log occasionally to reduce noise
        if (Math.random() < 0.05) {
            console.warn('[AudioMetadata] Extraction failed:', error);
        }
        return null;
    }
};

/**
 * Legacy function for backward compatibility
 * Note: For the new library, use getAudioMetadataById with the track ID
 */
export const getAudioMetadata = async (
    uri: string,
    wantedTags: readonly ('name' | 'artist' | 'album' | 'artwork' | 'track' | 'year' | 'albumArtist')[]
): Promise<AudioMetadataResult | null> => {
    // This function is kept for backward compatibility but the new library
    // doesn't work with URIs directly - it uses track IDs
    // The calling code should be updated to use getAudioMetadataById or 
    // better yet, use getTracksAsync which already includes metadata
    console.warn('[AudioMetadata] getAudioMetadata by URI is deprecated. Use getTracksAsync from react-native-music-library instead.');
    return null;
};
