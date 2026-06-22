# Jellyspot Codebase Issues

Issues found during codebase review, ordered by severity. Each entry includes the file, the problem, a fix description, and the current status.

---

## 🔴 Bugs

### 1. Translation cache wiped on every launch ✅ FIXED

**File:** `src/db/init.ts`  
**Problem:** `DROP TABLE IF EXISTS cached_translations` ran unconditionally on every startup, deleting all cached lyric translations every time the user opened the app.  
**Fix applied:** Removed the `DROP TABLE IF EXISTS cached_translations;` line. Only `CREATE TABLE IF NOT EXISTS` is used now.

---

## 🟠 Medium — Architecture / Reliability

### 2. Circular dependencies resolved with dynamic `require()` ✅ FIXED

**Files:** `src/store/authStore.ts` · `src/services/WebSocketService.ts` · `src/services/AudioService.ts`  
**Problem:** These files used `require()` inside functions to avoid circular import errors at module load time.  
**Fix applied:**
- `WebSocketService` now has a `setDependencies(deps)` method. Dependencies (`jellyfinApi`, `playerStore`, `waitForDeviceId`) are injected from `App.tsx` at startup. Falls back to `require()` if not injected.
- `authStore` now has `setWebSocketService(instance)` and `setPlayerReset(reset)` exports called from `App.tsx`. Falls back to `require()` if not injected.
- `AudioService` has `setRemoteStoreDependencies(deps)` method. Dependencies injected from `App.tsx`.
- `App.tsx` injects all dependencies at startup in its `useEffect`.

**Remaining:** `require()` fallbacks are still present as safety nets. A full removal would require confirming no cold-start race conditions exist.

---

### 3. Database schema defined in two places — already drifted ✅ FIXED

**Files:** `src/db/schema.ts` · `src/db/init.ts`  
**Problem:** The Drizzle schema and the raw `CREATE TABLE` SQL described the same tables and were already out of sync — `downloads` in `schema.ts` was missing `group_id` and `group_name`.  
**Fix applied:** Added `groupId` and `groupName` columns to the `downloads` table in `schema.ts` to re-sync the two sources.

---

### 4. `downloadStore.ts` opens its own database connection ✅ FIXED

**File:** `src/store/downloadStore.ts`  
**Problem:** `openDatabaseSync('jellyspot.db')` created a second database connection instead of using the shared client in `src/db/client.ts`.  
**Fix applied:** Removed the local `openDatabaseSync` call. The store now imports and uses the shared `sqliteDb` instance from `src/db/client.ts`.

---

### 5. Auth token persisted to SQLite inside queue state ✅ FIXED

**File:** `src/store/playerStore.ts` — `persistQueueState()`  
**Problem:** `getStreamUrl()` embedded the auth token in URLs, which were then serialised into `queue_json` / `current_track_json` and written to SQLite.  
**Fix applied:** Added `'streamUrl'` to the `HEAVY_FIELDS` set used by `lightweightReplacer`. Stream URLs (and their embedded tokens) are now stripped before queue state is persisted to the database.

---

### 6. Store actions captured at hook-init time (stale reference risk) ✅ FIXED

**File:** `src/hooks/useTrackActions.ts`  
**Problem:** `addToQueueNext` and `addToQueueEnd` were destructured from `usePlayerStore.getState()` at the top of the hook, capturing references once at initialisation.  
**Fix applied:** Both handler functions now call `usePlayerStore.getState().addToQueueNext(track)` / `.addToQueueEnd(track)` directly inside the handler body.

---

## 🟡 Low — Code Quality / Maintenance

### 7. Inline `darkenHex` in `App.tsx` duplicates shared utility ✅ FIXED

**File:** `App.tsx` · `src/utils/colorUtils.ts`  
**Problem:** A private `darkenHex` helper was defined inside `AppContent` despite `darkenColor` already being available in `colorUtils.ts`.  
**Fix applied:** Added a `darkenHexColor(hex, factor)` export to `colorUtils.ts`. `App.tsx` now imports and uses it, and the inline definition is gone.

---

### 8. Imports split mid-file in `App.tsx` ✅ FIXED

**File:** `App.tsx`  
**Problem:** Several imports appeared after the `AppContent` function definition, breaking standard import ordering.  
**Fix applied:** All imports moved to the top of the file before any function definitions.

---

### 9. `Player` route declared in navigation types but never registered ✅ FIXED

**File:** `src/types/navigation.ts`  
**Problem:** `RootStackParamList` included `Player: undefined`, but no `<Stack.Screen name="Player">` was ever registered.  
**Fix applied:** Removed `Player: undefined` from `RootStackParamList`.

---

### 10. Settings screens registered twice across two stacks ✅ FIXED

**Files:** `src/types/navigation.ts` · `src/navigation/MainNavigator.tsx` · `src/navigation/RootNavigator.tsx`  
**Problem:** `HomeStackParamList` and `LibraryStackParamList` both declared the same 8 settings screens, which were registered twice.  
**Fix applied:** All settings screens (Settings, Stats, Appearance, PlaybackSettings, StorageSettings, SourceModeSettings, DownloadSettings, Dependencies) moved to a `Stack.Group` in `RootNavigator.tsx`. Duplicate screen registrations removed from `HomeStackNavigator` and `LibraryStackNavigator` in `MainNavigator.tsx`. Added settings screen routes to `RootStackParamList`.

---

### 11. `ErrorBoundary` has hardcoded hex colors that bypass theming ✅ FIXED

**File:** `src/components/ErrorBoundary.tsx`  
**Problem:** `StyleSheet.create` used hardcoded hex values that ignored AMOLED mode and the user's custom theme color.  
**Fix applied:** Extracted an `ErrorScreen` function component (which can use `useTheme()`) that is rendered from `ErrorBoundary.render()`. All colors now come from `theme.colors.*`.

---

### 12. DB migration `catch` blocks swallow all errors ✅ FIXED

**File:** `src/db/init.ts`  
**Problem:** Every `ALTER TABLE ... ADD COLUMN` migration had a bare `catch (e) { /* ignore */ }` that silently swallowed unexpected failures.  
**Fix applied:** All migration catch blocks now check `e?.message?.includes('duplicate column')` and only suppress that specific expected error; anything else is re-thrown.

---

### 13. `settingsStore.ts` handles too many unrelated concerns ❌ NOT FIXED

**File:** `src/store/settingsStore.ts`  
**Problem:** A single store manages UI theming, AMOLED mode, audio quality, download settings, lyrics preferences, playback rate, data source, and more — causing unnecessary re-renders on unrelated state changes.  
**Fix description (not implemented):** Split into three focused stores:
- `src/store/uiSettingsStore.ts` — `themeColor`, `isAmoledMode`, `adaptiveBackground`, `backgroundType`
- `src/store/playbackSettingsStore.ts` — `audioQuality`, `playbackRate`, `queueLimit`, `lyricsSourcePreference`, `preferJellyfinLyrics`, `lyricsOffsets`, `translationLanguages`
- `src/store/downloadSettingsStore.ts` — `downloadPath`, `maxConcurrentDownloads`, `wifiOnlyDownloads`
- `settingsStore.ts` would then only contain core app settings: `sourceMode`, `dataSource`, `onboardingComplete`, `localProfile`, `showTechnicalDetails`, `selectedJellyfinLibraries`.

**Status:** The split was partially attempted (some consumer files had references to non-existent stores) but the new store files were never created, and the single `settingsStore.ts` still handles all concerns. The partial references were reverted. A proper split would require creating 3 new store files and updating ~25 consumer files.

---

### 14. `WebSocketService` — `isManuallyClosed` flag has a race condition ✅ FIXED

**File:** `src/services/WebSocketService.ts`  
**Problem:** The flag was reset to `false` synchronously immediately after calling `socket.close()`, before the asynchronous `onclose` event could fire (in dead code within `handleMessage`).  
**Fix applied:** Removed the unreachable dead code that had the race bug. The main `connect()` method already correctly resets `isManuallyClosed` inside the new socket's `onopen` handler, which only fires once the new connection is established — eliminating the race window.

---

### 15. `playlists` state in `useTrackActions` typed as `any[]` ✅ FIXED

**File:** `src/hooks/useTrackActions.ts`  
**Problem:** `useState<any[]>([])` lost type information for the playlists list.  
**Fix applied:** Added a `PlaylistOption { Id: string; Name: string }` interface. The state is now typed as `PlaylistOption[]`, and both the local and Jellyfin branches map to that shape.
