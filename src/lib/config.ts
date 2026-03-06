/**
 * config.ts — reads and writes ~/.ytui/config.json.
 *
 * All settings have sensible defaults so the file is optional.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getDataDir } from '../db/index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AudioFormat  = 'm4a' | 'opus' | 'best';
export type AudioQuality = 'best' | '256k' | '192k' | '128k';

export type EqBandConfig = {
  freq: number;
  label: string;
  gain: number;
};

export type EqPreset = {
  name: string;
  bands: EqBandConfig[];
};

/**
 * An action that can be bound to a hotkey.
 * Special keys are stored as words: 'space', 'left', 'right', 'up', 'down', 'enter', 'escape'.
 * Regular printable characters are stored as-is (e.g. 'q', '1', '?').
 */
export type HotkeyAction =
  | 'quit'
  | 'playPause'
  | 'seekBack'
  | 'seekForward'
  | 'volumeDown'
  | 'volumeUp'
  | 'nextTrack'
  | 'prevTrack'
  | 'toggleShuffle'
  | 'cycleRepeat'
  | 'viewSearch'
  | 'viewLibrary'
  | 'viewPlaylists'
  | 'viewQueue'
  | 'viewSettings'
  | 'viewHelp';

export type Hotkeys = Record<HotkeyAction, string>;

export type Config = {
  /** Default volume when mpv starts (0–100). */
  defaultVolume: number;
  /** Preferred audio container format for downloads. */
  audioFormat: AudioFormat;
  /** Maximum audio bitrate passed to yt-dlp. */
  audioQuality: AudioQuality;
  /** Max number of YouTube search results to display. */
  searchResultsLimit: number;
  /** Seconds after which "play" on the current track restarts instead of resuming. */
  restartThreshold: number;
  /** Unix socket path for mpv IPC. */
  mpvSocketPath: string;
  /** Directory where audio files are saved. Empty = default (~/.ytui/music). */
  downloadDir: string;
  /** Google API key for YouTube Data API v3. When set, search uses the official API instead of yt-dlp. */
  youtubeApiKey: string;
  /** Keyboard shortcuts for each action. */
  hotkeys: Hotkeys;
  /** Current EQ band settings. */
  eqBands: EqBandConfig[];
  /** Saved EQ presets. */
  eqPresets: EqPreset[];
};

export const DEFAULT_HOTKEYS: Hotkeys = {
  quit:          'q',
  playPause:     'space',
  seekBack:      'left',
  seekForward:   'right',
  volumeDown:    'u',
  volumeUp:      'i',
  nextTrack:     'n',
  prevTrack:     'p',
  toggleShuffle: 's',
  cycleRepeat:   'r',
  viewSearch:    '1',
  viewLibrary:   '2',
  viewPlaylists: '3',
  viewQueue:     '4',
  viewSettings:  '5',
  viewHelp:      '?',
};

export const CONFIG_DEFAULTS: Config = {
  defaultVolume:       80,
  audioFormat:         'm4a',
  audioQuality:        'best',
  searchResultsLimit:  10,
  restartThreshold:    5,
  mpvSocketPath:       '/tmp/mpv.sock',
  downloadDir:         '',
  youtubeApiKey:       '',
  hotkeys:             { ...DEFAULT_HOTKEYS },
  eqBands: [
    { freq: 60, label: 'Bass', gain: 0 },
    { freq: 200, label: 'Low', gain: 0 },
    { freq: 800, label: 'Mid', gain: 0 },
    { freq: 3000, label: 'High', gain: 0 },
    { freq: 12000, label: 'Treble', gain: 0 },
  ],
  eqPresets: [
    {
      name: 'Flat',
      bands: [
        { freq: 60, label: 'Bass', gain: 0 },
        { freq: 200, label: 'Low', gain: 0 },
        { freq: 800, label: 'Mid', gain: 0 },
        { freq: 3000, label: 'High', gain: 0 },
        { freq: 12000, label: 'Treble', gain: 0 },
      ],
    },
    {
      name: 'Bass Boost',
      bands: [
        { freq: 60, label: 'Bass', gain: 6 },
        { freq: 200, label: 'Low', gain: 4 },
        { freq: 800, label: 'Mid', gain: 0 },
        { freq: 3000, label: 'High', gain: -2 },
        { freq: 12000, label: 'Treble', gain: 0 },
      ],
    },
    {
      name: 'Bright',
      bands: [
        { freq: 60, label: 'Bass', gain: 0 },
        { freq: 200, label: 'Low', gain: -2 },
        { freq: 800, label: 'Mid', gain: 2 },
        { freq: 3000, label: 'High', gain: 4 },
        { freq: 12000, label: 'Treble', gain: 6 },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Hotkey helpers
// ---------------------------------------------------------------------------

/** Returns a user-friendly label for a stored hotkey string. */
export function displayHotkey(hk: string): string {
  switch (hk) {
    case 'space':  return 'Space';
    case 'left':   return '←';
    case 'right':  return '→';
    case 'up':     return '↑';
    case 'down':   return '↓';
    case 'enter':  return 'Enter';
    case 'escape': return 'Esc';
    default:       return hk;
  }
}

/** Normalise an ink useInput event to the stored hotkey format. */
export function captureHotkey(
  input: string,
  key: { leftArrow?: boolean; rightArrow?: boolean; upArrow?: boolean; downArrow?: boolean; return?: boolean; escape?: boolean },
): string | null {
  if (key.leftArrow)  return 'left';
  if (key.rightArrow) return 'right';
  if (key.upArrow)    return 'up';
  if (key.downArrow)  return 'down';
  if (key.return)     return 'enter';
  if (key.escape)     return 'escape'; // handled specially – means cancel
  if (input === ' ')  return 'space';
  if (input && input.length === 1) return input;
  return null;
}

/** Returns true if an ink useInput event matches a stored hotkey string. */
export function matchHotkey(
  hk: string,
  input: string,
  key: { leftArrow?: boolean; rightArrow?: boolean; upArrow?: boolean; downArrow?: boolean; return?: boolean; escape?: boolean },
): boolean {
  switch (hk) {
    case 'space':  return input === ' ';
    case 'left':   return !!key.leftArrow;
    case 'right':  return !!key.rightArrow;
    case 'up':     return !!key.upArrow;
    case 'down':   return !!key.downArrow;
    case 'enter':  return !!key.return;
    case 'escape': return !!key.escape;
    default:       return input === hk;
  }
}

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

function configPath(): string {
  return path.join(getDataDir(), 'config.json');
}

let configCache: Config | null = null;

export function loadConfig(): Config {
  if (configCache) return configCache;

  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<Config>;

    configCache = {
      ...CONFIG_DEFAULTS,
      ...parsed,
      // Deep-merge hotkeys so adding new actions doesn't wipe existing ones
      hotkeys: { ...DEFAULT_HOTKEYS, ...(parsed.hotkeys ?? {}) },
    };
  } catch {
    configCache = { ...CONFIG_DEFAULTS };
  }

  return configCache;
}

export function saveConfig(config: Config): void {
  configCache = { ...config };
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export function updateConfig<K extends keyof Config>(key: K, value: Config[K]): Config {
  const next = { ...loadConfig(), [key]: value };
  saveConfig(next);
  return next;
}

export function updateHotkey(action: HotkeyAction, hotkey: string): Config {
  const current = loadConfig();
  const next = { ...current, hotkeys: { ...current.hotkeys, [action]: hotkey } };
  saveConfig(next);
  return next;
}

// ---------------------------------------------------------------------------
// Resolved download directory (expands empty → default)
// ---------------------------------------------------------------------------

export function resolvedDownloadDir(): string {
  const cfg = loadConfig();
  if (cfg.downloadDir.trim()) {
    const expanded = cfg.downloadDir.replace(/^~/, process.env.HOME ?? '~');
    fs.mkdirSync(expanded, { recursive: true });
    return expanded;
  }
  const def = path.join(getDataDir(), 'music');
  fs.mkdirSync(def, { recursive: true });
  return def;
}
