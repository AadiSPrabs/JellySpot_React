import { eq, like, desc, asc, and, or, sql, count } from 'drizzle-orm';
import { db } from '../db/client';
import * as FileSystem from 'expo-file-system/legacy';
import { tracks, playlists, playlistTracks, playHistory, queueState, cachedTracks } from '../db/schema';
import { Track } from '../types/track';

// Generate a random ID
const generateId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

export const DatabaseService = {
    // --- Tracks ---

    // Clear all tracks (for full rescan)
    async clearAllTracks() {
        await db.delete(tracks);
    },

    // Bulk insert tracks
    async insertTracks(newTracks: Track[]) {
        if (newTracks.length === 0) return;

        // Map store Track to DB Schema
        const dbTracks = newTracks.map(t => ({
            id: t.id,
            name: t.name,
            artist: t.artist,
            album: t.album,
            genre: t.genre,
            imageUrl: t.imageUrl,
            durationMillis: t.durationMillis,
            streamUrl: t.streamUrl,
            artistId: t.artistId,
            isFavorite: t.isFavorite || false,
            bitrate: t.bitrate,
            codec: t.codec,
            container: t.container,
            fileSize: t.fileSize,
            lyrics: t.lyrics,
            trackNumber: t.trackNumber,
        }));

        // Insert in chunks to avoid SQLite limits if necessary, though Drizzle handles this well usually.
        // Drizzle doesn't auto-chunk large arrays, best to do it manually for safety on low-end devices.
        const CHUNK_SIZE = 500;
        for (let i = 0; i < dbTracks.length; i += CHUNK_SIZE) {
            await db.insert(tracks).values(dbTracks.slice(i, i + CHUNK_SIZE)).onConflictDoNothing();
        }
    },

    // Get all tracks (optimized)
    async getAllTracks() {
        return await db.select().from(tracks).orderBy(asc(tracks.name));
    },

    // Get tracks filtered by folder paths (SQL-level filtering for performance)
    async getTracksByFolders(folderPaths: string[]) {
        if (folderPaths.length === 0) return [];

        // Build OR conditions for each folder path using LIKE
        // streamUrl contains the full file path, we check if it starts with any of the folder paths
        const conditions = folderPaths.map(folder => {
            // Escape special characters and add wildcard
            const escapedFolder = folder.replace(/%/g, '\\%').replace(/_/g, '\\_');
            return like(tracks.streamUrl, `%${escapedFolder}%`);
        });

        return await db.select()
            .from(tracks)
            .where(or(...conditions))
            .orderBy(asc(tracks.name));
    },

    // Search tracks (High performance SQL search)
    async searchTracks(query: string) {
        const search = `%${query}%`;
        return await db.select().from(tracks).where(
            or(
                like(tracks.name, search),
                like(tracks.artist, search),
                like(tracks.album, search)
            )
        ).limit(50);
    },

    // Search Artists (Grouped)
    async searchArtists(query: string) {
        const search = `%${query}%`;
        return await db.select({
            artist: tracks.artist,
            artistId: tracks.artistId,
            imageUrl: tracks.imageUrl
        })
            .from(tracks)
            .where(like(tracks.artist, search))
            .groupBy(tracks.artist)
            .limit(10);
    },

    // Search Albums (Grouped)
    async searchAlbums(query: string) {
        const search = `%${query}%`;
        return await db.select({
            album: tracks.album,
            artist: tracks.artist,
            imageUrl: tracks.imageUrl
        })
            .from(tracks)
            .where(like(tracks.album, search))
            .groupBy(tracks.album)
            .limit(10);
    },

    // Get All Artists (Grouped)
    async getAllArtists() {
        return await db.select({
            artist: tracks.artist,
            artistId: tracks.artistId,
            imageUrl: tracks.imageUrl
        })
            .from(tracks)
            .groupBy(tracks.artist)
            .orderBy(asc(tracks.artist));
    },

    // Get All Albums (Grouped)
    async getAllAlbums() {
        return await db.select({
            album: tracks.album,
            artist: tracks.artist,
            imageUrl: tracks.imageUrl
        })
            .from(tracks)
            .groupBy(tracks.album)
            .orderBy(asc(tracks.album));
    },

    // Get Tracks by Artist Id or Name
    async getTracksByArtist(artistIdOrName: string) {
        return await db.select()
            .from(tracks)
            .where(or(
                eq(tracks.artistId, artistIdOrName),
                eq(tracks.artist, artistIdOrName)
            ))
            .orderBy(asc(tracks.name));
    },

    // Get Tracks by exact Artist Name
    async getTracksByArtistName(artistName: string) {
        return await db.select().from(tracks).where(eq(tracks.artist, artistName)).orderBy(asc(tracks.name));
    },

    // Get Tracks by Album
    async getTracksByAlbum(albumName: string) {
        return await db.select().from(tracks).where(eq(tracks.album, albumName)).orderBy(asc(tracks.trackNumber));
    },

    // Get Favorites
    async getFavorites() {
        return await db.select().from(tracks).where(eq(tracks.isFavorite, true));
    },

    // Get Favorites filtered by folder paths
    async getFavoritesByFolders(folderPaths: string[]) {
        if (folderPaths.length === 0) return [];

        const folderConditions = folderPaths.map(folder => {
            const escapedFolder = folder.replace(/%/g, '\\%').replace(/_/g, '\\_');
            return like(tracks.streamUrl, `%${escapedFolder}%`);
        });

        return await db.select()
            .from(tracks)
            .where(and(
                eq(tracks.isFavorite, true),
                or(...folderConditions)
            ))
            .orderBy(asc(tracks.name));
    },

    // Update Favorite Status
    async toggleFavorite(trackId: string, isFav: boolean) {
        await db.update(tracks)
            .set({ isFavorite: isFav })
            .where(eq(tracks.id, trackId));
    },

    // Delete Track
    async deleteTrack(trackId: string) {
        await db.delete(tracks).where(eq(tracks.id, trackId));
    },

    // --- Playlists ---

    // Create a new playlist
    async createPlaylist(name: string) {
        const id = generateId();
        await db.insert(playlists).values({
            id,
            name,
            createdAt: Date.now(),
        });
        return { id, name, createdAt: Date.now() };
    },

    // Delete a playlist (cascade deletes playlistTracks)
    async deletePlaylist(id: string) {
        await db.delete(playlists).where(eq(playlists.id, id));
    },

    // Rename a playlist
    async renamePlaylist(id: string, newName: string) {
        await db.update(playlists)
            .set({ name: newName })
            .where(eq(playlists.id, id));
    },

    // Get all playlists with track count
    async getAllPlaylists() {
        // Simple query - get playlists, count tracks separately for each
        const allPlaylists = await db.select().from(playlists).orderBy(desc(playlists.createdAt));

        // Get track counts
        const playlistsWithCount = await Promise.all(
            allPlaylists.map(async (p) => {
                const trackCount = await db.select({ count: count() })
                    .from(playlistTracks)
                    .where(eq(playlistTracks.playlistId, p.id));
                return {
                    ...p,
                    trackCount: trackCount[0]?.count || 0
                };
            })
        );

        return playlistsWithCount;
    },

    // Add track to playlist
    async addTrackToPlaylist(playlistId: string, trackId: string) {
        // Check if already exists
        const existing = await db.select()
            .from(playlistTracks)
            .where(and(
                eq(playlistTracks.playlistId, playlistId),
                eq(playlistTracks.trackId, trackId)
            ));

        if (existing.length > 0) return; // Already in playlist

        await db.insert(playlistTracks).values({
            playlistId,
            trackId,
            addedAt: Date.now(),
        });
    },

    // Remove track from playlist
    async removeTrackFromPlaylist(playlistId: string, trackId: string) {
        await db.delete(playlistTracks)
            .where(and(
                eq(playlistTracks.playlistId, playlistId),
                eq(playlistTracks.trackId, trackId)
            ));
    },

    // Update playlist track order using addedAt timestamps
    async updatePlaylistOrder(playlistId: string, trackIdsInOrder: string[]) {
        const now = Date.now();
        // Update each track's addedAt timestamp so the first item has the highest timestamp (descending order)
        for (let i = 0; i < trackIdsInOrder.length; i++) {
            const trackId = trackIdsInOrder[i];
            await db.update(playlistTracks)
                .set({ addedAt: now - (i * 1000) })
                .where(and(
                    eq(playlistTracks.playlistId, playlistId),
                    eq(playlistTracks.trackId, trackId)
                ));
        }
    },

    // Get tracks in a playlist (JOIN query)
    async getPlaylistTracks(playlistId: string) {
        const result = await db.select({
            track: tracks,
            addedAt: playlistTracks.addedAt,
        })
            .from(playlistTracks)
            .innerJoin(tracks, eq(playlistTracks.trackId, tracks.id))
            .where(eq(playlistTracks.playlistId, playlistId))
            .orderBy(desc(playlistTracks.addedAt));

        return result.map(r => ({
            ...r.track,
            addedAt: r.addedAt,
        }));
    },

    // --- Play History ---

    // Record a play event
    async recordPlay(track: Track, source: 'local' | 'jellyfin', playDurationMs?: number, completedPlay: boolean = false, playlistId?: string) {
        const id = generateId();

        // For Jellyfin tracks, cache the metadata so it can be viewed in Most Played later without fetching
        if (source === 'jellyfin') {
            await db.insert(cachedTracks).values({
                id: track.id,
                trackDataJson: JSON.stringify(track),
                updatedAt: new Date(),
            }).onConflictDoUpdate({
                target: cachedTracks.id,
                set: {
                    trackDataJson: JSON.stringify(track),
                    updatedAt: new Date(),
                }
            });
        }

        await db.insert(playHistory).values({
            id,
            trackId: track.id,
            playlistId: playlistId || null,
            playedAt: new Date(),
            playDurationMs,
            completedPlay,
            source,
        });
    },

    // Get most played tracks (with play count)
    async getMostPlayed(source: 'local' | 'jellyfin', limit: number = 10) {
        try {
            // Group by trackId, count plays, order by count desc
            const result = await db.select({
                trackId: playHistory.trackId,
                playCount: count(),
            })
                .from(playHistory)
                .where(eq(playHistory.source, source))
                .groupBy(playHistory.trackId)
                .orderBy(desc(count()))
                .limit(limit);

            if (!result || result.length === 0) return [];

            // Fetch full track details for each
            const tracksWithCount = await Promise.all(
                result.map(async (r) => {
                    let trackObj: any = null;
                    if (source === 'local') {
                        const track = await db.select().from(tracks).where(eq(tracks.id, r.trackId)).limit(1);
                        trackObj = track[0] || null;
                    } else {
                        const cached = await db.select().from(cachedTracks).where(eq(cachedTracks.id, r.trackId)).limit(1);
                        if (cached && cached[0]) {
                            try {
                                trackObj = JSON.parse(cached[0].trackDataJson);
                            } catch (e) {
                                console.error('Failed to parse cached track data', e);
                            }
                        }
                    }
                    return trackObj ? { ...trackObj, playCount: r.playCount } : null;
                })
            );

            return tracksWithCount.filter(t => t !== null);
        } catch (error) {
            console.error('getMostPlayed error:', error);
            return []; // Return empty array if table doesn't exist
        }
    },

    // Get recently played tracks
    async getRecentlyPlayed(source: 'local' | 'jellyfin', limit: number = 10) {
        try {
            // Get most recent plays, distinct by track
            const result = await db.select({
                trackId: playHistory.trackId,
                playedAt: playHistory.playedAt,
            })
                .from(playHistory)
                .where(eq(playHistory.source, source))
                .orderBy(desc(playHistory.playedAt))
                .limit(limit * 3); // Get extra to account for duplicates

            if (!result || result.length === 0) return [];

            // Deduplicate by trackId while preserving order
            const seen = new Set<string>();
            const uniquePlays = result.filter(r => {
                if (seen.has(r.trackId)) return false;
                seen.add(r.trackId);
                return true;
            }).slice(0, limit);

            // Fetch full track details
            const tracksWithTime = await Promise.all(
                uniquePlays.map(async (r) => {
                    let trackObj: any = null;
                    if (source === 'local') {
                        const track = await db.select().from(tracks).where(eq(tracks.id, r.trackId)).limit(1);
                        trackObj = track[0] || null;
                    } else {
                        const cached = await db.select().from(cachedTracks).where(eq(cachedTracks.id, r.trackId)).limit(1);
                        if (cached && cached[0]) {
                            try {
                                trackObj = JSON.parse(cached[0].trackDataJson);
                            } catch (e) {
                                console.error('Failed to parse cached track data', e);
                            }
                        }
                    }
                    return trackObj ? { ...trackObj, playedAt: r.playedAt } : null;
                })
            );

            return tracksWithTime.filter(t => t !== null);
        } catch (error) {
            console.error('getRecentlyPlayed error:', error);
            return []; // Return empty array if table doesn't exist
        }
    },

    // Get recently played playlists
    getRecentPlaylists: async (source: 'local' | 'jellyfin', limit: number = 5) => {
        try {
            // Get unique playlistIds from playHistory, ordered by most recent play
            const result = await db.select({
                playlistId: playHistory.playlistId,
                playedAt: sql`MAX(${playHistory.playedAt})`.as('lastPlayed')
            })
                .from(playHistory)
                .where(and(
                    eq(playHistory.source, source),
                    sql`${playHistory.playlistId} IS NOT NULL`
                ))
                .groupBy(playHistory.playlistId)
                .orderBy(desc(sql`lastPlayed`))
                .limit(limit);

            if (!result || result.length === 0) return [];

            // Fetch full playlist details
            const playlistsWithTime = await Promise.all(
                result.map(async (r) => {
                    const pid = r.playlistId;
                    if (!pid) return null;

                    if (source === 'local') {
                        const p = await db.select().from(playlists).where(eq(playlists.id, pid)).limit(1);
                        return p[0] ? { ...p[0], lastPlayed: r.playedAt } : null;
                    } else {
                        return { id: pid, lastPlayed: r.playedAt, isJellyfin: true };
                    }
                })
            );

            return playlistsWithTime.filter(p => p !== null);
        } catch (error) {
            console.error('getRecentPlaylists error:', error);
            return [];
        }
    },

    // Get play count for a specific track
    async getPlayCount(trackId: string) {
        const result = await db.select({ count: count() })
            .from(playHistory)
            .where(eq(playHistory.trackId, trackId));
        return result[0]?.count || 0;
    },

    // Clear play history (for privacy)
    async clearPlayHistory() {
        await db.delete(playHistory);
    },

    // --- Queue State Persistence ---

    // Save current queue state for instant restoration
    async saveQueueState(state: {
        currentTrack: any | null;
        queue: any[];
        originalQueue: any[];
        shuffleMode: boolean;
        repeatMode: string;
        positionMillis: number;
    }) {
        try {
            const now = new Date();
            const data = {
                id: 1, // Singleton row
                currentTrackId: state.currentTrack?.id || null,
                currentTrackJson: state.currentTrack ? JSON.stringify(state.currentTrack) : null,
                queueJson: JSON.stringify(state.queue),
                originalQueueJson: JSON.stringify(state.originalQueue),
                shuffleMode: state.shuffleMode,
                repeatMode: state.repeatMode,
                positionMillis: state.positionMillis,
                updatedAt: now,
            };

            // Upsert: Insert or update the singleton row
            await db.insert(queueState)
                .values(data)
                .onConflictDoUpdate({
                    target: queueState.id,
                    set: {
                        currentTrackId: data.currentTrackId,
                        currentTrackJson: data.currentTrackJson,
                        queueJson: data.queueJson,
                        originalQueueJson: data.originalQueueJson,
                        shuffleMode: data.shuffleMode,
                        repeatMode: data.repeatMode,
                        positionMillis: data.positionMillis,
                        updatedAt: data.updatedAt,
                    }
                });
        } catch (error) {
            console.error('[DatabaseService] Failed to save queue state:', error);
        }
    },

    // Load persisted queue state
    async getQueueState(): Promise<{
        currentTrack: any | null;
        queue: any[];
        originalQueue: any[];
        shuffleMode: boolean;
        repeatMode: 'off' | 'all' | 'one';
        positionMillis: number;
    } | null> {
        try {
            const result = await db.select().from(queueState).where(eq(queueState.id, 1)).limit(1);

            if (result.length === 0) return null;

            const row = result[0];
            return {
                currentTrack: row.currentTrackJson ? JSON.parse(row.currentTrackJson) : null,
                queue: row.queueJson ? JSON.parse(row.queueJson) : [],
                originalQueue: row.originalQueueJson ? JSON.parse(row.originalQueueJson) : [],
                shuffleMode: row.shuffleMode || false,
                repeatMode: (row.repeatMode as 'off' | 'all' | 'one') || 'off',
                positionMillis: row.positionMillis || 0,
            };
        } catch (error) {
            console.error('[DatabaseService] Failed to load queue state:', error);
            return null;
        }
    },

    // Clear saved queue state
    async clearQueueState() {
        await db.delete(queueState);
    },
};

