import { openDatabaseSync } from 'expo-sqlite';

const db = openDatabaseSync('jellyspot.db');

export const initializeDatabase = () => {
    try {
        db.execSync(`
            PRAGMA journal_mode = WAL;
            
            CREATE TABLE IF NOT EXISTS tracks (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT NOT NULL,
                genre TEXT,
                image_url TEXT,
                duration_millis INTEGER NOT NULL,
                stream_url TEXT NOT NULL,
                artist_id TEXT NOT NULL,
                is_favorite BOOLEAN DEFAULT 0,
                bitrate INTEGER,
                codec TEXT,
                container TEXT,
                file_size INTEGER,
                lyrics TEXT,
                track_number INTEGER,
                created_at INTEGER DEFAULT (cast(strftime('%s','now') as int) * 1000) NOT NULL,
                updated_at INTEGER DEFAULT (cast(strftime('%s','now') as int) * 1000) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playlists (
                id TEXT PRIMARY KEY NOT NULL,
                name TEXT NOT NULL,
                created_at INTEGER DEFAULT (cast(strftime('%s','now') as int) * 1000) NOT NULL
            );

            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id TEXT NOT NULL,
                track_id TEXT NOT NULL,
                added_at INTEGER DEFAULT (cast(strftime('%s','now') as int) * 1000) NOT NULL,
                PRIMARY KEY (playlist_id, track_id),
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );
        `);

        // Migration: Add track_number column if it doesn't exist
        try {
            db.execSync('ALTER TABLE tracks ADD COLUMN track_number INTEGER;');
        } catch (e) {
            // Ignore error if column already exists (Duplicate column name)
        }

        // Migration: Create play_history table if it doesn't exist
        try {
            db.execSync(`
                CREATE TABLE IF NOT EXISTS play_history (
                    id TEXT PRIMARY KEY NOT NULL,
                    track_id TEXT NOT NULL,
                    played_at INTEGER NOT NULL,
                    play_duration_ms INTEGER,
                    completed_play INTEGER DEFAULT 0,
                    source TEXT DEFAULT 'local' NOT NULL,
                    playlist_id TEXT
                );
            `);

            // Migration: Add source column for existing installs
            try {
                db.execSync("ALTER TABLE play_history ADD COLUMN source TEXT DEFAULT 'local' NOT NULL;");
            } catch (e) {
                // Ignore if exists
            }

            // Migration: Add playlist_id column for existing installs
            try {
                db.execSync("ALTER TABLE play_history ADD COLUMN playlist_id TEXT;");
            } catch (e) {
                // Ignore if exists
            }

            // Migration: Create cached_tracks table for Jellyfin play history
            db.execSync(`
                CREATE TABLE IF NOT EXISTS cached_tracks (
                    id TEXT PRIMARY KEY NOT NULL,
                    track_data_json TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                );
            `);

        } catch (e) {
            console.error('Failed to create play_history table:', e);
        }

        // Migration: Create queue_state table for instant app restoration
        try {
            db.execSync(`
                CREATE TABLE IF NOT EXISTS queue_state (
                    id INTEGER PRIMARY KEY,
                    current_track_id TEXT,
                    current_track_json TEXT,
                    queue_json TEXT,
                    original_queue_json TEXT,
                    shuffle_mode INTEGER DEFAULT 0,
                    repeat_mode TEXT DEFAULT 'off',
                    position_millis INTEGER DEFAULT 0,
                    updated_at INTEGER
                );
            `);

        } catch (e) {
            console.error('Failed to create queue_state table:', e);
        }

        // Migration: Create downloads table for Jellyfin downloads
        try {
            db.execSync(`
                CREATE TABLE IF NOT EXISTS downloads (
                    id TEXT PRIMARY KEY NOT NULL,
                    name TEXT NOT NULL,
                    artist TEXT NOT NULL,
                    album TEXT,
                    group_id TEXT,
                    group_name TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    progress REAL DEFAULT 0,
                    local_path TEXT,
                    jellyfin_url TEXT,
                    image_url TEXT,
                    duration_millis INTEGER,
                    file_size INTEGER,
                    downloaded_bytes INTEGER DEFAULT 0,
                    error_message TEXT,
                    added_at INTEGER DEFAULT (cast(strftime('%s','now') as int) * 1000) NOT NULL,
                    completed_at INTEGER
                );
            `);

            // Migration: Add group columns if they don't exist (for existing installs)
            try {
                db.execSync('ALTER TABLE downloads ADD COLUMN group_id TEXT');
            } catch (e) { /* Column may already exist */ }
            try {
                db.execSync('ALTER TABLE downloads ADD COLUMN group_name TEXT');
            } catch (e) { /* Column may already exist */ }



        } catch (e) {
            console.error('Failed to create downloads table:', e);
        }

        // Migration: Create cached_translations table
        try {
            db.execSync(`
                DROP TABLE IF EXISTS cached_translations;
                CREATE TABLE IF NOT EXISTS cached_translations (
                    track_id TEXT NOT NULL,
                    language TEXT NOT NULL,
                    translated_lyrics_json TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (track_id, language)
                );
            `);
        } catch (e) {
            console.error("Migration error (cached_translations):", e);
        }

        // Migration: Create offline_lyrics table
        try {
            db.execSync(`
                CREATE TABLE IF NOT EXISTS offline_lyrics (
                    id TEXT PRIMARY KEY NOT NULL,
                    lyrics TEXT NOT NULL,
                    updated_at INTEGER NOT NULL
                );
            `);
        } catch (e) {
            console.error("Migration error (offline_lyrics):", e);
        }

        return true;
    } catch (error) {
        console.error('Failed to initialize database:', error);
    }
};
