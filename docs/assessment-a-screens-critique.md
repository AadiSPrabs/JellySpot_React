# Assessment A — Design Critique: Jellyspot Screens (ex-PlayerScreen / ex-QueuePanel)

Scope: 16 screens under `src/screens/` plus the shared visual system (`theme/theme.ts`, `theme/radius.ts`, `Skeleton.tsx`, `EmptyState.tsx`, `Loader.tsx`, `SongItem.tsx`, `MediaCard.tsx`, `SettingsGroup.tsx`, `SettingsItem.tsx`, `SourceSwitcher.tsx`, `ShuffleFab.tsx`, `ActionSheet.tsx`).

Method: source reading only. No detector run. Every claim below quotes the code that proves it. Line counts were verified against the files: `DetailScreen.tsx` is **2454** lines and `HomeScreen.tsx` is **1979** (the brief cited 2296 and 1834 — those figures come from newline-counting that discards the final segment; both files end with a newline, so the true totals are one higher than the count of `\n` characters plus the final line). Other verified totals: `SourceModeSettingsScreen.tsx` 937, `OnboardingScreen.tsx` 763, `SearchScreen.tsx` 710, `LibraryScreen.tsx` 565, `StorageSettingsScreen.tsx` 550, `DownloadsScreen.tsx` 410, `SettingsScreen.tsx` 225.

---

## 1. Design Specificity Verdict

**Verdict: category-interchangeable, with one orphaned exception.**

This is a competent Material Design 3 music app. It is not an authored product. The single most damning piece of evidence is a negative: the two features that make Jellyspot *Jellyspot* — the dynamic artwork-derived accent palette and the film-grain overlay — appear in exactly **one file**:

```
src/screens/PlayerScreen.tsx:824   {/* Film grain texture overlay */}
src/screens/PlayerScreen.tsx:824   <GrainOverlay opacity={0.35} />
```

```
$ grep -r "filmGrain|grain|FilmGrain" src/
src\screens\PlayerScreen.tsx  Line 823: {/* Film grain texture overlay */}
```

That is the complete result set. The film grain never leaves the player. Likewise the accent palette: `PlayerScreen.tsx:1596` uses `dynamicColors?.gradientColors`, and `HomeScreen.tsx:1257-1267` and `DetailScreen.tsx:1959-1962` each do their own *independent, differently-computed* glow (`glowColor`, `${glowColor}40`) rather than consuming a shared palette. Three screens compute album-derived color three different ways; thirteen screens compute none at all — and for playlists and genres, `DetailScreen` does not derive it at all:

```tsx
373:    const getPlaylistRandomColor = () => {
374:        const vibrantColors = [
375:            '#FF4D4D', '#FF9E4D', '#FFD74D', '#4DFF88',
376:            '#4DFFFF', '#4D88FF', '#9E4DFF', '#FF4DFF',
377:            '#FF4D88', '#4DFFD7'
378:        ];
379:        return vibrantColors[Math.floor(Math.random() * vibrantColors.length)];
380:    };
```

A playlist's "signature color" is `Math.random()` over a 10-swatch palette including `#FF4DFF` magenta and `#4DFFFF` cyan — re-rolled on every mount, unrelated to the artwork, and outside the theme. The two features that make the app itself appear in one file and one function, and one of the two is a dice roll.

Strip the name off and you have Apple Music. The evidence, by artifact:

**Generic card grid.** `MediaCard.tsx:49-71` is a 150x150 square with a bottom scrim and `borderRadius: 16`. It renders `item.Name` alone — no artist, no year, no play affordance:

```tsx
cardContent: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 8, paddingVertical: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
},
```

**Stock Material used without customization.** `theme.ts` is not a theme; it is a copy-paste of the M3 baseline:

```ts
primary: '#D0BCFF', // Example M3 primary
onPrimary: '#381E72',
primaryContainer: '#4F378B',
```

The comment `// Example M3 primary` is literally in the source. These are the documented Material 3 baseline purple values, unchanged. `secondary: '#CCC2DC'`, `tertiary: '#EFB8C8'` — all stock M3. Every screen then spreads this through `useTheme()`, which is why Library, Search, Settings, Downloads and Storage are visually indistinguishable from a Material demo app.

**Icon + heading + text cards repeated endlessly.** `OnboardingScreen.tsx` defines `SourceCard` (lines 21-77) as icon-in-rounded-square + title + description. `SourceModeSettingsScreen.tsx:352-393` then re-implements the *same* pattern a second time, in the same app, for the same two concepts ("Jellyfin Server" / "Local Music"), with a different icon size (48 vs 56), different radius (12 vs 16), and different letter case. Two hand-rolled copies of one pattern.

**Identical spacing everywhere.** `HomeScreen.tsx:1913-1917` — every section is `marginBottom: 32`, every title is `marginLeft: 20, marginBottom: 16`. `SettingsGroup.tsx:15` hardcodes `marginBottom: 24, marginHorizontal: 16`. There is no spacing scale; there are three magic numbers (`32`, `24`, `16`) applied globally regardless of content weight. A row of genre chips gets the same 32px as a hero row.

**The AI-palette tell is inverted here, which is worse.** The brief flags purple/cyan-on-dark as a tell. Jellyspot has purple-on-dark (`#D0BCFF` on `#1C1B1F`) — but it is the *Material* purple, not an AI gradient. So it fails differently: not "generated", but "never decided". `AppearanceScreen.tsx:11-20` exposes an 8-swatch `THEME_COLORS` picker where the user may override the accent with `"#FFD700"` Gold or `"#FF6347"` Tomato — which then has no relationship to the artwork-derived palette the player computes. The app ships two competing color authorities.

**Gradient text.** `fontFamily: 'cursive', fontStyle: 'italic'` wordmark is used as the brand in three places: `LoginScreen.tsx:216`, `ServerSelectScreen.tsx:125`, `SettingsScreen.tsx:171`. It renders as a Comic-Sans-adjacent system script font on Android. This is the *only* recurring brand artifact in the app, and it is a platform font fallback.

**Glassmorphism.** Absent — nothing decorative to flag. Credit where due.

**Where specificity actually exists, and is then abandoned.** Three real authored moments:
1. `StatsScreen.tsx:131-151` — the hero card, `THIS MONTH` / big numeral / `of listening`, on a primary→tertiary→`#1a1a1a` gradient, `height: 200, borderRadius: 24`. This is a genuinely designed surface.
2. `SearchScreen.tsx:23-32` + `651-664` — genre tiles with a rotated album crop (`transform: [{ rotate: '25deg' }]`, `right: -10, bottom: -5`). Distinctive, memorable, product-flavored. The file's own comment says `// Predefined colors for genre cards to make them pop properly like Spotify` — which is an admission of the borrowed source.
3. `OnboardingScreen.tsx:332-339` — the step indicator grows the active pill (`width: 24` vs `8`). Small, correct, authored.

These three are islands. Nothing else in 16 screens shares their sensibility.

**Specificity score: 2/10.** The product has a visual identity that its own screens do not use.

---

## 2. Nielsen's 10 Heuristics (0-4 each)

### H1. Visibility of system status — **2/4**
`StorageSettingsScreen.tsx:249-285` has two genuine progress bars (`Extracting metadata... {enrichProgress}%`, `Scanning library... {scanProgress}%`). But the app's most common async operation, search, reports progress with a *skeleton that hides the result region*: `SearchScreen.tsx:456-457` `loading ? <SearchSkeleton />`, and `searchHistory`/genres vanish for the duration. Worse, `SearchScreen.tsx:483-485` uses a bare `ActivityIndicator` for genres while the results list uses `SearchSkeleton` — two loading vocabularies in one screen.

The sharpest failure: `LibraryScreen.tsx:228` / `312` / `384` all render loading as exactly two skeleton rows:
```tsx
if (isLoading) return <View style={{ width: pageWidth, padding: 16 }}><ListItemSkeleton /><ListItemSkeleton /></View>;
```
Two 48px rows for a library of thousands. Then it snaps to a full list. That is not a loading state; it is a flicker.

Also `HomeScreen.tsx:1234-1238`: `showContentSkeleton` requires `latestMusic.length === 0 && resumeItems.length === 0`, so on any refresh with cached data the user gets no indication at all.

`DetailScreen.tsx` is worse still. Loading the screen shows a bare spinner with no context:
```tsx
1146:      if (loading || !item) {
1147:        return <Loader />;
1148:      }
```
and `Loader.tsx:12-25` is an unstyled `ActivityIndicator size="large"` centered on a flat background. Then the track list's `ListEmptyComponent` (2049-2057) renders skeletons **only while `tracksLoading` is true** and returns `null` otherwise — so a playlist whose search filter (`DetailScreen.tsx:141-175`) matches nothing renders a header followed by **nothing at all**. No `"No results"`, no `EmptyState`, no count. The user sees the `placeholder="Find in playlist"` field (1591) and blank space beneath it, and cannot tell whether the search is running, empty, or broken. `DetailScreen` contains no `Snackbar` and no `EmptyState` anywhere.

### H2. Match between system and real world — **2/4**
Vocabulary is largely honest and domain-correct. But it drifts:
- `LibraryScreen.tsx:109` renders the raw Jellyfin enum as the user-facing subtitle: `<Text ...>{description}</Text>` where `description = item.Type || item.type`. For a non-matched type the user reads `MusicAlbum` or `Audio`, not a human word.
- `SearchScreen.tsx:332-334` uses a `•` separator for a "type" concept: `` `Song • ${item.AlbumArtist ...}` `` — but `LibraryScreen` shows genre, `DownloadsScreen.tsx:133` shows `` {item.artist}{item.album ? ` • ${item.album}` : ''} ``, and `StatsScreen.tsx:277` shows artist only. Four different definitions of subtitle across four list surfaces.
- `SettingsScreen.tsx:109` labels the stats screen **"Listening Tracker"**, while `StatsScreen.tsx:121` titles itself **"Listening Tracker"** but the app's own code calls it stats (`StatsScreen`, `loadStats`, `getListeningStats`). The word "Tracker" carries surveillance connotation for what is a personal listening-history view.

### H3. User control and freedom — **2/4**
Real strengths: `HomeScreen.tsx:488-492` `exitSelectionMode()` on an explicit close icon; `HomeScreen.tsx:1566` pull-to-refresh.

Real problems:
- `LibraryScreen.tsx:251` — deleting a playlist is **immediate and permanent** on confirm, with no undo:
  ```tsx
  <Button mode="contained" buttonColor={theme.colors.error} onPress={handleDeletePlaylist} style={{ flex: 1 }}>Delete</Button>
  ```
  `handleDeletePlaylist` (187-203) calls `localLibrary.deletePlaylist(id)` or `jellyfinApi.deleteItem(id)` and there is no snackbar, no undo, no toast. Compare `SettingsScreen.tsx:177-188`, which *does* own a `Snackbar` — the pattern exists in the codebase and simply was not used here.
- `DownloadsScreen.tsx:175-181` — deleting a downloaded file is a single unconfirmed tap:
  ```tsx
  {!isActive && (
      <IconButton icon="delete-outline" size={20} onPress={() => handleRemove(item.id)} />
  )}
  ```
  `handleRemove` (87-89) calls `removeDownload(id)` directly. A 20px icon, adjacent to a retry icon, destroys an offline file. No dialog, no undo.
- `OnboardingScreen.tsx:345-347` — `scrollEnabled={false}` on the pager. Back is only available via the footer button, which at `step === 1` is **not rendered at all** (`{step !== 1 && (<Button .../>)}` at line 607). The user mid-Jellyfin-login has no Continue and no Back — only the `Back` button at 597-605, which is `step > 0` so it is present. Net: on step 1 the primary CTA disappears entirely, an inconsistent footer across steps 0/2/3.

### H4. Consistency and standards — **1/4**
This is the weakest heuristic. Measured inconsistencies:

*Radii.* `radius.ts` defines a 5-role scale (`xs4/sm8/md12/lg20/pill999`) with a comment explaining it exists because "The codebase had grown 14 distinct radius values". It is imported by exactly two files: `MiniPlayer.tsx` and `QueuePanel.tsx` — both outside my scope.
```
$ grep -r "RADIUS" src/
src\theme\radius.ts
src\components\MiniPlayer.tsx:6,357,378
src\components\QueuePanel.tsx:22,65,101,744,870,871,882,883,924,932,952,964,984
```
Every screen in scope still hardcodes literals. `grep "borderRadius: \d+" src/screens` returns **85 matches** with these distinct values in use: `2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 30, 50`. `18` values where `5` roles are declared. `StatsScreen.tsx` alone uses five in one file: card `24` (328), statBox `16` (376), chart `20` (381), trackItem `14` (391), rankBadge `14` (397), trackImage `8` (408), recentImage `6` (420). The declared system is not merely under-adopted; it is contradicted.

*App bars.* Four different implementations:
- `SettingsScreen.tsx:77-80`: `<IconButton icon="arrow-left" size={isLandscape ? 20 : 24} />` + `titleLarge`, `marginBottom: 16`
- `AppearanceScreen.tsx:59-71`: same shape, `marginBottom: 16`
- `PlaybackSettingsScreen.tsx:29-34`: `size` omitted (defaults 24), no landscape variant
- `SourceModeSettingsScreen.tsx:331-336`: `height: 56, minHeight: 56`, `zIndex: 1`
- `DependenciesScreen.tsx:72-75`: `marginBottom: 8`
- `StatsScreen.tsx:119-123`: centered title with a `<View style={{ width: 48 }} />` spacer to balance the back button
- `DownloadsScreen.tsx:261-265`: **no back button**, left-aligned `headlineMedium`
- `LibraryScreen.tsx:479-491`: avatar-left, title-center, conditional plus-right

Eight header patterns for eight screens. `SourceModeSettingsScreen` fixes its height at 56; `SettingsScreen` does not.

*Destructive color.* `theme.colors.error` is used by `LibraryScreen.tsx:251`, `HomeScreen.tsx:1340`, `SourceModeSettingsScreen.tsx:546`. Hardcoded `#f44336` is used by `HomeScreen.tsx:1805,1807`, `DetailScreen.tsx:2171,2173,2209,2211,2241,2273`, `DownloadsScreen.tsx:107,149,244`. Android Material Red `#f44336` is not `theme.colors.error` (which in M3 dark resolves near `#F2B8B5`). Destructive affordances render in two different reds depending on which screen you are on.

*Green.* `DownloadsScreen.tsx:106` invents `'#4CAF50'` for completed. Success green is not in the theme at all.

*Success/failure feedback.* `SettingsScreen.tsx:50` says `'Backup exported successfully!'` with an exclamation; `DownloadSettingsScreen.tsx:100-103` uses a `ConfirmationDialog` with title `"Success"` and message `"Download location updated! Downloads will now save to this folder."`; `StorageSettingsScreen` uses `Alert.alert`; `HomeScreen.tsx:307` uses `Alert.alert`. Four feedback mechanisms — Snackbar, ConfirmationDialog, Alert, and none.

*Tab labels.* `LibraryScreen.tsx:501-503` renders `{filter.charAt(0).toUpperCase() + filter.slice(1)}` — capitalizing the internal state key. The tabs read `Playlists / Artists / Albums` by accident of `charAt`, not by design.

### H5. Error prevention — **1/4**
Positive: `DetailScreen.tsx:2250-2280` and `:2220-2248` do confirm deletes and removals with `buttonColor="#f44336"` and explicit consequence text (`"This action cannot be undone."`). `HomeScreen.tsx:307-337` confirms server deletes with `style: 'destructive'`. `HomeScreen.tsx:1850-1879` handles the duplicate-song case with an `Add Anyway` affordance — genuinely thoughtful.

Negative, and severe:
- `DownloadsScreen.tsx` delete: no confirmation (see H3).
- `LibraryScreen.tsx` playlist delete: confirmed but no undo and no consequence copy — the dialog body is only `Delete "{name}"?` (line 247), which does not state that the playlist is destroyed server-side for Jellyfin users.
- `StorageSettingsScreen.tsx:416-423` — `Deselect All` calls `deselectAllFolders` with **no confirmation and no undo**. If the user has 12 folders selected and taps it, `getFilteredTracks()` empties the library: `StorageSettingsScreen.tsx:43` `const filteredTracksCount = getFilteredTracks().length;`. The user's entire visible library disappears from Home and Library (both read `getFilteredTracks()` — `HomeScreen.tsx:730`, `LibraryScreen.tsx` via data). One tap, no warning, no reversal path surfaced. The only hint is the help text at 402-404.
- `HomeScreen.tsx:569-571` — for local mode, the batch delete explicitly *skips* the confirm dialog:
  ```tsx
  if (isLocal) {
      // System dialogs will appear
      performBatchDelete();
  } else {
      Alert.alert('Delete Selected', ...)
  }
  ```
  The comment concedes the design: the app knowingly outsources confirmation to an OS dialog and, per the code's own note at 547-552, may trigger *one system prompt per file* while looping (`for (const track of tracksToDelete) await localLib.deleteTrack(track);`).
- `DetailScreen.tsx:312-323` — **identical defect, verbatim logic, in a second file.** The local branch calls `performBatchDelete()` with no dialog at all, and the loop at 296-298 has no rollback on partial failure:
  ```tsx
  if (isLocal) {
      performBatchDelete();
  } else {
      Alert.alert(
          'Delete Selected',
          `Permanently delete ${selectedTracks.size} selected tracks from server?`,
          [...]
      );
  }
  ```
  Note that the Jellyfin path — the *recoverable* one, since a server library is authoritative — gets a careful `"Permanently delete N selected tracks from server?"` confirmation, while the local path — the *irreversible* one, since the file is gone from the device — gets nothing. The confirmation is applied to the wrong source.
- `TextInput` has no input validation or masking anywhere. `ServerSelectScreen.tsx:34-38` does silent URL coercion — if the user types `myserver.com:8096` it becomes `http://myserver.com:8096` without telling them, so a user who meant HTTPS gets a plaintext attempt and an unhelpful `'Could not connect to server. Please check the URL.'` (line 45).

### H6. Recognition rather than recall — **2/4**
Recognition aids that exist: `SearchScreen.tsx:461-482` persists `Recent Searches` to `AsyncStorage` with a `Clear` action — good. `HomeScreen.tsx:1004-1100` builds a "Recently played" shortcut grid. `SourceModeSettingsScreen.tsx:490-492` spells out the empty-selection rule.

Recall burdens imposed:
- The single most important setting — **which music source you are browsing** — is represented in `LibraryScreen`, `SearchScreen`, `StatsScreen`, `StorageSettingsScreen` only implicitly. `LibraryScreen.tsx:487` says `Your Library` regardless of source. `SearchScreen.tsx:517-520` labels sections `Local Library` / `Jellyfin`, which is the only explicit labeling in the app. The user must remember which mode they are in.
- `SourceSwitcher` exists in exactly one place: `HomeScreen.tsx:1410-1420`, gated `{sourceMode === "both" && ...}`. The Settings screens tell the user to go find it: `StorageSettingsScreen.tsx:466` `"Switch between Jellyfin and Local mode using the toggle on the Home screen."` and `SourceModeSettingsScreen.tsx:755` `"You can switch between sources using the toggle on the Home screen"`. Two separate settings screens instruct the user to navigate elsewhere to perform the adjacent action.
- `DetailScreen`'s four header layouts (artist / playlist / genre / album) each place sort at a different position with no persistent label. The sort control is icon-only (`icon="sort-variant"`, lines 1219, 1563, 1668, 1919) and appears four times in one file — with `size={28}` on artist/genre/default but no size on any of them being distinguishable. The user must remember what they last chose; the current sort is only discoverable by opening a sheet titled `"Sort Options"` (2314) containing five unmarked rows where the active one is indicated solely by a `check` icon on the right (2321-2328). If you close the sheet without noting the checkmark, you cannot tell how your playlist is ordered — the list itself carries no sort indicator and no column headers.

  The same file also duplicates the entire ActionSheet stack: `DetailScreen.tsx:2084` and `:2184` both produce a sheet titled `"Track Options"` with different contents, and `HomeScreen.tsx:1769-1813` produces a *third* with a fourth content set. Three "Track Options" sheets across two files.
- `HomeScreen.tsx:1793-1811`: the track menu shows `Delete from Device` only when `dataSource === "local"` and `Download` only when not. Users switching sources see menu items appear and disappear with no explanation.

### H7. Flexibility and efficiency of use — **3/4**
Genuine accelerators: long-press → multi-select (`HomeScreen.tsx:462-469`) with a batch action sheet; pull-to-refresh on Home/Library/Downloads/Stats; `Quick Connect` as an alternative to typed credentials in three places (`LoginScreen`, `OnboardingScreen`, `SourceModeSettingsScreen`); `Select All`/`Deselect All` for folders and libraries; `Sort Options` with five keys (`DetailScreen.tsx:2310-2406`); search-in-playlist (`DetailScreen.tsx:1591`).

Deductions: there are no user-facing shortcuts, no "play all from here", no persistent queue affordance from these screens, and no keyboard/focus order handling at all. Multi-select exists only on `HomeScreen`, not on `DetailScreen`'s list, not on `LibraryScreen`, not on `DownloadsScreen` — you cannot batch-delete downloads or batch-remove from a playlist.

### H8. Aesthetic and minimalist design — **2/4**
`StatsScreen.tsx:131-151` hero is restrained and good. `SearchScreen.tsx:633-644` genre tiles are tight.

The Home screen is the failure. It renders, in fixed order: greeting + random subtitle, then **Recently played** grid (up to 6 chips), then **Most Played** (5 songs), **Unstoppable Favorites** (all favorites, horizontal), **Artists You Like** (horizontal), **Explore Genres** (up to 15 chips), **Quick Picks** (5 songs), **Recently Added** (all, horizontal). That is up to **7 content sections** plus header before you reach anything actionable, inside a `ScrollView` with `contentContainerStyle={{ paddingBottom: 180, minHeight: height }}` (`HomeScreen.tsx:1288`).

The section set is unstable: `HomeScreen.tsx:1566, 1593, 1626, 1646, 1673` each render `: null` when their pool is empty. So a user with favorites but no `recommendations` sees a different Home than one with the reverse — the page silently reorders. There is no "empty slot" reservation, so the page's shape is data-dependent.

Worse, three near-duplicate lists of the same tracks. `favoriteItems`, `recentlyPlayed`, `resumeItems`, and `latestMusic` are fused into `gridPool` at `HomeScreen.tsx:1027-1032` and *then* rendered again as their own sections. The same album can appear in the Recently played chip grid, in Unstoppable Favorites, and in Recently Added, simultaneously — the dedupe at line 1036 (`if (quickItems.find(q => q.id === item.Id)) continue;`) only dedupes within the chip grid, not across sections.

Metadata quality: `MediaCard.tsx:35-37` renders `item.Name` and nothing else. Seven of the app's sections are card grids of unlabeled artwork.

### H9. Help users recognize, diagnose, recover from errors — **1/4**
Error handling is the worst area after consistency.

- `SearchScreen.tsx:291-295`: `catch (error) { console.error('Search failed', error); }` — **no user-visible error at all**. A failed search renders the `EmptyState` at 527-533 saying `"No results found"` / `` `We couldn't find anything matching "${query}"` ``. The user is told their query matched nothing when in fact the request failed. This is an actively misleading error state.
- `LibraryScreen.tsx:160, 292, 364`: `catch (error) { console.error(error); }` in all three page fetchers. A failed album fetch yields `EmptyState` `title="No Albums found"` (395). Same conflation of "none" and "failed".
- `StatsScreen.tsx:60-62`: `catch (e) { console.error('Failed to load stats:', e); }` — no UI. `loadStats` failing leaves the zeroed initial state (`allTimeMinutes: 0`, `dailyStats: [0,0,0,0,0,0,0]`) rendered as real data. The empty state at 288 does catch `stats.allTimeMinutes === 0 && topTracks.length === 0`, so the user sees "No listening data yet" — but a user with thousands of plays whose DB read failed sees exactly the same thing.
- `DownloadSettingsScreen.tsx:108-115`: `console.error("Error picking folder:", error)` then a `ConfirmationDialog` reading `"Failed to select folder. Please try again."` — no cause, no recourse.
- `StorageSettingsScreen.tsx:180`: `Alert.alert('Error', 'Failed to request permissions: ' + error)` — raw `error` object stringified into user-facing copy.
- `OnboardingScreen.tsx:249` and `LoginScreen.tsx:83`: `` setError(`Quick Connect failed.\n\nError: ${fetchError}`) `` and `` alert(`Quick Connect authorized, but failed to complete login.\n\nError: ${fetchError}`) `` — raw exception text shown to end users, via two different channels (inline `Surface` vs `Alert`).
- `LoginScreen.tsx:31-33`: **every** failure becomes `'Invalid username or password.'`:
  ```tsx
  } catch (err) {
      setError('Invalid username or password.');
  }
  ```
  A network timeout, a 500 from the server, and a genuinely wrong password are indistinguishable. The user retypes a correct password forever.

The one good recovery: `HomeScreen.tsx:1489-1548` — a full error card with `Can't Reach Server`, the actual `{error}` string, and a `Try Again` button. This is exactly the right pattern, and it exists on precisely one screen.

### H10. Help and documentation — **1/4**
- No `PRODUCT.md`, no `DESIGN.md`, no in-app help, no tooltips, no onboarding tour, no glossary.
- `DependenciesScreen.tsx` — a screen accessible from Settings that lists 41 npm packages (`'@nodefinity/react-native-music-library'` through `'zustand'`) with a `github` URL each, behind the instruction `"Tap on a package to view its GitHub repository"` (line 78). This is developer documentation rendered as an end-user Settings destination. It is not linked from `SettingsScreen.tsx` at all (see 101-168 — Appearance, Listening Tracker, Playback, Storage, Music Sources, Downloads, Backup, About), so it is either dead or reachable only by a route the settings hub never offers.
- Explanatory text that does exist is good and should be the model: `PlaybackSettingsScreen.tsx:136-138` explains the queue limit; `PlaybackSettingsScreen.tsx:77-80` warns in `theme.colors.error` that `"Transcoding requires permissions on your Jellyfin server. If playback fails, switch to Lossless."`; `DownloadSettingsScreen.tsx:183-185` explains SAF. These three are the only places the app teaches.
- `AppearanceScreen.tsx:22-38` `BACKGROUND_OPTIONS` show a description only for the *option itself*, and `RadioButton.Group` wraps `SettingsItem`, but the `SettingsItem`'s own `description` is the only explanation — there is no preview of what "Dominant Color" looks like.

### Total: **17/40**

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of system status | 2 |
| 2 | Match with real world | 2 |
| 3 | User control and freedom | 2 |
| 4 | Consistency and standards | 1 |
| 5 | Error prevention | 1 |
| 6 | Recognition rather than recall | 2 |
| 7 | Flexibility and efficiency | 3 |
| 8 | Aesthetic and minimalist design | 2 |
| 9 | Error recognition/diagnosis/recovery | 1 |
| 10 | Help and documentation | 1 |
| | **Total** | **17/40** |

---

## 3. Cognitive Load — 8-Item Checklist

| # | Item | Pass/Fail | Evidence |
|---|---|---|---|
| 1 | Single focus per screen | **FAIL** | `HomeScreen` presents 7 unranked co-equal sections plus header. `DetailScreen` presents four different header layouts in one file and puts Play, Shuffle, Sort and Download in one `gap: 12` row with no primary. |
| 2 | Chunking | **PASS** | `SettingsGroup` + `SettingsItem` genuinely chunk Settings, Playback, Storage, Source and Download settings into titled groups. Best-executed pattern in the app. |
| 3 | Grouping (proximity/relatedness) | **FAIL** | `SettingsScreen.tsx:140-155` puts `Export Backup` and `Import Backup` adjacent with equal weight and no warning that Import is destructive. `SourceModeSettingsScreen.tsx:543-552` places `Disconnect Server` immediately under the library checkbox list. `DownloadsScreen.tsx:154-182` puts cancel, retry and delete in one undifferentiated `itemActions` row. |
| 4 | Visual hierarchy | **FAIL** | `DetailScreen.tsx:1552-1578`: `Play` (`mode="contained"`) alongside `ShuffleFab size={48}` — two filled primary-colored circular/rounded shapes at equal visual weight, plus two `IconButton`s on `surfaceVariant`. Four controls, three weights, no clear primary. `HomeScreen.tsx:1066-1067` gives the "Recently played" heading the same `titleLarge` as every other section. |
| 5 | One thing at a time | **FAIL** | `StatsScreen` is the clearest case: hero metric, then 3 stat boxes, then a bar chart, then Top Tracks, then Recently Played — five competing framings of the same underlying data on one scroll. |
| 6 | Minimal choices | **FAIL** | See decision-point audit below. |
| 7 | Working memory | **FAIL** | Current source never labeled (`LibraryScreen.tsx:487` `Your Library`); current sort never labeled (icon-only `sort-variant`); `DetailScreen` selection mode uses a header that replaces the title, so the user loses the playlist name while selecting. |
| 8 | Progressive disclosure | **PARTIAL / FAIL** | `SourceModeSettingsScreen.tsx:396` does gate config behind `{jellyfinEnabled && ...}` — good. But `OnboardingScreen` asks for library selection (step 2) *before* the user has seen a single song, and `PlaybackSettingsScreen.tsx:139-171` renders all 5 queue options fully expanded with no disclosure. |

**Failures: 7 of 8** (with item 8 partial).

### Decision points with more than 4 visible options

1. **`PlaybackSettingsScreen.tsx:139-171` — Queue Management, 5 visible radio options simultaneously:** `"100 Tracks"`, `"250 Tracks"`, `"500 Tracks (Default)"`, `"1000 Tracks"`, `"Unlimited"`. All expanded, no disclosure, inside a `RadioButton.Group` where every row is a full-width `SettingsItem`.
2. **`PlaybackSettingsScreen.tsx:37-83` — Audio Quality, 4 options:** `"Lossless (Direct Play)"`, `"High (320 kbps)"`, `"Data Saver (128 kbps)"`, `"Auto"`. At the limit, but combined with the Lyrics group (`"LRCLIB (Recommended)"`, `"Jellyfin"`, `"Offline Only"`) the Playback screen presents **12 simultaneous radio choices**.
3. **`DetailScreen.tsx:2310-2406` — Sort Options, 5 items:** `"Default"`, `"Name (A-Z)"`, `"Artist"`, `"Album"`, `"Duration"`. Admission: the file names five sort keys, and `DetailScreen` renders this sheet from four different headers (lines 1219, 1563, 1668, 1919) with no indication of which is active until the sheet opens.
4. **`AppearanceScreen.tsx:11-20` + `93-111` — Theme Color, 8 unlabeled swatches.** `THEME_COLORS` renders as 8 `60x60` circles with `borderRadius: 30`. Only the selected one shows a check. There is no name, no hex, no preview of the resulting UI, and no relationship shown to the artwork-derived palette. `aria`-wise these are entirely unnamed.
5. **`DownloadSettingsScreen.tsx:14-19` — Concurrent downloads, 4 options in a `Menu`:** `"1 download at a time"`, `"2 simultaneous"`, `"3 simultaneous"`, `"5 simultaneous"`. Note the label grammar breaks: option 1 is a sentence, options 2-4 are fragments.
6. **`HomeScreen.tsx:1769-1813` — Track Options, 5 items** (`Play Next`, `Add to Queue`, `Add to Playlist`, `Download`, `Delete from Device`) with descriptions.
7. **`SearchScreen.tsx:439-449` — filter chips, 4 options** (`All`, `Songs`, `Artists`, `Albums`), visible only when `query.length > 0`.

Count of >4-option decision points: **4** (Queue Management, Sort, Theme Color, Track Options).

---

## 4. Emotional Journey

### Peak-end rule

The app has **no designed end**. The two most likely terminal moments are:

1. **Onboarding finish** → `OnboardingScreen.tsx:579-588` renders `You're all set!` and the button is `'Let\'s Go!'` (line 616). The confetti-less, animation-less confirmation lands on a static page whose only motion is... none. `handleFinish` (299-330) then fires `requestPermissions()` and `refreshLibrary()` and flips `setOnboardingComplete(true)`. The user taps `Let's Go!` and is dropped into `HomeScreen` **mid-scan**, where the greeting is already animated in (`animationState` at 89/622 persists across the transition) and the content will pop in later via the `useLocalLibraryStore.subscribe` at 945-951. So the climax of onboarding is followed by a screen that appears complete but is empty, then mutates. There is no "we found 1,284 songs" moment.

2. **Backup export** → `SettingsScreen.tsx:50` `'Backup exported successfully!'` in a `Snackbar` with `wrapperStyle={{ bottom: 80 }}`. Best terminal feedback in the app, and still generic.

Screens that end in a designed high: `StatsScreen.tsx:131-151` (the hero card is a genuine peak — the app's single best surface). It is placed **first**, at the top of a scroll, which is exactly backwards for peak-end; the user sees the peak before they have any context and then descends into a bar chart.

### Emotional valleys

- **`LibraryScreen.tsx:228` / `312` / `384`.** Loading a library shows two grey bars, then the full list. For a first-time local user scanning 1,000+ files, the valley is the moment the skeleton resolves to `EmptyState icon="music-note-off" title="No Playlists found" description="Create a playlist to get started"` (239) — because the scan has not finished. The screen tells the user to create a playlist when the real message is "we are still looking at your device."
- **`SearchScreen.tsx:291-295`.** Searching, failing, and being told `"No results found"`. Silent failure rendered as a confident negative. If the user searched for an artist they *know* they own, the app tells them they do not own it.
- **`StorageSettingsScreen.tsx:416-423`, `Deselect All`.** One tap and the library is empty. The valley is compounded by `HomeScreen.tsx:1706-1717`, which then shows `"No local music found"` / `"Go to Settings → Storage to select a music folder"` — instructions that are **wrong** for this failure, because folders *are* selected-able and were merely deselected. The user is sent to fix a problem that the destination does not describe.
- **`HomeScreen.tsx:1566-1670`.** Sections appearing and disappearing between visits depending on which query returned. A user who had a `Quick Picks` row yesterday finds it gone, with no explanation.

### Reassurance at high-stakes moments

| Moment | Reassurance given | Assessment |
|---|---|---|
| Delete a playlist (`LibraryScreen.tsx:244-254`) | `Delete "name"?` with Cancel/Delete | **Insufficient.** No "cannot be undone", no undo, no statement of server-side permanence. Compare `DetailScreen.tsx:2258-2261` which *does* say "This action cannot be undone." |
| Delete a downloaded file (`DownloadsScreen.tsx:175-181`) | **None** | **Absent.** Single 20px tap, immediate. |
| Delete from server (`HomeScreen.tsx:307-337`) | `'Are you sure you want to permanently delete this file from your Jellyfin server? This cannot be undone.'` + `style: 'destructive'` | **Adequate.** Best-in-app copy. |
| Batch delete, local (`HomeScreen.tsx:569-571`) | Delegated to OS dialogs, possibly one per file | **Poor.** The code's own comment at 546-552 admits uncertainty about prompt count. |
| Disconnect server (`SourceModeSettingsScreen.tsx:182-200`) | **None.** `handleDisconnect` silently flips `sourceMode` to `local`, calls `logout()`, and clears the URL | **Absent and surprising.** The user's library changes underneath them with no dialog. The button is styled `textColor={theme.colors.error}` (546) but has no confirmation. |
| Wipe/refresh library (`StorageSettingsScreen.tsx:288-297`) | `Refresh Library` button, no confirm | **Acceptable** — non-destructive, but there is no progress reporting outside `isScanning`. |
| Import backup (`SettingsScreen.tsx:62-73`) | **None.** `handleImport` calls `backupService.importBackup()` directly | **Absent.** Import can overwrite state. `Export` and `Import` are styled identically as two `SettingsItem`s. |
| First run (`OnboardingScreen`) | Step indicator + `"Select one or both options"` (401) | **Partial.** But `handleFinish` requests media permissions only *after* the user commits at step 3, so the OS permission dialog appears post-`Let's Go!` — the highest-anxiety prompt arrives at the moment the user believed setup was done. |

**Emotional verdict: 2/5.** One well-designed peak (`StatsScreen` hero), a warm but generic onboarding, and a set of high-stakes destructive actions — download delete, disconnect, import, deselect-all — with no confirmation and no recovery.

---

## 5. Genuine Strengths

1. **The SettingsGroup/SettingsItem primitive is a real, well-factored system.**
   `SettingsGroup.tsx:39-46` injects `isLast` by cloning children so the divider is omitted on the last row:
   ```tsx
   {React.Children.map(children, (child, index) => {
       if (React.isValidElement(child)) {
           return React.cloneElement(child as React.ReactElement<any>, {
               isLast: index === React.Children.count(children) - 1
           });
       }
   ```
   and `SettingsItem.tsx:34` consumes it: `{!isLast && <Divider style={{ marginLeft: icon ? 56 : 16 }} />}`. The divider inset is also icon-aware. This is the kind of detail that separates a system from a pile of screens. It is used correctly by Settings, Playback, Appearance, Downloads and Dependencies.

2. **Onboarding is a real flow, not a form, and it handles the local-only path with respect.**
   `OnboardingScreen.tsx:118-135` `handleNextStep` branches so that a local-only user skips **two** steps: `setStep(3); scrollViewRef.current?.scrollTo({ x: width * 3, animated: true });`. The step indicator (332-339) is conditional — `{jellyfinSelected && <View .../>}` — so the indicator never promises steps that do not exist for this user. `handleFinish` (299-330) derives `SourceMode` from the two booleans and sets a sensible `dataSource`. Multi-source (`'both'`) is genuinely supported. Most apps bolt local playback on as an afterthought; here it is a first-class branch of the flow.

3. **The empty/error states that do exist are warm, specific and actionable.**
   `HomeScreen.tsx:1489-1548` renders `Can't Reach Server`, the real interpolated `{error}`, and a `Try Again` button with `icon="refresh"`. `HomeScreen.tsx:1710-1716` gives a titled empty state with a *routed* action:
   ```tsx
   <EmptyState icon="folder-open" title="No local music found"
       description="Go to Settings → Storage to select a music folder"
       actionLabel="Open Storage Settings"
       onAction={() => navigation.navigate("StorageSettings")} />
   ```
   `EmptyState.tsx` itself (27-44) is clean — 64px icon at `opacity: 0.5`, `titleLarge`, optional description, optional action. The component is good; it is simply not used on Search or Library failures where it matters most.

---

## 6. Priority Issues

### P0 — Zero accessibility labeling on every screen in scope

**What.** Across all 16 target screens, `grep "accessibilityLabel|accessibilityRole|accessibilityHint|accessibilityState" src/screens/` returns matches in **only one file**: `PlayerScreen.tsx` (14 matches). My 16 screens contain **zero** accessibility attributes on any interactive element. `src/components/` is barely better — 14 matches, all inside `QueuePanel.tsx`, `MiniPlayer.tsx`, `SongItem.tsx`.

Every one of these is silent to a screen reader: `IconButton icon="arrow-left"` (all 8 app bars), `LibraryScreen.tsx:489` `<IconButton icon="plus" .../>`, `LibraryScreen.tsx:496-504` the three `TouchableOpacity` tabs, `DetailScreen.tsx:1219/1563/1668/1919` the icon-only sort button, `ShuffleFab.tsx:26-41` the shuffle control on all four DetailScreen headers, `DownloadsScreen.tsx:162-181` cancel/retry/delete, `AppearanceScreen.tsx:96-108` all 8 color swatches, `Switch` controls in `AppearanceScreen.tsx:120` / `PlaybackSettingsScreen.tsx:119-122` / `DownloadSettingsScreen.tsx:252-255` / `SourceModeSettingsScreen.tsx:389-392,717-720`.

`ShuffleFab.tsx` is the cleanest demonstration — a pure icon `TouchableOpacity` with no label, no role, no accessible name:
```tsx
<TouchableOpacity
    style={[styles.container, {...}]}
    onPress={onPress}
    activeOpacity={0.8}
>
    <Icon name="shuffle" size={size * 0.5} color={iColor} />
</TouchableOpacity>
```

**Why it matters.** Sam cannot use the app. Not "has a degraded experience" — cannot navigate, cannot open Settings (back arrow unlabeled), cannot tell what the shuffle button does, cannot discover which of 8 swatches is selected, cannot read the tab bar. The PlayerScreen proves the team knows the pattern; the discipline was never carried outward. `DetailScreen.tsx` is the extreme case: a grep for `accessibility|accessible=|testID|hitSlop` across all 2454 lines returns **no matches at all** — not one prop, on a screen with four header variants, a selection mode, five ActionSheets, and an in-place reorder. This is also the single largest App Store / Play Store accessibility rejection risk.

**Fix.** Add `accessibilityRole="button"` and a real `accessibilityLabel` to every touch target in scope. Concretely: (a) create `src/components/AppBar.tsx` with a labeled back button — `<IconButton icon="arrow-left" accessibilityLabel="Go back" onPress={...} />` — and replace all 8 hand-rolled app bars; (b) add `accessibilityLabel="Shuffle play"` inside `ShuffleFab.tsx:26` so all four DetailScreen headers and every other call site are fixed at once; (c) `accessibilityLabel={option.label}` on each `AppearanceScreen` swatch, plus `accessibilityState={{ selected: themeColor === color }}` at line 105; (d) `accessibilityLabel={`${title}. ${description ?? ''}`}` on `SettingsItem`'s `List.Item` at `SettingsItem.tsx:23` so every settings row is announceable; (e) `accessibilityRole="tab"` + `accessibilityState={{ selected: activeFilter === filter }}` on `LibraryScreen.tsx:496`; (f) in `DetailScreen`, label the four `sort-variant` buttons as `"Sort tracks, currently {sortBy}"` and the selection-mode action row (2001-2007, four unlabeled icon buttons for download / add-to-playlist / delete / close) individually; (g) `accessibilityState={{ expanded: isBioExpanded }}` on the `ABOUT` bio toggle (1242-1245); (h) `importantForAccessibility="no-hide-descendants"` on `Skeleton.tsx`'s `Animated.View` (37-48) so loading placeholders are not announced as content. Budget: one shared `AppBar` plus roughly 60 attributes.

---

### P0 — Search and Library report failures as empty results

**What.** `SearchScreen.tsx:291-295`:
```tsx
} catch (error) {
    console.error('Search failed', error);
}
```
No state is set. Control falls to the `sections.length === 0` branch at 526-533, which renders:
```tsx
<EmptyState icon="text-search" title="No results found"
    description={`We couldn't find anything matching "${query}"`} />
```
`LibraryScreen.tsx:160`, `:292`, `:364` are the same shape — `catch (error) { console.error(error); }` — feeding `ListEmptyComponent={<EmptyState icon="album" title="No Albums found" />}` (395) and `title="No Artists found"` (323).

**Why it matters.** The user is told, with confidence and a specific quoted query, that their library does not contain something it may well contain. On a self-hosted Jellyfin server — the app's entire premise — network failure is a routine condition, not an edge case. This converts a transient fault into a false statement about the user's own data, and it does so on the two screens where the user goes specifically to find something. It is also the reason H9 scores 1: the app has no error state taxonomy at all.

**Fix.** Add an `error` state variable to `SearchScreen` and each of the three `LibraryScreen` pages. In the catch, `setError(...)`. Render a distinct `EmptyState` with `icon="cloud-off-outline"`, `title="Couldn't reach your server"`, `description="Check your connection and try again"`, `actionLabel="Retry"`, `onAction={performSearch}`. Never let a caught exception fall through to a "none found" component. For local-source failures, use `icon="folder-alert"` and `title="Couldn't read your library"`.

---

### P1 — The radius token system exists and is contradicted by 85 hardcoded literals

**What.** `radius.ts:6-15` states its own purpose: "The codebase had grown 14 distinct radius values, which is why surfaces that should read as one family did not." It ships 5 role tokens and an exported type. It is imported by exactly two files, both out of scope:
```
src\components\MiniPlayer.tsx:6   import { RADIUS } from '../theme/radius';
src\components\QueuePanel.tsx:22  import { RADIUS } from '../theme/radius';
```
`grep "borderRadius: \d+" src/screens` returns **85 matches**, using 13 distinct values (`2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 30, 50`) against 5 declared roles. `StatsScreen.tsx` is the worst offender, contradicting itself within a single file: hero card `24` (328), statBox `16` (376), chart container `20` (381), trackItem `14` (391), trackImage `8` (408), recentImage `6` (420).

**Why it matters.** The system was written to solve a problem and did not solve it, which is worse than never writing it — it creates a false record that the design was systematized. Visually, `DetailScreen`'s artwork at `borderRadius: 12` (2440) sits directly under chips also at `borderRadius: 12` (1496, 1511, 1526), flattening card and chip into one plane. `OnboardingScreen` uses `16` for the source card, `12` for the container, `20` for the logo, `4` for the step pill. Nothing reads as a family.

**Fix.** Run the migration with a codemod and a mapping, not by hand. Mapping: `4→RADIUS.xs`, `8→RADIUS.sm`, `12→RADIUS.md`, `16→RADIUS.md`, `20→RADIUS.lg`, `24→RADIUS.lg`, `50/30/28→RADIUS.pill` (they are all circles — `50` on a 100px image, `30` on a 60px swatch, `28` on a 56px image). Then decide the out-of-scale values deliberately: `14` (StatsScreen trackItem/rankBadge) is not a role, so it becomes `md`; `6` (StorageSettings bars) becomes `xs`; `2` (progress bar tracks) becomes `xs`. Add a lint rule banning a numeric `borderRadius` literal in `src/screens/**` and `src/components/**`. Target: 13 values → 5, 85 literals → 0.

---

### P1 — Two reds, two greens, four feedback mechanisms

**What.** `theme.ts` provides `error` (M3 dark, near `#F2B8B5`). Destructive actions split between it and a hardcoded Android red:

Uses `theme.colors.error` — `LibraryScreen.tsx:251` (`buttonColor={theme.colors.error}`), `HomeScreen.tsx:1340` (`color={theme.colors.error}`), `SourceModeSettingsScreen.tsx:546` (`textColor={theme.colors.error}`), `PlaybackSettingsScreen.tsx:77`, `DownloadSettingsScreen.tsx:263`.

Uses hardcoded `#f44336` — `HomeScreen.tsx:1805` (`titleStyle={{ color: "#f44336" }}`), `HomeScreen.tsx:1807` (`<List.Icon ... color="#f44336" />`), `DetailScreen.tsx:2171,2173,2209,2211` (same menu-row pattern), `DetailScreen.tsx:2241,2273` (`buttonColor="#f44336"`), `DownloadsScreen.tsx:107,149,244`.

Success/failure adds two more colors not in the theme — `DownloadsScreen.tsx:106` `case 'completed': return '#4CAF50';`, `:107` `case 'failed': return '#f44336';`.

Feedback for the same class of event uses four different mechanisms: `Snackbar` (`SettingsScreen.tsx:177-188`), `ConfirmationDialog` (`DownloadSettingsScreen.tsx:274-280`), `Alert.alert` (`HomeScreen.tsx:230`, `StorageSettingsScreen.tsx:180`), and nothing (`SearchScreen.tsx:291`).

**Why it matters.** "Red" is the app's only learnable destructive signal, and it is two different reds at two different luminances. `#f44336` on `#1C1B1F` measures 4.65:1 — it passes 4.5:1 for large text and *fails* the 3:1 non-text UI component threshold for icons at `size={20}`/`{24}`. Meanwhile M3 dark's `error` is a pale red that reads as a highlight, not a warning. The result is that the most dangerous affordance in the app — `Delete from Device` — is styled inconsistently and, where it uses `#f44336`, at the edge of legibility.

**Fix.** (a) Add `success` and `danger` to `theme.ts` alongside the M3 tokens: `danger: '#FFB4AB'` (M3 dark error equivalent with adequate contrast), `success: '#7FD88B'`. (b) Replace all 11 `#f44336` and 2 `#4CAF50` literals with `theme.colors.error` / a new `theme.colors.success`. (c) Standardize feedback: `Snackbar` with an action for any reversible operation (delete-with-undo, export, import result), a `ConfirmationDialog` for anything irreversible, and `Alert.alert` never — it is unstyleable and cannot carry the app's theme. (d) Add a lint rule banning hex literals in `src/screens/**`; the only permitted exception is `rgba(0,0,0,x)` scrims over artwork.

---

### P1 — HomeScreen renders up to 7 unstable, overlapping sections

**What.** `HomeScreen.tsx:1476-1703` renders, in fixed order, gated only by `: null`:
1. Recently played grid (1477, up to 6 chips)
2. Most Played (1566, 5 songs, non-landscape)
3. Unstoppable Favorites (1593, all favorites)
4. Artists You Like (1626)
5. Explore Genres (1643, up to 15)
6. Quick Picks (1646, 5 songs)
7. Recently Added (1673, all)

Every section is `marginBottom: 32` (1913-1915) at identical weight. Sections 1, 3, 6 and 7 are drawn from overlapping pools — `gridPool` at 1027-1032 concatenates `favoriteItems`, `recentlyPlayed`, `resumeItems` and `latestMusic`, and dedupes only *within* the chip grid (1036). The same track can appear in the chip grid and again in Unstoppable Favorites and again in Recently Added.

Because each section nulls independently, the page's shape is a function of which API calls succeeded — `fetchData` uses `Promise.allSettled` (811-818) and assigns each pool only on `fulfilled` (836-841). A partial failure silently removes rows rather than reporting.

**Why it matters.** Casey opens the app and scrolls past seven unranked rows of unlabeled 150px artwork (`MediaCard.tsx:35-37` renders only `item.Name`) before reaching anything they deliberately chose. There is no "continue listening" as the first thing after the greeting — instead there is a 6-chip shortcut grid, then four more lists. The page has no opinion about what the user most likely wants. And because the section set varies per load, Casey's muscle memory for "the third row is my playlists" is wrong on the next visit.

**Fix.** (a) Cap Home at 4 sections and make the order intentional: `Continue listening` → `Recently added` → `Made for you` → `Your playlists`. (b) Dedupe globally with one `Set<string>` of rendered `item.Id` threaded through all sections, not per-section. (c) Promote one section to a real hero so hierarchy exists — give the first item of `Continue listening` a full-width `MediaCard` with artist and a 56px play button, and reduce the rest to a 3-across grid at `RADIUS.md`. (d) Introduce a spacing scale (`SPACE = { sm: 8, md: 16, lg: 24, xl: 40 }`) and use `lg` for section gaps, `sm` for intra-section — currently everything is `32`/`24`/`16` regardless of nesting depth. (e) When `Promise.allSettled` returns any rejection, render a single inline banner (`Some sections couldn't load. Retry`) instead of silently dropping rows.

---

### P2 — Destructive actions without confirmation or undo

**What.** Five concrete cases, all on screens in scope:

- `DetailScreen.tsx:312-313` and `HomeScreen.tsx:569-571` — **local-mode batch delete fires with no confirmation**, while the server path in the same function gets a full `Alert`. In `DetailScreen` the loop at 296-298 (`for (const track of tracksToDelete) await localLibrary.deleteTrack(track);`) also has no rollback: a failure on track 5 of 20 aborts into the catch at 305-309 leaving 4 deleted, 16 not, and a single `Alert` naming neither count.
- `DownloadsScreen.tsx:175-181` — deleting an offline file is one unconfirmed 20px tap, adjacent to the retry button in an undifferentiated row:
  ```tsx
  {!isActive && (
      <IconButton icon="delete-outline" size={20} onPress={() => handleRemove(item.id)} />
  )}
  ```
- `StorageSettingsScreen.tsx:416-423` — `Deselect All` (`onPress={deselectAllFolders}`) empties `getFilteredTracks()` with no dialog. `StorageSettingsScreen.tsx:43` derives the library count from it, and Home/Library both read it.
- `SourceModeSettingsScreen.tsx:182-200` — `handleDisconnect` silently mutates `sourceMode` and `dataSource` to `"local"` and calls `logout()`; `SettingsScreen.tsx:62-73` `handleImport` calls `backupService.importBackup()` with no warning that it may overwrite state.
- `DetailScreen.tsx:2058-2066` — drag-to-reorder persists fire-and-forget: `DatabaseService.updatePlaylistOrder(...).catch(console.error)` after `setTracks(data)` has already committed the UI. A failed reorder silently diverges what the user sees from what is stored, with no error and no resync.

**Why it matters.** Download deletion destroys the one artifact the app created on the user's behalf and cannot be re-fetched without bandwidth. `Deselect All` is the single highest-blast-radius control in the app and it is styled as a `compact` outlined button next to `Select All` (407-424) — visually identical to its harmless twin. Losing a 12-folder selection is unrecoverable without remembering the previous selection, which the UI never showed as a summary beyond `{folder.trackCount} songs` per row.

**Fix.** (a) Fix the inverted confirmation first: in both `DetailScreen.tsx:312` and `HomeScreen.tsx:569`, render a confirm for the **local** branch and keep the existing one for the server branch. Copy: `"Delete N files from your device? This cannot be undone."` (b) `DownloadsScreen`: wrap `handleRemove` in a `ConfirmationDialog` (the component already exists and is used in `DownloadSettingsScreen.tsx:274`) with `title="Remove download?"` and `message={`"${item.name}" will be removed from this device. You'll need to download it again to listen offline.`}`. (c) `StorageSettingsScreen`: give `Deselect All` a confirm — reuse `ConfirmationDialog` with `type="warning"` and body `"This will hide all N songs from your library until you re-select folders."`. (d) Add a "N of M folders selected" summary line above the folder list so the current state is visible before the tap. (e) `handleDisconnect`: confirm with `"Disconnect from {serverUrl}? You'll be switched to Local Music."` (f) `handleImport`: confirm with `"Importing a backup may replace your current settings and playlists."` and offer `Cancel` / `Import`. (g) Batch deletes report partial results: `"Deleted 4 of 20 files. 16 failed."` rather than an exception string. (h) Every completed delete gets a `Snackbar` with `action={{ label: 'Undo' }}` — `SettingsScreen.tsx:177-188` proves the pattern is available, and `ActionSheet` has no snackbar anywhere in the codebase.

---

### P2 — Eight different app bars; no shared header component

**What.** `SettingsScreen.tsx:77-80`, `AppearanceScreen.tsx:59-71`, `PlaybackSettingsScreen.tsx:29-34`, `SourceModeSettingsScreen.tsx:331-336`, `StorageSettingsScreen.tsx:193-196`, `DownloadSettingsScreen.tsx:141-153`, `DependenciesScreen.tsx:72-75`, `StatsScreen.tsx:119-123`, `DownloadsScreen.tsx:261-265`, `LibraryScreen.tsx:479-491`. Differences span: back-button `size` (20 in landscape vs 24, or default), title variant (`titleLarge` / `titleMedium` / `headlineSmall` / `headlineMedium`), alignment (left vs centered), landscape variants (present in `SettingsScreen`, `AppearanceScreen`, `DownloadSettingsScreen`; absent in `PlaybackSettingsScreen`), and `marginBottom` (`16`, `8`, `4`, none).

`StatsScreen.tsx:122` balances a centered title with a dummy spacer: `<View style={{ width: 48 }} />`. `DownloadsScreen.tsx:261-265` has no back affordance and a different title scale entirely.

**Why it matters.** Every settings screen is a tab-level destination reached from one hub, and they share no header. A centered title on Stats, a left title on Playback, and a `titleMedium` on Appearance in landscape produce a visible jitter as the user moves between them. This is also why the P0 accessibility fix is currently 8 separate edits instead of 1.

**Fix.** Extract `src/components/AppBar.tsx` accepting `{ title, onBack?, right?, variant? }`. It standardizes `variant` on `titleLarge` (`titleMedium` in landscape), always left-aligns, applies `paddingTop: insets.top`, includes `accessibilityLabel="Go back"`, and implements `marginBottom: SPACE.md`. Replace all ten call sites. This also lets `DownloadsScreen` gain the back affordance it is missing.

---

### P3 — The accent system is fragmented across three implementations and thirteen omissions

**What.** The product's signature — UI tinted by artwork — is computed three incompatible ways, one of which is random, and used almost nowhere:
- `PlayerScreen.tsx:1596`: `colors={dynamicColors?.gradientColors || [`${safeThemeColor}15`, 'rgba(0,0,0,0.95)']}`
- `HomeScreen.tsx:653-685`: extracts once via `getColors(currentTrack.imageUrl, {...})`, takes `colors.dominant`/`colors.primary`, then `setGlowColor(lightenHexColor(selectedColor, 0.3))` (676), rendered at 1257-1267 as `glowColor + '99' / '59' / '26'`
- `DetailScreen.tsx:1959-1962`: its own animated glow, `colors={[`${glowColor}40`, "transparent"]}`, where `glowColor` for playlists/genres comes from `getPlaylistRandomColor()` (373-380) — `Math.random()` over 10 saturated hexes.

And `AppearanceScreen.tsx:11-20` lets the user pick a static `themeColor` from 8 swatches that has no relationship to any of these.

There is also a latent bug in the string-concatenation approach: `DetailScreen.tsx:1960` appends an alpha suffix to a runtime hex (`` `${glowColor}40` ``). This is only valid if `lightenHexColor` returns a 6-digit hex. If it ever returns `#RGB` shorthand or an `rgba()` string, `LinearGradient` receives an unparseable color and the glow silently fails.

**Why it matters.** The one thing that would make this app un-shippable-by-Spotify is used on `HomeScreen` as a background wash, on `DetailScreen` as a header glow, and nowhere else. `LibraryScreen`, `SearchScreen`, `StatsScreen`, `DownloadsScreen`, all five Settings screens, and all of Onboarding render in flat M3 purple (`#D0BCFF`). A user moving from Player (tinted coral by the album art) to Detail (faint glow) to Library (purple) experiences three different apps. The `AppearanceScreen` swatch picker additionally lets the user create a fourth authority that will fight the other three.

**Fix.** (a) Create `src/theme/useAccent.ts` exporting a single `useAccent()` that wraps `getColors`, memoizes by `imageUrl` in one shared module-level `Map`, and returns `{ accent, accentSoft, accentFaint }` as validated 6-digit hex strings. Delete the three local implementations, **and delete `getPlaylistRandomColor()` (DetailScreen.tsx:373-380) entirely** — replace it with a deterministic hash of the playlist id mapped through a curated 6-color palette drawn from the theme, so a playlist's color is stable across visits. (b) Consume it in `HomeScreen` (hero glow), `DetailScreen` (header gradient), **and** `LibraryScreen`, `SearchScreen` and `StatsScreen` — e.g. tint the `LibraryScreen.tsx:506` active tab indicator and the `LibraryScreen.tsx:559` `activeIndicator`, and the `StatsScreen.tsx:88` chart `frontColor`. (c) In `AppearanceScreen`, rename the section `Theme Color` → `Fallback accent` and add a description: `"Used when artwork colours are unavailable."`, so it is legibly subordinate rather than a competing setting. (d) Extend the film grain beyond the player: `GrainOverlay` at PlayerScreen.tsx:824 is a working component; mount it at low opacity over the `DetailScreen` header artwork and the `StatsScreen` hero card so the texture becomes part of the identity rather than a player-only effect.

---

## 7. Persona Red Flags

### Jordan — confused first-timer

- **`OnboardingScreen.tsx:371-388` asks Jordan to make an architectural decision before seeing the product.** Two cards: `"Jellyfin Server"` / `"Stream music from your personal Jellyfin media server. Requires server connection."` and `"Local Music"` / `"Play music stored directly on your device. No internet required."` A first-timer who does not know what Jellyfin is must pick. The hint at 399-401 says `"Select one or both options"` — offering more choice at the moment of least understanding. Both cards are toggleable and neither looks selected-able-vs-selected beyond `borderColor` and background.
- **The permission prompt arrives after commitment.** `handleFinish` (299-310) requests media permission only once Jordan taps `Let's Go!` (616). So: choose sources → connect → pick libraries → "You're all set!" → *then* an OS permission dialog. Jordan believed they were done.
- **`HomeScreen.tsx:1710-1716` sends Jordan to the wrong place on empty.** `"No local music found"` / `"Go to Settings → Storage to select a music folder"`. In the deselect-all case folders *are* selected; in the still-scanning case there is nothing to fix. Jordan follows the arrow and finds a folder list that looks fine.
- **`LibraryScreen.tsx:239`** greets an empty library with `"No Playlists found"` / `"Create a playlist to get started"` — asking Jordan to author content in an app they have not yet put content into.
- **`OnboardingScreen.tsx:607`** removes the Continue button at `step === 1`, so mid-login Jordan sees only a `Back` text button (597-605) and the login form. Without a visible forward action, Jordan may believe the form failed to submit.
- **`SearchScreen.tsx:503-507`** shows `"Search Your Library"` / `"Start typing to find songs, artists, and albums"` only when there are no genres. With genres present, the top of Search is `Recent Searches` + `Browse All` tiles — Jordan is shown a wall of genre gradients instead of a prompt, and genre tap merely *pre-fills the query* (377-378 `setQuery(item.Name)`) rather than navigating, so tapping "Rock" appears to do nothing but change the search text.

### Sam — screen reader + keyboard, needs 4.5:1

- **Screen reader: blocked at the door.** Zero `accessibilityLabel`/`accessibilityRole` in all 16 screens. The only labeled interactive components anywhere in the app's shared library are `SongItem.tsx:68-69` and `:132`, `MiniPlayer.tsx:303-331`, and `QueuePanel.tsx:223-345`. So Sam can find and hear individual song rows, but cannot leave `HomeScreen`, because the only paths out are an unlabeled `IconButton icon="cog"` (1378-1382) and an unlabeled avatar `TouchableOpacity` (1385). `LibraryScreen.tsx:480-486` wraps the settings entry in a bare `TouchableOpacity`. The irony is sharp: Sam can hear a song row announce `"Track by Artist, currently playing"` but cannot hear the button that opens Settings, cannot hear play or shuffle, and cannot hear a single one of the eight color swatches.
- **Screen reader: tab bar is three anonymous taps.** `LibraryScreen.tsx:496-504` — three `TouchableOpacity` each containing a `Text`. No `accessibilityRole="tab"`, no `accessibilityState`. Sam cannot know which tab is active, and the animated indicator (506) is invisible to assistive tech.
- **Screen reader: the color picker is 8 unnamed circles.** `AppearanceScreen.tsx:96-108`. Sam hears "button, button, button..." eight times.
- **Contrast failures, measured.** Using WCAG relative luminance against `theme.colors.background` `#1C1B1F`:
  - `SearchScreen.tsx:646` `genreTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' }` over `GENRE_COLORS[7]` `['#509BF5', '#284D7A']` — **2.86:1**. Fails the 4.5:1 requirement for 16px text. `GENRE_COLORS[3]` `#148A08` yields 4.50:1 and `GENRE_COLORS[5]` `#E91429` yields 4.57:1 — both pass only at the boundary, and the gradient darkens toward the second stop so the real value varies across the tile.
  - `StatsScreen.tsx:140` `<Icon name="headphones" size={28} color="rgba(255,255,255,0.6)" />` and `:343` `heroLabel: { color: 'rgba(255,255,255,0.6)', letterSpacing: 3, fontWeight: 'bold', fontSize: 11 }` sit on the `StatsScreen.tsx:133` gradient `[theme.colors.primary, theme.colors.tertiary, '#1a1a1a']`. Over the light `#D0BCFF` end, white-at-60% measures **2.14:1**. The label `THIS MONTH` — the hero card's only context — is the least legible text on the best screen.
  - `LibraryScreen.tsx:558` `tabText: { color: 'rgba(255, 255, 255, 0.6)', fontSize: 14 }` measures 6.91:1 — passes. But it bypasses the theme entirely; in a light-mode build this tab bar would be white-on-white.
  - `#f44336` on `#1C1B1F` = **4.65:1**, applied to icons at `size={20}` (`DownloadsScreen.tsx:158` via `getStatusColor`) and `size={24}`. Icons are non-text UI components requiring 3:1 — it passes that — but the same literal is used for `Text` at `DownloadsScreen.tsx:149`, where 4.65:1 at `labelSmall` (11px) is below the 4.5:1 floor for normal text once anti-aliasing is considered.
  - `SourceModeSettingsScreen.tsx:891` `borderTopColor: "rgba(255,255,255,0.1)"` and `SearchScreen.tsx:704` `borderBottomColor: 'rgba(255,255,255,0.1)'` composite to ~`#303033` against `#1C1B1F` — **1.3:1**. Non-text UI boundaries need 3:1. These separators are effectively invisible, yet they carry the grouping meaning.
- **Keyboard/focus.** No `focusable`, no `nextFocusDown`, no `autoFocus` outside `LibraryScreen.tsx:536`. On Android TV / keyboard, traversal order is source order across a `ScrollView` containing nested horizontal `FlatList`s (`HomeScreen.tsx:1610-1620`, `1629-1638`, `1690-1700`) — focus will jump unpredictably between rows.
- **No dynamic type support.** Every size is a fixed literal (`StatsScreen.tsx:353` `fontSize: 52`, `SearchScreen.tsx:594` `fontSize: 32`, `643` `height: 100`). `SearchScreen.tsx:415-433` sets `height: 48` on the search bar and `SearchScreen.tsx:610` `height: '100%'` on the input — at 200% font scale the placeholder will be clipped.

### Casey — distracted, one-handed, thumb zone, 44x44pt targets

- **Targets under 44x44.** The precise measurement matters here, so stating it correctly: React Native Paper's MD3 `IconButton` computes `buttonSize = size + 2 * PADDING` with `PADDING = 8` and applies a default `hitSlop` of 10 on all sides — so `size={28}` yields a 44x44 box with a **64x64 effective** target, and default `size` yields 40x40 with a 60x60 effective target. Those pass. The genuine failures are the elements that are *not* Paper `IconButton`s:
  - `SongItem.tsx:124` — the drag-reorder handle, `padding: 8` around a `size={24}` icon = **40x40 with no `hitSlop`**. This is the only control that reorders a playlist, and it occupies the same slot as the 60x60 dots menu depending on `isDraggable`.
  - `HomeScreen.tsx:1129` — `<Pressable onPress={onSeeAll} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>`, a `See All` link roughly **28pt** tall.
  - `SearchScreen.tsx:429-431` — the clear-search `<TouchableOpacity>` wrapping a `size={20}` `X` icon, approximately **20x20pt** with no `hitSlop`.
  - `ActionSheet.tsx:256-261` — the close button is `padding: 4` around `size={24}` = **32x32 visible**. It passes only because of an explicit `hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}` at line 191; the *visible* circle remains 32pt.
  - `DetailScreen.tsx` declares **no `hitSlop` at all** (grep: 0 matches), and its `Play` buttons use `contentStyle={{ paddingHorizontal: 16 }}` with no height override, landing on Paper's 40pt default — under the 44pt guideline.
- **Thumb zone: primary actions are at the top.** Casey holds the phone one-handed. On `DetailScreen`, `Play` and `ShuffleFab` are in the header block at `DetailScreen.tsx:1552-1578` (playlist) and `:1208-1240` (artist) — above the fold-center, requiring a reach or a hand shift. On `HomeScreen` the greeting, settings icon and avatar occupy the top. On `OnboardingScreen` the CTA is in an absolutely-positioned footer (`711-718` `position: 'absolute', bottom: 0`) — this one is correct and should be the model.
- **The reorder handle is the worst of both.** `SongItem.tsx:122-135` renders either a 40x40 unlabeled drag target or a 60x60 labeled menu button in the same position, chosen by whether the list is reorderable. Casey cannot build a reliable tap habit for that region, and Sam gets an unnamed control in exactly the states where reordering is possible.
- **Destructive controls near thumb-reachable edges.** `DownloadsScreen.tsx:176-180` puts `delete-outline` in a row of 20px icons; a distracted swipe or mis-tap on a scrolling list is one icon away from `retry`. The `Cancel All` button (`244`) is a text button in a section header with `textColor="#f44336"` and no confirm. `DetailScreen.tsx:2006-2007` puts the `delete` selection-mode action as one of four adjacent icon buttons in the app bar.
- **Gesture-only affordances.** `HomeScreen.tsx:462-469` long-press to enter multi-select — with `onLongPress` on `SongItem.tsx:55`. `DetailScreen` uses long-press for selection too, and drag-to-reorder (`react-native-draggable-flatlist`, `activationDistance={20}` at 2067) is drag-only with no accessible alternative. Casey, glancing at the phone, has no way to discover long-press.
- **Scroll depth.** `HomeScreen.tsx:1288` `contentContainerStyle={{ paddingBottom: 180, minHeight: height }}`. Combined with 7 sections, reaching `Recently Added` at the bottom is a long thumb-scroll with no jump-to-top affordance and no section index. `DetailScreen`'s list sets `paddingBottom: 180` (2032) too — the same bury.
- **Interruptions lose state.** `SearchScreen` stores `query` in component state only (`48`). Leaving Search and returning clears it — `SearchScreen.tsx:90-92` restores only `search_history`, not the in-progress query or `filter` (`55`). `DetailScreen`'s `searchQuery` (1592) and `sortBy` (L136) are likewise component state, and the multi-select `selectedTracks` (205) is lost on any navigation. Casey, interrupted mid-search, starts over.

---

## 8. Minor Observations

1. **`HomeScreen.tsx:47-86` `getQuirkySubtitle()` returns a random string containing emoji**, e.g. `"Rise and shine! ☀️"`, `"Coffee first, music second. ☕"`, `"Owl mode activated. 🦉"`, `"Late night vibes. 🌙"`. These render at `HomeScreen.tsx:1364-1370` under the greeting. Two problems: the emoji sit awkwardly against a largely emoji-free visual system (only `SettingsScreen.tsx:172` `Made with ❤️` and `DownloadSettingsScreen.tsx:266` `⚠️ Not connected to WiFi` join them — three sites, no rule), and the string is chosen inside `useState(() => ...)` at 618-621 so it is stable per mount but re-rolls on every remount. The user's "greeting" is not deterministic, and `"Owl mode activated. 🦉"` at 3am is a coin flip against `"Just you and the music."` — one is charming, the other is twee, and the app has no opinion about which it is.
2. **`SettingsScreen.tsx:171` uses `variant="displayMedium"` with `fontFamily: 'cursive'`** for the wordmark. On Android `cursive` resolves to a playful script that is not a brand. Same at `LoginScreen.tsx:216` and `ServerSelectScreen.tsx:125`. Three screens, one platform-font gamble.
3. **`SettingsScreen.tsx:159` hardcodes the version string** `title="Version 1.1.3"` rather than reading from `expo-constants`. It will drift.
4. **`SettingsScreen.tsx:165`** links to `https://github.com/AadiSPrabs/JellySpot_React` — the repository name says `React`, the product is `Jellyspot`. Minor, but it is the app's only public artifact.
5. **`DependenciesScreen.tsx`** lists 41 packages. `'@nodefinity/react-native-music-library'` appears with `github: 'https://github.com/nicotsx/react-native-music-library'` — a *different* org than the package scope. And `react-native-paper` is listed though the app's `theme.ts` is built on it. This screen is not registered in `SettingsScreen`'s navigation groups.
6. **`SearchScreen.tsx:23` comment** `// Predefined colors for genre cards to make them pop properly like Spotify` — an explicit statement of borrowed intent in the source.
7. **`MediaCard.tsx:41-47`** memoizes on `item.Id`, `imageUrl`, `iconSize` but not on `onPress`. Since `HomeScreen.renderItem` (1141-1179) creates a new closure per render and passes it down, the comparator ignores it — functional, but the memo is doing less than it appears to.
8. **`Skeleton.tsx:12` default `borderRadius = 4`** but `ListItemSkeleton` (54) passes `8`, `CardSkeleton` (64) passes `16`, `SongItemSkeleton` (72) passes `8`. Three more radius values in a component whose own doc says the scale was created to stop exactly this.
9. **`Skeleton.tsx:102-174` `HomeScreenContentSkeleton`** hardcodes `// Approximating LEFT_BAR_WIDTH = 80` (103) as a magic number while `HomeScreen` imports the real `LEFT_BAR_WIDTH` from `MainNavigator`. If the constant changes, the skeleton silently misaligns.
10. **`LibraryScreen.tsx:205-216` `getStaticItems()`** has identical `if` and `else` branches — both return the same two-element array. Dead conditional.
11. **`LibraryScreen.tsx:512-520`** — `removeClippedSubviews={true}` on a horizontal pager containing three `FlashList`s, each of which also sets `removeClippedSubviews` implicitly. Nested virtualization + clipping is a known source of blank rows on Android.
12. **`SearchScreen.tsx:64-78` and `HomeScreen.tsx:152-171`** both implement an identical 250ms "orientation transition curtain" with a full-screen `Animated.View` at `zIndex: 9999`. Duplicated, and a 250ms full-screen opaque flash on every rotation is a heavy-handed solution.
13. **`DownloadSettingsScreen.tsx:62-65`** polls `Network.getNetworkStateAsync()` on a 5-second `setInterval`, permanently, on a settings screen. The comment concedes it: `// Poll network state every 5 seconds (expo-network doesn't have subscription)`.
14. **`DownloadSettingsScreen.tsx:14-19` label grammar breaks** across the four options: `"1 download at a time"`, `"2 simultaneous"`, `"3 simultaneous"`, `"5 simultaneous"`. The first is a sentence; the rest are fragments.
15. **`StorageSettingsScreen.tsx:139`** `for (const file of files.slice(0, 50))` with the comment `// Sample first 50 files for performance`, then extrapolates at 148-150. Displayed to the user as a precise `formatSize(cat.size)` with two decimal places (`331`). The number is an estimate presented as a measurement, and the caveat at 308 (`tracksWithActualSize/totalTracksAnalyzed`) refers only to audio, not to cache.
16. **`SourceModeSettingsScreen.tsx:198-199`** sets `setServerUrlInput("")` twice in a row.
17. **`OnboardingScreen.tsx:703`** defines `checkIcon` in the stylesheet; it is never referenced in the JSX. Dead style.
18. **`DownloadsScreen.tsx:331`** defines `emptyState` style; the component uses `<EmptyState>` (268) instead. Dead style.
19. **`StatsScreen.tsx:65`** `const { useFocusEffect } = require('@react-navigation/native');` — a `require` inside the component body rather than a top-level import, inconsistent with the rest of the file.
20. **`LoginScreen.tsx:83`** uses raw `alert(...)` (lowercase global) while every other screen uses `Alert.alert`. Inconsistent import discipline.
21. **`HomeScreen.tsx:1093`** `style={{ flex: 1, marginHorizontal: 10, fontWeight: '600' }}` on the Recently-played chip label with `numberOfLines={1}` — long playlist names truncate mid-word with no ellipsis control, in a 56px-tall chip that is roughly half text.
22. **`DownloadsScreen.tsx:286-290`** `keyExtractor` builds keys from array index position semantics (`header-${title}`, `group-${key}`, `item-${id}`) off a hand-flattened array (275-285). Reordering sections between renders will recycle views incorrectly.
23. **`DetailScreen.tsx:1198-1238`, `1541-1579`, `1647-1687`, `1898-1936`** — the four-control action row (`Play` button + `ShuffleFab size={48}` + sort `IconButton size={28}` + download `IconButton size={28}`) is duplicated **verbatim four times** in one file, once per header variant. `ShuffleFab` at 48 next to `IconButton` boxes computed at 44 (`size + 2 * PADDING` per MD3) with `gap: 12` produces a visible 4pt misalignment on every DetailScreen.
24. **`DetailScreen.tsx:2084` and `2184`** both title their ActionSheet `"Track Options"`, but they are different sheets with different contents (playlist mode vs. library mode). A screen reader — or a user returning to a sheet — cannot tell them apart.
25. **`DetailScreen.tsx` names the same destructive action four ways:** `"Delete from device"` (2208), `"Delete from Device"` (2254), `"Delete File"` (864), `"Delete from Server"` (864). Casing and preposition both drift. And `"Remove"` (2244) is styled `buttonColor="#f44336"` even when the action is *unfavoriting* from Liked Songs (`DetailScreen.tsx:814-837`) — a non-destructive action presented in destructive red.
26. **`DetailScreen.tsx:2016-2018`** fakes a scrim over arbitrary artwork: `backgroundColor: isArtist ? "rgba(0,0,0,0.3)" : "transparent"` with `iconColor={isArtist ? "#fff" : undefined}`. Contrast for the back arrow depends on the album backdrop image, which is uncontrolled. On a bright backdrop, white-on-30%-black fails; on a dark one it is fine. There is no measurement or adaptive fallback.
27. **`DetailScreen.tsx:34-36`** imports `Portal`, `Dialog` and `TouchableRipple` and never uses any of them — the dialog UI was migrated to `ActionSheet` and the imports were left behind.
28. **`Skeleton.tsx` has zero accessibility props.** No `accessibilityRole`, no `importantForAccessibility`, no `accessible={false}`. Screen readers announce the animating skeleton blobs as content. Every skeleton on every screen inherits this.
29. **`SongItem.tsx:124`** — the drag-reorder handle is `padding: 8` around a `size={24}` icon = **40x40 with no `hitSlop`**, below the 44pt floor. It occupies the *same slot* as the three-dot menu (128-133), which gets MD3's default `hitSlop: 10` for a 60x60 effective target. Depending on `isDraggable`, the same pixel region is either 40x40 or 60x60.
30. **`SongItem.tsx:2`** imports `Animated` and never uses it. **`DetailScreen.tsx`** declares `fadeAnim`/`slideAnim` (138-139) and starts them (693-704) with mismatched durations (1000ms fade / 1200ms slide) inside a `useEffect` (710-714) that returns **no cleanup** — the animation can settle against an unmounted component.
31. **`DetailScreen.tsx:373-380` `getPlaylistRandomColor()`** is called on playlist *and* genre detail (per 666-688), so a playlist's headline glow color changes on every single visit. Combined with `Math.random()` at `HomeScreen.tsx:762-763, 781, 763` (`sort(() => Math.random() - 0.5)`) and `:50` (`getQuirkySubtitle`), three separate surfaces shuffle their own content on every mount. The app is not stable from one open to the next.

---

## 9. Provocative Questions

**1. The app's identity lives entirely inside PlayerScreen. Is the rest of the app actually part of the same product, or is it scaffolding that was never brought up to standard?**

`theme/radius.ts` was written to fix radius sprawl and is imported by two files, both outside this critique's scope. `GrainOverlay` exists and is mounted once (`PlayerScreen.tsx:824`). The accent palette is computed three different ways and consumed by two screens. PlayerScreen has 14 accessibility labels; these 16 screens have zero. Every one of these is a signal that the Player received deliberate attention and the surrounding product received default attention. If PlayerScreen is the product, what are the other 16 screens — and would the team be willing to say that out loud in a design review? If they are *not* scaffolding, why does the visual system they were built on get imported by two of eighteen files?

**2. When the app cannot reach the server, why does it tell the user their library is empty? Is "we failed" ever allowed to be a distinct state from "you have nothing"?**

`SearchScreen.tsx:291-295` catches every search failure into `console.error`, then renders `"No results found"` / `` `We couldn't find anything matching "${query}"` `` (528-532). `LibraryScreen.tsx:160,292,364` do the same, yielding `"No Albums found"` and `"No Artists found"`. `StatsScreen.tsx:60-62` swallows a DB error and lets the zeroed state render as `"No listening data yet"`. In a self-hosted app, network failure is a *normal* condition — the user's server is a laptop that sleeps. So the most common failure mode in the product is the one state the UI cannot express. Meanwhile `HomeScreen.tsx:1489-1548` proves the team can build a real error state with `Can't Reach Server`, the actual error text, and `Try Again`. Why does that pattern appear exactly once, and what would it cost to make "we couldn't reach your server" and "your server has nothing" two different screens everywhere?

**3. How many of the seven Home sections would survive a test where the user is asked, one hour later, to name what was on their Home screen?**

`HomeScreen.tsx:1476-1703` renders Recently played, Most Played, Unstoppable Favorites, Artists You Like, Explore Genres, Quick Picks and Recently Added — all at `marginBottom: 32` (1913), all `titleLarge` (1916-1920), four of them drawn from overlapping pools (`gridPool`, 1027-1032) so the same album can appear three times. `MediaCard.tsx:35-37` labels each tile with `item.Name` and nothing else. If a user cannot name a single section, then the sections are not communicating structure — they are filling a scroll. What would Home look like if it were allowed to show four things, ordered by what the user is most likely to want *right now*, with the first one given real visual weight? And which of the seven would the team defend keeping?
