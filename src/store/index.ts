import { create } from 'zustand';
import { eq, asc } from 'drizzle-orm';

import { getDb, schema } from '../db/index';
import type { Track, Playlist } from '../db/schema';
import type { SearchResult } from '../lib/ytdlp';
import type { DownloadJob } from '../lib/downloader';
import type { PlayerState } from '../lib/player';

// ---------------------------------------------------------------------------
// View types
// ---------------------------------------------------------------------------

export type ActiveView = 'search' | 'library' | 'playlists' | 'queue' | 'help';

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

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

  // Player
  player: PlayerState | null;

  // Playlists
  playlists: Playlist[];
  activePlaylistId: number | null;
  playlistTracks: Track[];

  // UI
  activeView: ActiveView;
  statusMsg: string;

  // Actions — search
  setSearchQuery: (q: string) => void;
  setSearchResults: (r: SearchResult[]) => void;
  setSearchLoading: (v: boolean) => void;
  setSearchError: (e: string) => void;

  // Actions — library
  reloadTracks: () => Promise<void>;

  // Actions — downloads
  setDownloadQueue: (q: DownloadJob[]) => void;

  // Actions — player
  setPlayer: (s: PlayerState | null) => void;

  // Actions — playlists
  reloadPlaylists: () => Promise<void>;
  setActivePlaylistId: (id: number | null) => void;
  reloadPlaylistTracks: (playlistId: number) => Promise<void>;
  createPlaylist: (name: string) => Promise<Playlist>;
  deletePlaylist: (id: number) => Promise<void>;
  addTrackToPlaylist: (playlistId: number, trackId: string) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: number, trackId: string) => Promise<void>;
  moveTrackInPlaylist: (playlistId: number, trackId: string, direction: 'up' | 'down') => Promise<void>;

  // Actions — UI
  setActiveView: (v: ActiveView) => void;
  setStatusMsg: (msg: string) => void;
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useStore = create<AppState>((set, get) => ({
  // Search
  searchQuery: '',
  searchResults: [],
  searchLoading: false,
  searchError: '',

  // Library
  tracks: [],

  // Downloads
  downloadQueue: [],

  // Player
  player: null,

  // Playlists
  playlists: [],
  activePlaylistId: null,
  playlistTracks: [],

  // UI
  activeView: 'search',
  statusMsg: '',

  // --- Search actions ---
  setSearchQuery: (q) => set({ searchQuery: q }),
  setSearchResults: (r) => set({ searchResults: r }),
  setSearchLoading: (v) => set({ searchLoading: v }),
  setSearchError: (e) => set({ searchError: e }),

  // --- Library actions ---
  reloadTracks: async () => {
    const db = getDb();
    const rows = await db.select().from(schema.tracks).orderBy(asc(schema.tracks.downloadedAt));
    set({ tracks: rows });
  },

  // --- Download actions ---
  setDownloadQueue: (q) => set({ downloadQueue: q }),

  // --- Player actions ---
  setPlayer: (s) => set({ player: s }),

  // --- Playlist actions ---
  reloadPlaylists: async () => {
    const db = getDb();
    const rows = await db.select().from(schema.playlists).orderBy(asc(schema.playlists.createdAt));
    set({ playlists: rows });
  },

  setActivePlaylistId: (id) => {
    set({ activePlaylistId: id, playlistTracks: [] });
    if (id !== null) void get().reloadPlaylistTracks(id);
  },

  reloadPlaylistTracks: async (playlistId) => {
    const db = getDb();
    const rows = await db
      .select({ track: schema.tracks, position: schema.playlistTracks.position })
      .from(schema.playlistTracks)
      .innerJoin(schema.tracks, eq(schema.playlistTracks.trackId, schema.tracks.id))
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
    if (get().activePlaylistId === id) set({ activePlaylistId: null, playlistTracks: [] });
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
    const maxPos = existing.length > 0
      ? Math.max(...existing.map((r) => r.position))
      : -1;
    await db
      .insert(schema.playlistTracks)
      .values({
        playlistId,
        trackId,
        position: maxPos + 1,
        addedAt: new Date().toISOString(),
      })
      .onConflictDoNothing();
    if (get().activePlaylistId === playlistId) await get().reloadPlaylistTracks(playlistId);
  },

  removeTrackFromPlaylist: async (playlistId, trackId) => {
    const db = getDb();
    await db
      .delete(schema.playlistTracks)
      .where(
        eq(schema.playlistTracks.playlistId, playlistId),
      );
    // Re-insert all except the removed one with normalised positions
    const remaining = get().playlistTracks.filter((t) => t.id !== trackId);
    for (let i = 0; i < remaining.length; i++) {
      await db.insert(schema.playlistTracks).values({
        playlistId,
        trackId: remaining[i]!.id,
        position: i,
        addedAt: new Date().toISOString(),
      });
    }
    await get().reloadPlaylistTracks(playlistId);
  },

  moveTrackInPlaylist: async (playlistId, trackId, direction) => {
    const tracks = get().playlistTracks;
    const idx = tracks.findIndex((t) => t.id === trackId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= tracks.length) return;

    const db = getDb();
    // Swap positions
    const a = tracks[idx]!;
    const b = tracks[swapIdx]!;
    await db
      .update(schema.playlistTracks)
      .set({ position: swapIdx })
      .where(eq(schema.playlistTracks.trackId, a.id));
    await db
      .update(schema.playlistTracks)
      .set({ position: idx })
      .where(eq(schema.playlistTracks.trackId, b.id));
    await get().reloadPlaylistTracks(playlistId);
  },

  // --- UI actions ---
  setActiveView: (v) => set({ activeView: v }),
  setStatusMsg: (msg) => set({ statusMsg: msg }),
}));
