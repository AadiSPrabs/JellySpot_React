import { Track } from '../types/track';
import { useSettingsStore } from '../store/settingsStore';
import { db } from '../db/client';
import { cachedTranslations, offlineLyrics } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { fetchJson } from './http';
import { jellyfinApi } from '../api/jellyfin';

export interface LyricsResponse {
    type: 'synced' | 'plain' | 'none';
    lyrics: string | null;
    source: 'jellyfin' | 'lrclib' | null;
}

class LyricsService {
    private readonly LRCLIB_GET_URL = 'https://lrclib.net/api/get';
    private readonly LRCLIB_SEARCH_URL = 'https://lrclib.net/api/search';

    /**
     * Fetch lyrics for a given track based on user preferences.
     * @param track The track to fetch lyrics for
     * @param preferredSource Optional override for the source ('jellyfin' | 'lrclib'). When provided, uses this directly.
     */
    async getLyrics(track: Track | null, preferredSource?: 'jellyfin' | 'lrclib'): Promise<LyricsResponse> {
        if (!track) return { type: 'none', lyrics: null, source: null };

        // 1. Check Offline Lyrics Cache First (only when no override)
        if (!preferredSource) {
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
        }

        // Use override if provided, otherwise fall back to settings preference
        const pref = preferredSource || useSettingsStore.getState().lyricsSourcePreference;

        if (pref === 'offline-only') {
            return { type: 'none', lyrics: null, source: null };
        }

        if (pref === 'jellyfin') {
            const jf = await this.getJellyfinLyrics(track);
            if (jf.type !== 'none') return jf;
            // If no override and fallback enabled, try lrclib as fallback
            if (!preferredSource) {
                return await this.fetchLrclib(track);
            }
            return { type: 'none', lyrics: null, source: null };
        }

        // pref === 'lrclib'
        const lrclibRes = await this.fetchLrclib(track);
        if (lrclibRes.type !== 'none') return lrclibRes;
        // If no override and fallback enabled, try jellyfin as fallback
        if (!preferredSource) {
            return await this.getJellyfinLyrics(track);
        }
        return { type: 'none', lyrics: null, source: null };
    }

    /**
     * Jellyfin lyrics.
     *
     * The server exposes GET /Audio/{itemId}/Lyrics, which returns a LyricDto:
     *
     *   { Metadata: {...}, Lyrics: [{ Text, Start (ticks), Cues }] }
     *
     * That is genuinely synced data, and it was being ignored: this method
     * only ever read `track.lyrics`, which is a plain-text string with no
     * timing. So a server that had timed lyrics would still render as
     * unsynced text.
     *
     * The structured response is now converted to LRC so it flows through the
     * same parser the rest of the app already uses, rather than introducing a
     * second lyrics representation.
     */
    private async getJellyfinLyrics(track: Track): Promise<LyricsResponse> {
        // Prefer the server's structured lyrics when we have an item id.
        if (track.id && !track.id.startsWith('local_')) {
            try {
                const dto = await jellyfinApi.getAudioLyrics(track.id);
                const lines = dto?.Lyrics;
                if (Array.isArray(lines) && lines.length > 0) {
                    const lrc = this.lyricDtoToLrc(lines);
                    if (lrc) {
                        return { type: 'synced', lyrics: lrc, source: 'jellyfin' };
                    }
                }
            } catch {
                // Fall through to the embedded string below.
            }
        }

        // Fallback: whatever text is already attached to the track.
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
     * Converts Jellyfin's LyricDto lines into LRC.
     *
     * `Start` is in ticks (100-nanosecond units), the same unit Jellyfin uses
     * for RunTimeTicks: 1 ms = 10,000 ticks.
     *
     * Returns null when no line carries a usable timestamp, so an unsynced
     * payload falls back to the plain-text path instead of producing a file
     * full of [00:00.00] markers.
     */
    private lyricDtoToLrc(lines: { Text?: string; Start?: number }[]): string | null {
        const TICKS_PER_MS = 10000;
        let hasTiming = false;

        const rendered = lines.map((line) => {
            const text = (line.Text ?? '').replace(/\r?\n/g, ' ').trim();
            const start = typeof line.Start === 'number' ? line.Start : null;

            if (start === null) {
                // No timing for this line - emit it bare so it still shows.
                return text;
            }

            hasTiming = true;
            const totalMs = Math.max(0, Math.round(start / TICKS_PER_MS));
            const minutes = Math.floor(totalMs / 60000);
            const seconds = Math.floor((totalMs % 60000) / 1000);
            const hundredths = Math.floor((totalMs % 1000) / 10);
            const stamp = `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}]`;

            return `${stamp}${text}`;
        });

        if (!hasTiming) return null;
        return rendered.join('\n');
    }

    /**
     * Builds a query string with proper percent-encoding.
     * Note: URLSearchParams encodes spaces as '+', which is only valid for
     * application/x-www-form-urlencoded bodies, not URL query strings.
     */
    private buildQuery(params: Record<string, string | undefined>): string {
        return Object.entries(params)
            .filter(([, v]) => v !== undefined && v !== '')
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
            .join('&');
    }

    /** Maps an LRCLIB record to a response, or null if it carries no lyrics. */
    private toResponse(data: any): LyricsResponse | null {
        if (!data) return null;
        if (data.syncedLyrics) {
            return { type: 'synced', lyrics: data.syncedLyrics, source: 'lrclib' };
        }
        if (data.plainLyrics) {
            return { type: 'plain', lyrics: data.plainLyrics, source: 'lrclib' };
        }
        return null;
    }

    /**
     * Fetches lyrics from LRCLIB using a tiered strategy.
     *
     * The `/api/get` endpoint requires a *correct* album name when one is
     * supplied; an inaccurate album tag (compilations, "Greatest Hits",
     * reissues, or simply a mistagged file) turns a working lookup into a
     * 404/503. So we deliberately degrade the query instead of giving up:
     *
     *   1. Exact match, including album and duration.
     *   2. Exact match without the album (duration still helps disambiguate).
     *   3. Free-text search, picking the result whose duration is closest.
     */
    private async fetchLrclib(track: Track): Promise<LyricsResponse> {
        if (!track.name) return { type: 'none', lyrics: null, source: null };

        const durationSec = track.durationMillis
            ? Math.round(track.durationMillis / 1000)
            : undefined;

        // Tier 1: as specific as possible.
        const tier1 = await this.lrclibGet({
            track_name: track.name,
            artist_name: track.artist,
            album_name: track.album,
            duration: durationSec ? String(durationSec) : undefined,
        });
        if (tier1) return tier1;

        // Tier 2: drop the album, which is the most common source of misses.
        const tier2 = await this.lrclibGet({
            track_name: track.name,
            artist_name: track.artist,
            duration: durationSec ? String(durationSec) : undefined,
        });
        if (tier2) return tier2;

        // Tier 3: free-text search with a duration sanity check.
        return this.lrclibSearch(track.name, track.artist, durationSec);
    }

    /**
     * Exact-match lookup. Returns null on any failure (404, 503, network).
     *
     * `fetchJson` retries transient 5xx/429/network failures and never throws
     * on an unparseable body, so a Cloudflare 520 page degrades to "no match"
     * for this tier (and the caller falls through to the next one) rather than
     * aborting the whole lookup.
     */
    private async lrclibGet(params: Record<string, string | undefined>): Promise<LyricsResponse | null> {
        const url = `${this.LRCLIB_GET_URL}?${this.buildQuery(params)}`;
        const result = await fetchJson(url, { timeoutMs: 8000, retries: 2 });

        if (!result.ok) {
            // A 404 just means "no such track" and is not worth logging.
            if (result.status !== 404) {
                console.warn(`LRCLIB /get failed: ${result.error ?? result.status}`);
            }
            return null;
        }

        return this.toResponse(result.data);
    }

    /**
     * Free-text search fallback. LRCLIB can return several candidates for the
     * same title, so we prefer the one whose duration is closest to the track
     * we are actually playing. Falls back to the first synced result.
     */
    private async lrclibSearch(
        trackName: string,
        artistName: string | undefined,
        durationSec: number | undefined,
    ): Promise<LyricsResponse> {
        const url = `${this.LRCLIB_SEARCH_URL}?${this.buildQuery({
            track_name: trackName,
            artist_name: artistName,
        })}`;

        const result = await fetchJson(url, { timeoutMs: 8000, retries: 2 });

        const noLyrics: LyricsResponse = { type: 'none', lyrics: null, source: null };

        if (!result.ok) {
            if (result.status !== 404) {
                console.warn(`LRCLIB /search failed: ${result.error ?? result.status}`);
            }
            return noLyrics;
        }

        // A 503 `ServerOverloaded` body is a JSON *object*, not an array, so
        // guard the shape rather than trusting the 200.
        const results = result.data;
        if (!Array.isArray(results) || results.length === 0) {
            return noLyrics;
        }

        const withLyrics = results.filter((r: any) => r?.syncedLyrics || r?.plainLyrics);
        if (withLyrics.length === 0) {
            return noLyrics;
        }

        let best = withLyrics[0];
        if (durationSec) {
            // Only trust durations within a sensible window; among those,
            // prefer synced lyrics over plain.
            let bestScore = Infinity;
            for (const candidate of withLyrics) {
                if (typeof candidate.duration !== 'number') continue;
                const delta = Math.abs(candidate.duration - durationSec);
                if (delta > 15) continue;
                const score = delta - (candidate.syncedLyrics ? 0.5 : 0);
                if (score < bestScore) {
                    bestScore = score;
                    best = candidate;
                }
            }
        }

        return this.toResponse(best) ?? noLyrics;
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
            const result = await fetchJson<any>(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
                },
                body: `q=${encodeURIComponent(textToTranslate)}`,
                timeoutMs: 10000,
                // Translation is a best-effort enhancement; one retry is enough.
                retries: 1,
            });

            if (!result.ok) {
                throw new Error(`Translation API failed: ${result.error ?? result.status}`);
            }

            const data = result.data;

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

    async deleteOfflineLyrics(trackId: string) {
        try {
            await db.delete(offlineLyrics).where(eq(offlineLyrics.id, trackId));
            return true;
        } catch (e) {
            console.error('Failed to delete offline lyrics', e);
            return false;
        }
    }
}

export const lyricsService = new LyricsService();
