# AGENTS.md — instructions for AI agents working on this repo

## Working preferences

- **Never push to remote without explicit user approval.** Commit and show the diff, then wait for a go-ahead before running `git push`.
- Make **conventional commits** after each logical group of changes (`feat:`, `fix:`, `ci:`, `chore:`, `refactor:`, etc.).
- After completing a task that was listed in `IMPROVEMENTS.md`, mark it with `~~strikethrough~~ ✓`.

## Project overview

`ytui` is a terminal UI YouTube music player built with:

- **Runtime**: Bun
- **TUI**: Ink v6 + React 19
- **DB**: bun:sqlite + Drizzle ORM
- **State**: Zustand
- **Playback**: mpv (via Unix IPC socket, not afplay — `plan.md` is outdated on this)
- **Downloader**: yt-dlp (auto-downloaded from GitHub Releases if not on PATH)
- **Lint**: oxlint

## Key facts

- User has a **Hungarian keyboard** — avoid `[` and `]` as keybindings.
- All terminal sizing flows from a single `useStdout()` call in `App.tsx`. `rows`/`cols` are stored in React state and updated via a `resize` listener so the layout reflows on terminal resize.
- yt-dlp calls must use `--extractor-args 'youtube:player_client=mediaconnect'`. The `ios` and `mweb` clients now require a GVS PO Token (YouTube change, 2025) and return HTTP 403. The `mediaconnect` client works without a JS runtime or PO token.
- Release binaries are shipped as `.tar.gz` archives (not raw files) to preserve the executable bit, which GitHub Releases strips from raw uploads.
- macOS binaries are ad-hoc signed (`codesign --sign -`) in the CI pipeline. This satisfies the code-signature check but does **not** notarize them — users will still need to allow the binary once in macOS Privacy & Security settings. Fixing this requires a paid Apple Developer account.
- `ci:` commit messages do **not** trigger a new release. Only `feat:`, `fix:`, `perf:`, and breaking changes do.
- To force a release without a real change, use an empty `fix:` commit: `git commit --allow-empty -m "fix(...): ..."`.

## CI / release pipeline

`.github/workflows/release.yml` — four jobs:

1. **version** (`ubuntu-latest`): reads conventional commits since last tag, computes next semver, sets `release_needed`.
2. **build** (`ubuntu-latest`): cross-compiles three targets (`bun-darwin-arm64`, `bun-darwin-x64`, `bun-linux-x64`) and uploads as artifact.
3. **sign-macos** (`macos-latest`): downloads the artifact, ad-hoc codesigns the two macOS binaries, re-uploads.
4. **release** (`ubuntu-latest`): merges artifacts, `chmod +x`, packages as `.tar.gz`, bumps `package.json`, tags, creates GitHub Release.

## Key source files

```
src/
  db/
    schema.ts              # Drizzle schema: tracks, playlists, playlist_tracks
    index.ts               # open DB, run migrations
    migrations.generated.ts
  lib/
    ytdlp.ts               # locate/download yt-dlp, search, download audio
    mpv-player.ts          # mpv IPC socket wrapper (play, pause, seek, volume)
    mpv-adapter.ts         # domain events from mpv IPC
    downloader.ts          # queue-based download manager
    config.ts              # hotkeys, Config type, loadConfig
  store/
    index.ts               # app store — queue, playNext, playPrev, etc.
    mpv-store.ts           # player state machine (Zustand)
  tui/
    App.tsx                # global keybindings, view routing, terminal sizing
    components/
      ScrollList.tsx       # reusable scrollable list
      HelpView.tsx         # keybinding help overlay
      PlayerBar.tsx        # now-playing bar
      LibraryView.tsx
      PlaylistView.tsx
      SearchView.tsx
      DownloadQueue.tsx
      SettingsView.tsx
```

## Known remaining issues (from IMPROVEMENTS.md)

- **#29** No yt-dlp update mechanism.
- **#30** Downloads are strictly serial — no concurrency setting.
