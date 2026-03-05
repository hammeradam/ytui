# ytui — Improvement Ideas

## Bug Fixes (High Priority)

### ~~1. `moveTrackInPlaylist` missing `playlistId` filter~~ ✓
**Location:** `src/store/index.ts:217-224`

The two position `UPDATE` statements only filter by `trackId`. If a track appears in multiple playlists, both rows get their positions swapped incorrectly. The queries need a `WHERE playlist_id = ?` clause.

### ~~2. `removeTrackFromPlaylist` non-atomic, uses stale state~~ ✓
**Location:** `src/store/index.ts:188-202`

Deletes all rows for a playlist, then re-inserts from in-memory `playlistTracks`. If the store is stale or re-inserts fail midway, tracks are silently lost. Should use a DB transaction instead, reading source-of-truth from the DB rather than in-memory state.

### ~~3. No delete-from-library~~ ✓
**Location:** `src/tui/components/LibraryView.tsx`

The help screen lists `d` as "Delete / remove" but `LibraryView` has no `d` handler. Pressing `d` in the library silently does nothing.

---

## Code Cleanup (Medium Priority)

### ~~4. Dead no-op `useEffect`s~~ ✓
- `src/tui/components/SearchView.tsx:87` — `useEffect(() => {}, [downloadQueue])` does nothing
- `src/tui/components/ScrollList.tsx:50` — `useEffect(() => {}, [selectedIndex])` does nothing; the comment "Force re-render" is incorrect as an empty effect does not cause a re-render

Both should be removed.

### ~~5. Misnamed `isAfplayAvailable()`~~ ✓
**Location:** `src/lib/player.ts`

Checks for `ffplay` in PATH but is named after the old `afplay` design. It is not called anywhere in the codebase. Remove or rename it.

### ~~6. `drizzle.config.ts` DB path mismatch~~ ✓
Points to `./data/ytui.db` (project-relative) but the app opens `~/.ytui/ytui.db` at runtime. Not a runtime problem since migrations run from SQL files, but misleading for any `drizzle-kit` introspection workflows.

### ~~7. Dead `db:migrate` script~~ ✓
`package.json` references `src/db/migrate.ts` which does not exist — migration logic is inlined into `openDb()` instead. Remove the script or create the file.

---

## UX / Feature Improvements

### ~~8. Play queue and auto-advance~~ ✓
`n` currently just stops playback. A proper next-track concept would require a play queue. Tracks from a playlist or search results could be enqueued and auto-advanced on track end — `_onTrackEnd` is already wired in `src/lib/player.ts` for exactly this purpose.

### ~~9. Delete track from library~~ ✓
Add a `d` handler in `LibraryView` that removes the track from the DB and deletes the file from disk. Should also handle cascade cleanup from any playlists it belongs to.

### ~~10. URL paste to download~~ ✓
`enqueueUrl()` already exists in `src/lib/downloader.ts` but there is no UI entry point for it. A "paste a URL" flow in `SearchView` — detecting input that looks like a YouTube URL rather than a search query — would expose this without requiring a new view.

### ~~11. Volume control~~ ✓
`ffplay` supports a `-volume 0–100` flag. Adding `[` / `]` keybindings to adjust volume and persisting the value across track changes would make the player significantly more usable.

### ~~12. Shuffle and repeat modes~~ ✓
Player state could track a mode flag (`normal | shuffle | repeat-one | repeat-all`) toggled with `r` and `s` keybindings — standard music player conventions.

### ~~13. Track metadata in PlayerBar~~ ✓
`PlayerBar` currently shows only the filename. Channel name and full duration are already in the DB and available via the player state; surfacing them in the now-playing bar is a small change with a noticeable UX improvement.

### ~~14. Mark already-downloaded tracks in search results~~ ✓
`SearchView` has no way to know which results are already in the library. A visual indicator (e.g. a `✓` marker) on already-downloaded tracks would prevent redundant downloads and give useful context.

### ~~15. Cross-platform support~~ ✓
The app is effectively macOS-only — `ffplay` is downloaded from `evermeet.cx` (an Intel macOS static binary), and binary resolution only checks Homebrew paths. Linux and Windows support would require platform detection in `src/lib/ffmpeg.ts` and `src/lib/ytdlp.ts`.

---

## Architecture / Technical Debt

### ~~16. Blocking search~~ ✓
`searchYouTube()` in `src/lib/ytdlp.ts` uses `spawnSync`, which blocks the Bun event loop — and the entire TUI — while the search runs. It should be converted to async `Bun.spawn` with a promise, consistent with how `downloadAudio()` is already implemented.

### ~~17. SQL injection in migration runner~~ ✓
**Location:** `src/db/index.ts`

The `INSERT INTO __drizzle_migrations` statement interpolates the migration filename directly into a SQL string. The filename is local and controlled, but it should use a parameterized query for correctness and to establish a safe pattern.

### ~~18. No retry for failed downloads~~ ✓
Jobs stuck in `error` state persist in memory but there is no way to retry them from the UI. A `r` keybind in `DownloadQueue` to re-enqueue errored jobs would cover the common case of a transient network failure.

### ~~19. `ffmpeg` is downloaded but never used~~ ✓
`ensureFfmpeg()` is called at startup but `ffmpeg` is never invoked anywhere in the codebase. It was likely intended for audio format conversion. Either wire it into the download pipeline or remove it from the startup sequence.

---

## Bug Fixes (Round 2)

### ~~20. `openDb()` startup call doesn't populate the `db` singleton~~ ✓
**Location:** `src/index.ts:6`, `src/db/index.ts`

`main()` calls `openDb()` at startup to run migrations early, but `openDb()` does not assign the result to the `db` module-level variable. The first subsequent `getDb()` call (from any store action) therefore calls `openDb()` a second time, re-opening the database file and re-running the migration loop. `main()` should call `getDb()` instead of `openDb()`.

### ~~21. `downloadedIds.includes(item.id)` is a substring match~~ ✓
**Location:** `src/tui/components/SearchView.tsx`

`downloadedIds` is built with `s.tracks.map((t) => t.id).join(',')` and tested with `.includes(item.id)`. A YouTube ID that is a substring of a concatenated pair of other IDs would produce a false positive. Should use `useMemo` to construct a `Set<string>` from `s.tracks` and test membership with `.has(item.id)`.

### ~~22. `playPrev` doesn't wrap around in `repeat-all` mode~~ ✓
**Location:** `src/store/index.ts` — `playPrev`

`playPrev` unconditionally clamps to `Math.max(0, queueIndex - 1)`, so at the first track in an `all`-repeat queue it stays stuck at index 0 instead of wrapping to the last track. `playNext` correctly handles the wrap; `playPrev` should mirror that logic for the lower bound.

### ~~23. `removeTrackFromPlaylist` delete-then-reinsert not wrapped in a transaction~~ ✓
**Location:** `src/store/index.ts` — `removeTrackFromPlaylist`

The implementation deletes all playlist rows then reinserts the survivors one-by-one. If the process is killed after the `DELETE` and before all `INSERT`s complete, the playlist loses all its tracks. The entire operation should be wrapped in a `db.transaction()` block to make it atomic.

### ~~24. `DownloadQueue` has no keybinding to remove pending/done jobs~~ ✓
**Location:** `src/tui/components/DownloadQueue.tsx`

`downloader.removeFromQueue(id)` already exists and guards against removing in-progress jobs, but no keybinding (`x` or `d`) is wired in `DownloadQueue.tsx`. Completed and pending jobs accumulate in the list indefinitely with no way to clear them from the UI.

---

## Code Cleanup (Round 2)

### ~~25. `ProgressBar` in `PlayerBar.tsx` is a React component that returns a string~~ ✓
**Location:** `src/tui/components/PlayerBar.tsx`

`ProgressBar` is declared as a React functional component but simply returns a plain string of block characters. Treating it as a component adds React reconciler overhead and is non-idiomatic. It should be a regular function (returning `string`) called directly inside the JSX expression, not rendered as `<ProgressBar />`.

### ~~26. `statusMsg` is never auto-cleared — stale messages persist indefinitely~~ ✓
**Location:** `src/store/index.ts` — `setStatusMsg`

Once a status message like `"Queued: My Song"` is displayed, it remains on screen until some other action replaces it. A `setTimeout` (e.g. 3 s) inside `setStatusMsg` that resets the message to `''` would keep the status bar informative without accumulating stale text.

---

## UX / Feature Improvements (Round 2)

### ~~27. `prevTrack` should restart the current track if elapsed > 3 s~~ ✓
**Location:** `src/store/index.ts` — `playPrev`

Standard music player behavior (Spotify, VLC, etc.): if more than ~3 seconds of the current track have elapsed, pressing "previous" seeks back to 0 rather than jumping to the prior track. A second press then goes to the previous track. `mpv-player.ts` already has `seekBy`; adding an absolute `seekTo(sec)` method would make this trivial to implement in `playPrev`.

### ~~28. Playlist list shows no track count~~ ✓
**Location:** `src/tui/components/PlaylistView.tsx`

Each row in the playlists list renders only `pl.name`. Adding a `(n tracks)` count — loaded via `COUNT(*)` grouped by `playlistId` in `reloadPlaylists` — would let users see at a glance which playlists have content without having to open each one.

### 29. No yt-dlp update mechanism
**Location:** `src/lib/ytdlp.ts` — `ensureYtDlp`

The app downloads yt-dlp once and never checks for a newer version. YouTube format changes routinely break older yt-dlp builds. A startup version comparison (local `yt-dlp --version` vs. the GitHub releases API tag) with a non-blocking prompt or an explicit "Update yt-dlp" action in the Settings view would keep the binary current.

### 30. Strictly serial downloads — no concurrency setting
**Location:** `src/lib/downloader.ts` — `tick()`

`tick()` uses a single `running: boolean` flag, making all downloads strictly sequential. On fast connections, queuing three tracks means the second waits for the first to fully complete. A `concurrency` config field (default 1, max e.g. 3) with a running-count instead of a boolean flag would unlock parallel downloads while remaining backward-compatible with the default behaviour.

