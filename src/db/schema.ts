import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const tracks = sqliteTable('tracks', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    artist: text('artist').notNull(),
    album: text('album').notNull(),
    genre: text('genre'),
    imageUrl: text('image_url'),
    durationMillis: integer('duration_millis').notNull(),
    streamUrl: text('stream_url').notNull(),
    artistId: text('artist_id').notNull(),
    isFavorite: integer('is_favorite', { mode: 'boolean' }).default(false),
    trackNumber: integer('track_number'),

    // Technical details
    bitrate: integer('bitrate'),
    codec: text('codec'),
    container: text('container'),
    fileSize: integer('file_size'),
    lyrics: text('lyrics'),

    createdAt: integer('created_at').notNull().default(sql`(cast(strftime('%s','now') as int))`),
    updatedAt: integer('updated_at').notNull().default(sql`(cast(strftime('%s','now') as int))`),
});

export const playlists = sqliteTable('playlists', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull().default(sql`(cast(strftime('%s','now') as int))`),
});

// Junction table for playlist tracks to allow multiple playlists per track
export const playlistTracks = sqliteTable('playlist_tracks', {
    playlistId: text('playlist_id').references(() => playlists.id, { onDelete: 'cascade' }).notNull(),
    trackId: text('track_id').references(() => tracks.id, { onDelete: 'cascade' }).notNull(),
    addedAt: integer('added_at').notNull().default(sql`(cast(strftime('%s','now') as int))`),
});

export const playHistory = sqliteTable('play_history', {
    id: text('id').primaryKey(),
    trackId: text('track_id').notNull(),
    playedAt: integer('played_at', { mode: 'timestamp' }).notNull(),
    playDurationMs: integer('play_duration_ms'), // How long they listened
    completedPlay: integer('completed_play', { mode: 'boolean' }).default(false), // Did they finish >80%?
    source: text('source').notNull().default('local'), // 'local' or 'jellyfin'
});

// Cache for Jellyfin tracks so we can show them in history natively
export const cachedTracks = sqliteTable('cached_tracks', {
    id: text('id').primaryKey(), // The Jellyfin item ID
    trackDataJson: text('track_data_json').notNull(), // Serialized MediaItem / Track data
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// Queue state persistence for instant restoration on app wake
export const queueState = sqliteTable('queue_state', {
    id: integer('id').primaryKey(), // Always 1 for singleton row
    currentTrackId: text('current_track_id'),
    currentTrackJson: text('current_track_json'), // Full track object for instant display
    queueJson: text('queue_json'), // JSON array of track objects
    originalQueueJson: text('original_queue_json'), // Original queue before shuffle
    shuffleMode: integer('shuffle_mode', { mode: 'boolean' }).default(false),
    repeatMode: text('repeat_mode').default('off'),
    positionMillis: integer('position_millis').default(0),
    updatedAt: integer('updated_at', { mode: 'timestamp' }),
});

// Downloads table for tracking Jellyfin downloads
export const downloads = sqliteTable('downloads', {
    id: text('id').primaryKey(), // Jellyfin item ID
    name: text('name').notNull(),
    artist: text('artist').notNull(),
    album: text('album'),
    status: text('status').notNull(), // 'pending' | 'downloading' | 'completed' | 'failed' | 'cancelled'
    progress: real('progress').default(0), // 0-100
    localPath: text('local_path'), // Path after download complete
    jellyfinUrl: text('jellyfin_url'), // Original stream URL from Jellyfin
    imageUrl: text('image_url'),
    durationMillis: integer('duration_millis'),
    fileSize: integer('file_size'), // Expected size in bytes
    downloadedBytes: integer('downloaded_bytes').default(0),
    errorMessage: text('error_message'), // Error details if failed
    addedAt: integer('added_at').notNull().default(sql`(cast(strftime('%s','now') as int))`),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
});

// Cache for translated lyrics
export const cachedTranslations = sqliteTable('cached_translations', {
    trackId: text('track_id').notNull(),
    language: text('language').notNull(),
    translatedLyricsJson: text('translated_lyrics_json').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    // Primary key constraint handled in SQL
});

// Cache for manually searched/downloaded lyrics
export const offlineLyrics = sqliteTable('offline_lyrics', {
    id: text('id').primaryKey(), // The track ID
    lyrics: text('lyrics').notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});
