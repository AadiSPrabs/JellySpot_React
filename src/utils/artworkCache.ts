// Artwork caching utility - saves base64 artwork to file system
// This allows artwork to be used in notifications and persisted across restarts
import * as FileSystem from 'expo-file-system';

// Directory for cached artwork
const ARTWORK_CACHE_DIR = `${FileSystem.cacheDirectory}artwork/`;

/**
 * Ensures the artwork cache directory exists
 */
const ensureCacheDir = async (): Promise<void> => {
    const dirInfo = await FileSystem.getInfoAsync(ARTWORK_CACHE_DIR);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(ARTWORK_CACHE_DIR, { intermediates: true });
    }
};

/**
 * Generates a filename for a track's artwork
 */
const getArtworkFilename = (trackId: string): string => {
    // Sanitize trackId to be a valid filename
    const sanitized = trackId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `${sanitized}.jpg`;
};

/**
 * Gets the file path for a track's artwork
 */
export const getArtworkPath = (trackId: string): string => {
    return `${ARTWORK_CACHE_DIR}${getArtworkFilename(trackId)}`;
};

/**
 * Saves base64 artwork data to a file and returns the file:// URI
 * @param trackId - The track ID (used for filename)
 * @param base64Data - The base64 image data (with or without data: prefix)
 * @returns file:// URI to the saved artwork, or null if failed
 */
export const saveArtwork = async (trackId: string, base64Data: string): Promise<string | null> => {
    try {
        await ensureCacheDir();

        // Extract raw base64 data (remove data:image/...;base64, prefix if present)
        let rawBase64 = base64Data;
        if (base64Data.startsWith('data:')) {
            const commaIndex = base64Data.indexOf(',');
            if (commaIndex !== -1) {
                rawBase64 = base64Data.substring(commaIndex + 1);
            }
        }

        const filePath = getArtworkPath(trackId);

        // Write base64 data to file
        await FileSystem.writeAsStringAsync(filePath, rawBase64, {
            encoding: FileSystem.EncodingType.Base64,
        });

        return filePath;
    } catch (error) {
        console.warn(`[ArtworkCache] Failed to save artwork for ${trackId}:`, error);
        return null;
    }
};

/**
 * Checks if artwork exists for a track
 */
export const hasArtwork = async (trackId: string): Promise<boolean> => {
    try {
        const filePath = getArtworkPath(trackId);
        const info = await FileSystem.getInfoAsync(filePath);
        return info.exists;
    } catch {
        return false;
    }
};

/**
 * Clears all cached artwork
 */
export const clearArtworkCache = async (): Promise<void> => {
    try {
        const dirInfo = await FileSystem.getInfoAsync(ARTWORK_CACHE_DIR);
        if (dirInfo.exists) {
            await FileSystem.deleteAsync(ARTWORK_CACHE_DIR, { idempotent: true });
        }
    } catch (error) {
        console.warn('[ArtworkCache] Failed to clear cache:', error);
    }
};

/**
 * Gets cache statistics
 */
export const getCacheStats = async (): Promise<{ count: number; sizeBytes: number }> => {
    try {
        await ensureCacheDir();
        const files = await FileSystem.readDirectoryAsync(ARTWORK_CACHE_DIR);

        let totalSize = 0;
        for (const file of files) {
            const info = await FileSystem.getInfoAsync(`${ARTWORK_CACHE_DIR}${file}`);
            if (info.exists && 'size' in info) {
                totalSize += info.size || 0;
            }
        }

        return { count: files.length, sizeBytes: totalSize };
    } catch {
        return { count: 0, sizeBytes: 0 };
    }
};
