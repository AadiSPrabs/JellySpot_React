import { Track } from '../types/track';
import { useSettingsStore } from '../store/settingsStore';
import { db } from '../db/client';
import { cachedTranslations, offlineLyrics } from '../db/schema';
import { eq, and } from 'drizzle-orm';

export interface LyricsResponse {
    type: 'synced' | 'plain' | 'none';
    lyrics: string | null;
    source: 'jellyfin' | 'lrclib' | null;
}

class LyricsService {
    private readonly LRCLIB_URL = 'https://lrclib.net/api/get';

    /**
     * Fetch lyrics for a given track based on user preferences.
     */
    async getLyrics(track: Track | null): Promise<LyricsResponse> {
        if (!track) return { type: 'none', lyrics: null, source: null };

        // 1. Check Offline Lyrics Cache First
        try {
            const cached = await db.select()
                .from(offlineLyrics)
                .where(eq(offlineLyrics.id, track.id))
                .limit(1);

            if (cached.length > 0) {
                const lyrics = cached[0].lyrics;
                const isSynced = lyrics.includes('[00:');
                return {
                    type: isSynced ? 'synced' : 'plain',
                    lyrics,
                    source: 'lrclib' // or local, but we'll treat as explicit
                };
            }
        } catch (e) {
            console.error('Failed to query offline_lyrics', e);
        }

        const pref = useSettingsStore.getState().lyricsSourcePreference;

        if (pref === 'offline-only') {
            return this.getJellyfinLyrics(track);
        }

        if (pref === 'jellyfin') {
            const jf = this.getJellyfinLyrics(track);
            if (jf.type !== 'none') return jf;
            return await this.fetchLrclib(track);
        }

        if (pref === 'lrclib') {
            const lrclibRes = await this.fetchLrclib(track);
            if (lrclibRes.type !== 'none') return lrclibRes;
            return this.getJellyfinLyrics(track);
        }

        return { type: 'none', lyrics: null, source: null };
    }

    /**
     * Extracts existing lyrics from the Jellyfin track object if available.
     * Note: Jellyfin API currently drops synchronized lyrics locally into `track.lyrics` as plain text. 
     * If they contain `[00:00.00]`, we consider them synced.
     */
    private getJellyfinLyrics(track: Track): LyricsResponse {
        if (!track.lyrics) return { type: 'none', lyrics: null, source: null };

        // Simple heuristic to check if it's LRC format
        const isSynced = track.lyrics.includes('[00:');

        return {
            type: isSynced ? 'synced' : 'plain',
            lyrics: track.lyrics,
            source: 'jellyfin'
        };
    }

    /**
     * Fetches lyrics from LRCLIB API.
     */
    private async fetchLrclib(track: Track): Promise<LyricsResponse> {
        try {
            // Minimal required fields: track_name, artist_name
            if (!track.name) return { type: 'none', lyrics: null, source: null };

            const params = new URLSearchParams();
            params.append('track_name', track.name);
            if (track.artist) params.append('artist_name', track.artist);
            if (track.album) params.append('album_name', track.album);
            if (track.durationMillis) {
                params.append('duration', Math.round(track.durationMillis / 1000).toString());
            }

            const url = `${this.LRCLIB_URL}?${params.toString()}`;
            console.log('Fetching lyrics from:', url);

            const response = await fetch(url);
            if (!response.ok) {
                if (response.status !== 404) {
                    console.warn(`LRCLIB returned ${response.status}`);
                }
                return { type: 'none', lyrics: null, source: null };
            }

            const data = await response.json();

            if (data.syncedLyrics) {
                return {
                    type: 'synced',
                    lyrics: data.syncedLyrics,
                    source: 'lrclib'
                };
            } else if (data.plainLyrics) {
                return {
                    type: 'plain',
                    lyrics: data.plainLyrics,
                    source: 'lrclib'
                };
            }

        } catch (error) {
            console.error('Failed to fetch from LRCLIB:', error);
        }

        return { type: 'none', lyrics: null, source: null };
    }

    /**
     * Translates an array of LRC lines to a target language.
     * Caches the result in the local SQLite database.
     */
    async translateLyrics(trackId: string, lines: { time: number; text: string }[], targetLang: string): Promise<{ time: number; text: string; translation?: string }[]> {
        if (!trackId || lines.length === 0 || targetLang === 'none') {
            return lines;
        }

        try {
            // 1. Check Cache
            const cached = await db.select()
                .from(cachedTranslations)
                .where(and(
                    eq(cachedTranslations.trackId, trackId),
                    eq(cachedTranslations.language, targetLang)
                ))
                .limit(1);

            if (cached.length > 0) {
                try {
                    const translations: string[] = JSON.parse(cached[0].translatedLyricsJson);
                    return lines.map((line, i) => ({ ...line, translation: translations[i] }));
                } catch (e) {
                    console.error('Failed to parse cached translation JSON', e);
                }
            }

            // 2. Fetch Translation
            const isRomanization = targetLang === 'rm';
            const separator = isRomanization ? ' | ' : '\n';
            const textToTranslate = lines.map(l => l.text || ' ').join(separator); // use ' ' for empty lines so separator isn't adjacent

            const tlParam = isRomanization ? 'en' : targetLang; // Google requires a real tl even for transliteration
            const dtParams = isRomanization ? '&dt=t&dt=rm' : '&dt=t';
            const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tlParam}${dtParams}`;

            // Use POST to avoid URL length limits for long songs
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                },
                body: `q=${encodeURIComponent(textToTranslate)}`
            });

            if (!response.ok) throw new Error(`Translation API failed: ${response.status}`);

            const data = await response.json();

            // Google Translate formats
            let translatedText = '';

            if (isRomanization) {
                // Romanization block is attached as a single string at the very end of the arrays
                // data[0][lastIndex][3] contains the full transliterated text separated by the separator
                if (data && data[0] && Array.isArray(data[0])) {
                    const lastItem = data[0][data[0].length - 1];
                    if (lastItem && lastItem.length >= 4) {
                        translatedText = lastItem[3] || '';
                    } else if (lastItem && lastItem.length === 2 && lastItem[1] && typeof lastItem[1] === 'string') {
                        translatedText = lastItem[1];
                    }
                }
            } else {
                // Normal translation: data[0] is array of segments. sum data[0][i][0]
                if (data && data[0]) {
                    data[0].forEach((item: any) => {
                        if (item && item[0]) translatedText += item[0];
                    });
                }
            }

            const translationsArr = translatedText.split(isRomanization ? ' | ' : '\n').map(t => t.trim());

            // 3. Save to Cache
            try {
                // SQLite constraint will cause this to fail if it exists unless we do upsert, but Drizzle SQLite doesn't have onConflictDoUpdate easily.
                // We'll delete and insert.
                await db.delete(cachedTranslations)
                    .where(and(
                        eq(cachedTranslations.trackId, trackId),
                        eq(cachedTranslations.language, targetLang)
                    ));

                await db.insert(cachedTranslations).values({
                    trackId,
                    language: targetLang,
                    translatedLyricsJson: JSON.stringify(translationsArr),
                    updatedAt: new Date()
                });
            } catch (e) {
                console.error("Cache save failed", e);
            }

            // 4. Return merged array
            return lines.map((line, i) => ({ ...line, translation: translationsArr[i] || '' }));

        } catch (error) {
            console.error('Failed to translate lyrics:', error);
            return lines;
        }
    }

    /**
     * Manually save a searched lyric to the DB to bypass auto-fetch
     */
    async saveOfflineLyrics(trackId: string, lyrics: string) {
        try {
            await db.delete(offlineLyrics).where(eq(offlineLyrics.id, trackId));
            await db.insert(offlineLyrics).values({
                id: trackId,
                lyrics,
                updatedAt: new Date()
            });
            return true;
        } catch (e) {
            console.error('Failed to save offline lyrics', e);
            return false;
        }
    }
}

export const lyricsService = new LyricsService();
