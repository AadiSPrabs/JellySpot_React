import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

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

    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

export const playlists = sqliteTable('playlists', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

// Junction table for playlist tracks to allow multiple playlists per track
export const playlistTracks = sqliteTable('playlist_tracks', {
    playlistId: text('playlist_id').references(() => playlists.id, { onDelete: 'cascade' }).notNull(),
    trackId: text('track_id').references(() => tracks.id, { onDelete: 'cascade' }).notNull(),
    addedAt: integer('added_at', { mode: 'timestamp' }).notNull().default(new Date()),
});

// Play history for tracking plays and "Most Listened" feature
export const playHistory = sqliteTable('play_history', {
    id: text('id').primaryKey(),
    trackId: text('track_id').references(() => tracks.id, { onDelete: 'cascade' }).notNull(),
    playedAt: integer('played_at', { mode: 'timestamp' }).notNull(),
    playDurationMs: integer('play_duration_ms'), // How long they listened
    completedPlay: integer('completed_play', { mode: 'boolean' }).default(false), // Did they finish >80%?
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
    addedAt: integer('added_at', { mode: 'timestamp' }).notNull().default(new Date()),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
});
