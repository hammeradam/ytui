import { create } from 'zustand';
import { eq, asc, and, count } from 'drizzle-orm';
import fs from 'node:fs';

import { getDb, schema } from '../db/index';
import type { Track, Playlist } from '../db/schema';
import type { SearchResult } from '../lib/ytdlp';
import type { DownloadJob } from '../lib/downloader';
import { loadConfig, saveConfig, type Config, type EqBandConfig, type EqPreset } from '../lib/config';
import { player } from '../lib/mpv-player';
import { usePlayerStore } from './mpv-store';

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

export type ActiveView =
  | 'search'
  | 'library'
  | 'playlists'
  | 'queue'
  | 'help'
  | 'settings';

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export type RepeatMode = 'none' | 'one' | 'all';

// Re-export EqBandConfig from config for convenience
export type EqBand = EqBandConfig;

export type AppState = {
  // Search
  searchQuery: string;
  searchResults: SearchResult[];
  searchLoading: boolean;
  searchError: string;

  // Library
  tracks: Track[];

  // Downloads
  downloadQueue: DownloadJob[];

  // Play queue
  queue: Track[]; // ordered list of tracks to play
  queueIndex: number; // index of currently-playing track in queue (-1 = none)
  repeatMode: RepeatMode;
  shuffle: boolean;

  // Playlists
  playlists: Playlist[];
  activePlaylistId: number | null;
  playlistTracks: Track[];
  playlistTrackCounts: Record<number, number>; // playlistId -> track count

   // UI
   activeView: ActiveView;
   statusMsg: string;
   /** True while a text input field in any view has keyboard focus. Suppresses global hotkeys. */
   inputFocused: boolean;
   eqPanelOpen: boolean;
   eqSelectedBand: number; // index of selected band (0-based)
   eqBands: EqBand[]; // EQ bands state
   eqPresets: EqPreset[]; // saved presets
   eqPresetViewOpen: boolean; // preset selector panel open

   // Settings
   settings: Config;

   // Actions — search
   setSearchQuery: (q: string) => void;
   setSearchResults: (r: SearchResult[]) => void;
   setSearchLoading: (v: boolean) => void;
   setSearchError: (e: string) => void;

   // Actions — library
   reloadTracks: () => Promise<void>;
   deleteTrack: (trackId: string) => Promise<void>;

   // Actions — downloads
   setDownloadQueue: (q: DownloadJob[]) => void;

   // Actions — play queue
   /** Start playing `track` within the given `context` list; auto-advances on track end. */
   playFromContext: (track: Track, context: Track[]) => void;
   /** Advance to next track (respects shuffle / repeat). Returns true if a track was started. */
   playNext: () => boolean;
   /** Go back to previous track. */
   playPrev: () => void;
   toggleShuffle: () => void;
   cycleRepeat: () => void;

   // Actions — playlists
   reloadPlaylists: () => Promise<void>;
   setActivePlaylistId: (id: number | null) => void;
   reloadPlaylistTracks: (playlistId: number) => Promise<void>;
   createPlaylist: (name: string) => Promise<Playlist>;
   deletePlaylist: (id: number) => Promise<void>;
   addTrackToPlaylist: (playlistId: number, trackId: string) => Promise<void>;
   removeTrackFromPlaylist: (
     playlistId: number,
     trackId: string,
   ) => Promise<void>;
   moveTrackInPlaylist: (
     playlistId: number,
     trackId: string,
     direction: 'up' | 'down',
   ) => Promise<void>;

   // Actions — UI
   setActiveView: (v: ActiveView) => void;
   setStatusMsg: (msg: string) => void;
   setSettings: (c: Config) => void;
   setInputFocused: (v: boolean) => void;

   // Actions — EQ
   toggleEqPanel: () => void;
   setEqBandGain: (bandIndex: number, gain: number) => void;
   selectEqBand: (bandIndex: number) => void;
   selectEqBandRelative: (delta: number) => void; // for left/right navigation
   toggleEqPresetView: () => void;
   loadEqPreset: (presetName: string) => void;
   saveEqPreset: (name: string) => void;
   deleteEqPreset: (name: string) => void;
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useStore = create<AppState>((set, get) => {
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  const config = loadConfig();

  return ({
  // Search
  searchQuery: '',
  searchResults: [],
  searchLoading: false,
  searchError: '',

  // Library
  tracks: [],

  // Downloads
  downloadQueue: [],

  // Play queue
  queue: [],
  queueIndex: -1,
  repeatMode: 'none' as RepeatMode,
  shuffle: false,

  // Playlists
  playlists: [],
  activePlaylistId: null,
  playlistTracks: [],
  playlistTrackCounts: {},

  // UI
  activeView: 'search',
  statusMsg: '',
  inputFocused: true,
  eqPanelOpen: false,
  eqSelectedBand: 0,
  eqBands: [...config.eqBands],
  eqPresets: [...config.eqPresets],
  eqPresetViewOpen: false,

  // Settings
  settings: config,

  // --- Search actions ---
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchResults: (r) => set({ searchResults: r }),
  setSearchLoading: (v) => set({ searchLoading: v }),
  setSearchError: (e) => set({ searchError: e }),

  // --- Library actions ---
  reloadTracks: async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.tracks)
      .orderBy(asc(schema.tracks.downloadedAt));
    set({ tracks: rows });
  },

  deleteTrack: async (trackId) => {
    const db = getDb();
    const [track] = await db
      .select()
      .from(schema.tracks)
      .where(eq(schema.tracks.id, trackId))
      .limit(1);
    if (!track) return;
    // Remove file from disk (best effort)
    try {
      fs.unlinkSync(track.filePath);
    } catch {
      /* ignore */
    }
    // Delete from DB (FK cascade removes playlist_tracks rows)
    await db.delete(schema.tracks).where(eq(schema.tracks.id, trackId));
    await get().reloadTracks();
    // Refresh active playlist if needed
    const pid = get().activePlaylistId;
    if (pid !== null) await get().reloadPlaylistTracks(pid);
  },

  // --- Download actions ---
  setDownloadQueue: (q) => set({ downloadQueue: q }),

  // --- Play queue actions ---
  playFromContext: (track, context) => {
    const idx = context.findIndex((t) => t.id === track.id);
    set({ queue: context, queueIndex: idx < 0 ? 0 : idx });
    player.play(track.filePath);
  },

  playNext: () => {
    const { queue, queueIndex, repeatMode, shuffle } = get();
    if (queue.length === 0) return false;

    if (repeatMode === 'one') {
      // Replay same track
      const t = queue[queueIndex];
      if (!t) return false;
      player.play(t.filePath);
      return true;
    }

    let nextIdx: number;
    if (shuffle) {
      // Pick a random index different from current (unless only 1 track)
      if (queue.length === 1) {
        nextIdx = 0;
      } else {
        do {
          nextIdx = Math.floor(Math.random() * queue.length);
        } while (nextIdx === queueIndex);
      }
    } else {
      nextIdx = queueIndex + 1;
    }

    if (nextIdx >= queue.length) {
      if (repeatMode === 'all') {
        nextIdx = 0;
      } else {
        // End of queue — stop
        set({ queueIndex: -1 });
        return false;
      }
    }

    const t = queue[nextIdx]!;
    set({ queueIndex: nextIdx });
    player.play(t.filePath);
    return true;
  },

  playPrev: () => {
    const { queue, queueIndex, repeatMode } = get();
    if (queue.length === 0) return;
    // If more than 3 s have elapsed, restart the current track instead
    const elapsed = usePlayerStore.getState().time;
    if (elapsed > loadConfig().restartThreshold) {
      player.seekTo(0);
      return;
    }
    let prevIdx = queueIndex - 1;
    if (prevIdx < 0) {
      if (repeatMode === 'all') {
        prevIdx = queue.length - 1;
      } else {
        prevIdx = 0;
      }
    }
    const t = queue[prevIdx];
    if (!t) return;
    set({ queueIndex: prevIdx });
    player.play(t.filePath);
  },

  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

  cycleRepeat: () =>
    set((s) => ({
      repeatMode:
        s.repeatMode === 'none'
          ? 'one'
          : s.repeatMode === 'one'
            ? 'all'
            : 'none',
    })),

  // --- Playlist actions ---
  reloadPlaylists: async () => {
    const db = getDb();
    const rows = await db
      .select()
      .from(schema.playlists)
      .orderBy(asc(schema.playlists.createdAt));
    // Fetch track counts per playlist in one query
    const countRows = await db
      .select({
        playlistId: schema.playlistTracks.playlistId,
        trackCount: count(schema.playlistTracks.id),
      })
      .from(schema.playlistTracks)
      .groupBy(schema.playlistTracks.playlistId);
    const playlistTrackCounts: Record<number, number> = {};
    for (const r of countRows) {
      playlistTrackCounts[r.playlistId] = r.trackCount;
    }
    set({ playlists: rows, playlistTrackCounts });
  },

  setActivePlaylistId: (id) => {
    set({ activePlaylistId: id, playlistTracks: [] });
    if (id !== null) void get().reloadPlaylistTracks(id);
  },

  reloadPlaylistTracks: async (playlistId) => {
    const db = getDb();
    const rows = await db
      .select({
        track: schema.tracks,
        position: schema.playlistTracks.position,
      })
      .from(schema.playlistTracks)
      .innerJoin(
        schema.tracks,
        eq(schema.playlistTracks.trackId, schema.tracks.id),
      )
      .where(eq(schema.playlistTracks.playlistId, playlistId))
      .orderBy(asc(schema.playlistTracks.position));
    set({ playlistTracks: rows.map((r) => r.track) });
  },

  createPlaylist: async (name) => {
    const db = getDb();
    const [row] = await db
      .insert(schema.playlists)
      .values({ name, createdAt: new Date().toISOString() })
      .returning();
    await get().reloadPlaylists();
    return row!;
  },

  deletePlaylist: async (id) => {
    const db = getDb();
    await db.delete(schema.playlists).where(eq(schema.playlists.id, id));
    if (get().activePlaylistId === id)
      set({ activePlaylistId: null, playlistTracks: [] });
    await get().reloadPlaylists();
  },

  addTrackToPlaylist: async (playlistId, trackId) => {
    const db = getDb();
    // Compute next position
    const existing = await db
      .select({ position: schema.playlistTracks.position })
      .from(schema.playlistTracks)
      .where(eq(schema.playlistTracks.playlistId, playlistId))
      .orderBy(asc(schema.playlistTracks.position));
    const maxPos =
      existing.length > 0 ? Math.max(...existing.map((r) => r.position)) : -1;
    await db
      .insert(schema.playlistTracks)
      .values({
        playlistId,
        trackId,
        position: maxPos + 1,
        addedAt: new Date().toISOString(),
      })
      .onConflictDoNothing();
    if (get().activePlaylistId === playlistId)
      await get().reloadPlaylistTracks(playlistId);
  },

  removeTrackFromPlaylist: async (playlistId, trackId) => {
    const db = getDb();

    // Read current rows from DB first (source of truth)
    const rows = await db
      .select({
        trackId: schema.playlistTracks.trackId,
        addedAt: schema.playlistTracks.addedAt,
      })
      .from(schema.playlistTracks)
      .where(eq(schema.playlistTracks.playlistId, playlistId))
      .orderBy(asc(schema.playlistTracks.position));

    const remaining = rows.filter((r) => r.trackId !== trackId);

    // Wrap delete + reinsert in a synchronous transaction (bun:sqlite is sync)
    db.transaction((tx) => {
      tx.delete(schema.playlistTracks)
        .where(eq(schema.playlistTracks.playlistId, playlistId))
        .run();
      for (let i = 0; i < remaining.length; i++) {
        tx.insert(schema.playlistTracks)
          .values({
            playlistId,
            trackId: remaining[i]!.trackId,
            position: i,
            addedAt: remaining[i]!.addedAt,
          })
          .run();
      }
    });

    await get().reloadPlaylistTracks(playlistId);
  },

  moveTrackInPlaylist: async (playlistId, trackId, direction) => {
    const db = getDb();
    // Fetch positions from DB to avoid trusting potentially stale in-memory state
    const rows = await db
      .select({
        trackId: schema.playlistTracks.trackId,
        position: schema.playlistTracks.position,
      })
      .from(schema.playlistTracks)
      .where(eq(schema.playlistTracks.playlistId, playlistId))
      .orderBy(asc(schema.playlistTracks.position));

    const idx = rows.findIndex((r) => r.trackId === trackId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rows.length) return;

    const a = rows[idx]!;
    const b = rows[swapIdx]!;
    // Swap positions, scoped to this playlist via and()
    await db
      .update(schema.playlistTracks)
      .set({ position: b.position })
      .where(
        and(
          eq(schema.playlistTracks.playlistId, playlistId),
          eq(schema.playlistTracks.trackId, a.trackId),
        ),
      );
    await db
      .update(schema.playlistTracks)
      .set({ position: a.position })
      .where(
        and(
          eq(schema.playlistTracks.playlistId, playlistId),
          eq(schema.playlistTracks.trackId, b.trackId),
        ),
      );
    await get().reloadPlaylistTracks(playlistId);
  },

  // --- UI actions ---
  setActiveView: (v) => set({ activeView: v, inputFocused: v === 'search' }),
  setInputFocused: (v) => set({ inputFocused: v }),
  setStatusMsg: (msg) => {
    if (statusTimer !== null) { clearTimeout(statusTimer); statusTimer = null; }
    set({ statusMsg: msg });
    if (msg) {
      statusTimer = setTimeout(() => { set({ statusMsg: '' }); statusTimer = null; }, 3000);
    }
  },
  setSettings: (c) => set({ settings: c }),

  // --- EQ actions ---
  toggleEqPanel: () => {
    const isOpen = get().eqPanelOpen;
    set({ eqPanelOpen: !isOpen, eqSelectedBand: 0, eqPresetViewOpen: false });
  },
  setEqBandGain: (bandIndex, gain) => {
    const bands = [...get().eqBands];
    if (bandIndex >= 0 && bandIndex < bands.length) {
      // Clamp to -12 to +12 dB
      const clampedGain = Math.max(-12, Math.min(12, gain));
      bands[bandIndex] = { ...bands[bandIndex]!, gain: clampedGain };
      set({ eqBands: bands });
      // Persist to config
      const cfg = get().settings;
      const newConfig = { ...cfg, eqBands: bands };
      saveConfig(newConfig);
      // Apply to player
      void player.setAudioFilters(bands);
    }
  },
  selectEqBand: (bandIndex) => {
    if (bandIndex >= 0 && bandIndex < get().eqBands.length) {
      set({ eqSelectedBand: bandIndex });
    }
  },
  selectEqBandRelative: (delta) => {
    const current = get().eqSelectedBand;
    const next = current + delta;
    const bands = get().eqBands;
    if (next >= 0 && next < bands.length) {
      set({ eqSelectedBand: next });
    }
  },
  toggleEqPresetView: () => {
    const isOpen = get().eqPresetViewOpen;
    set({ eqPresetViewOpen: !isOpen });
  },
  loadEqPreset: (presetName) => {
    const presets = get().eqPresets;
    const preset = presets.find((p) => p.name === presetName);
    if (preset) {
      set({ eqBands: [...preset.bands] });
      // Persist to config
      const cfg = get().settings;
      const newConfig = { ...cfg, eqBands: [...preset.bands] };
      saveConfig(newConfig);
      // Apply to player
      void player.setAudioFilters(preset.bands);
      get().setStatusMsg(`EQ preset loaded: ${presetName}`);
    }
  },
  saveEqPreset: (name) => {
    const bands = get().eqBands;
    const presets = [...get().eqPresets];
    // Remove if already exists
    const idx = presets.findIndex((p) => p.name === name);
    if (idx >= 0) presets.splice(idx, 1);
    // Add new preset
    presets.push({ name, bands: [...bands] });
    set({ eqPresets: presets });
    // Persist to config
    const cfg = get().settings;
    const newConfig = { ...cfg, eqPresets: presets };
    saveConfig(newConfig);
    get().setStatusMsg(`EQ preset saved: ${name}`);
  },
  deleteEqPreset: (name) => {
    const presets = get().eqPresets.filter((p) => p.name !== name);
    set({ eqPresets: presets });
    // Persist to config
    const cfg = get().settings;
    const newConfig = { ...cfg, eqPresets: presets };
    saveConfig(newConfig);
    get().setStatusMsg(`EQ preset deleted: ${name}`);
  },
  });
});
