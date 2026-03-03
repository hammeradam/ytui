# ytui — plan

## What it is

A terminal UI app for YouTube music management:
- Search YouTube via yt-dlp
- Download audio (m4a/opus) from search results or pasted URLs/video IDs
- Manage a local library with SQLite + Drizzle ORM
- Play downloaded audio with afplay (macOS)
- Manage playlists (create, add, remove, reorder tracks)
- Auto-download yt-dlp binary from GitHub releases if not present

## Tech stack

- **Runtime**: Bun
- **UI**: Ink (v6) + React 19
- **DB**: Bun SQLite + Drizzle ORM (drizzle-kit for migrations)
- **State**: Zustand
- **Audio playback**: afplay (spawned subprocess, macOS only)
- **Downloader**: yt-dlp binary (auto-downloaded from GitHub if not on PATH)
- **Lint**: oxlint

## Directory structure

```
src/
  db/
    schema.ts          # Drizzle schema: tracks, playlists, playlist_tracks
    index.ts           # open DB, run migrations
    migrations/        # SQL migration files (drizzle-kit generated)
  lib/
    ytdlp.ts           # locate/download yt-dlp binary, search, download audio
    player.ts          # afplay wrapper: play, pause (kill), resume, track position
    downloader.ts      # queue-based download manager (one at a time)
  store/
    index.ts           # Zustand store: library, queue, player state, search, playlists
  tui/
    index.tsx          # Ink app entry: render <App />
    App.tsx            # top-level layout (header, main area, footer/player bar)
    components/
      SearchView.tsx   # search input + result list
      LibraryView.tsx  # downloaded tracks list
      PlayerBar.tsx    # now-playing bar at bottom
      PlaylistView.tsx # playlist management
      DownloadQueue.tsx # active + queued downloads
      HelpView.tsx     # keybinding help overlay
      Scrollable.tsx   # reusable scrollable list (from invoices project)
  index.ts             # CLI entry: init db, check/dl yt-dlp, render TUI
```

## DB schema

### tracks
| column | type | notes |
|---|---|---|
| id | text PK | YouTube video ID |
| title | text | |
| channel | text | uploader name |
| duration | integer | seconds |
| file_path | text | absolute path to downloaded file |
| file_ext | text | m4a / opus / webm |
| thumbnail_url | text | |
| downloaded_at | text | ISO timestamp |
| file_size | integer | bytes |

### playlists
| column | type | notes |
|---|---|---|
| id | integer PK autoincrement | |
| name | text | |
| created_at | text | |

### playlist_tracks
| column | type | notes |
|---|---|---|
| id | integer PK autoincrement | |
| playlist_id | integer FK | |
| track_id | text FK | |
| position | integer | ordering |
| added_at | text | |

## Zustand store shape

```ts
{
  // search
  searchQuery: string
  searchResults: SearchResult[]   // yt-dlp JSON search hits
  searchLoading: boolean
  searchError: string

  // library
  tracks: Track[]                 // all downloaded tracks from DB

  // downloads
  downloadQueue: DownloadJob[]    // { id, videoId, title, status, progress }

  // player
  player: {
    track: Track | null
    playing: boolean
    pid: number | null            // afplay PID for kill/resume
    elapsed: number               // seconds, updated by interval
  }

  // playlists
  playlists: Playlist[]
  activePlaylist: Playlist | null
  playlistTracks: Track[]         // tracks in activePlaylist

  // ui
  activeView: 'search' | 'library' | 'playlists' | 'queue' | 'help'
  statusMsg: string
}
```

## Key flows

### Search
1. User types query in SearchView → debounce 300ms
2. `yt-dlp "ytsearch10:<query>" --dump-json --no-download` → parse NDJSON
3. Results shown in scrollable list with title/channel/duration
4. Enter on result → add to download queue

### Download
1. DownloadJob added to queue with status `pending`
2. Worker picks next `pending` job, sets `downloading`
3. `yt-dlp -x --audio-format m4a -o <musicDir>/%(id)s.%(ext)s <url>` with `--progress` parsed
4. On completion: insert into `tracks` table, update store, set `done`
5. One download at a time (sequential queue)

### Playback
1. User selects a downloaded track → `afplay <file_path>` spawned
2. PID stored; kill PID to stop
3. afplay has no pause — workaround: kill + remember position; re-spawn with `-t <offset>` to resume
4. Elapsed time tracked via setInterval (1s), capped at duration

### Playlists
1. LibraryView: select track, `a` → pick playlist to add to
2. PlaylistView: list playlists, enter to open, j/k navigate, `d` remove track, `n` new playlist
3. Play entire playlist: enqueue tracks in order

## yt-dlp auto-download

1. Check PATH for yt-dlp
2. Check `~/.local/bin/yt-dlp`
3. If not found: fetch latest release from `https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest`
4. Download binary for `darwin` (or `darwin_legacy` for Intel), chmod +x, save to `~/.local/bin/yt-dlp`

## Key bindings

| key | action |
|---|---|
| 1 | switch to Search view |
| 2 | switch to Library view |
| 3 | switch to Playlists view |
| 4 | switch to Download Queue view |
| ? | toggle Help overlay |
| j / ↓ | move down |
| k / ↑ | move up |
| Enter | select / confirm |
| Space | play/pause current track |
| n | next track |
| d | delete / remove |
| a | add to playlist |
| / | focus search input |
| q | quit |

## Data directory

`~/.ytui/` — music files, SQLite DB, yt-dlp binary cache

---

## Implementation phases

### Phase 1 — scaffold
- [x] bun init, tsconfig, package.json
- [ ] install deps
- [ ] drizzle schema + migration
- [ ] db/index.ts

### Phase 2 — core lib
- [ ] ytdlp.ts: locate, auto-download, search, download audio
- [ ] player.ts: afplay wrapper
- [ ] downloader.ts: sequential download queue

### Phase 3 — store
- [ ] zustand store with all slices

### Phase 4 — TUI views
- [ ] App.tsx skeleton + key routing
- [ ] PlayerBar
- [ ] SearchView
- [ ] LibraryView
- [ ] DownloadQueue
- [ ] PlaylistView
- [ ] HelpView

### Phase 5 — wiring + polish
- [ ] Connect store → views
- [ ] Status messages
- [ ] Error handling
- [ ] Lint pass
