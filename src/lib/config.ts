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

export type Config = {
  /** Default volume when mpv starts (0–100). */
  defaultVolume: number;
  /** Preferred audio container format for downloads. */
  audioFormat: AudioFormat;
  /** Maximum audio bitrate passed to yt-dlp. */
  audioQuality: AudioQuality;
  /** Max number of YouTube search results to display. */
  searchResultsLimit: number;
  /** Unix socket path for mpv IPC. */
  mpvSocketPath: string;
  /** Directory where audio files are saved. Empty = default (~/.ytui/music). */
  downloadDir: string;
};

export const CONFIG_DEFAULTS: Config = {
  defaultVolume:       80,
  audioFormat:         'm4a',
  audioQuality:        'best',
  searchResultsLimit:  10,
  mpvSocketPath:       '/tmp/mpv.sock',
  downloadDir:         '',
};

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

function configPath(): string {
  return path.join(getDataDir(), 'config.json');
}

let _cache: Config | null = null;

export function loadConfig(): Config {
  if (_cache) return _cache;
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    _cache = { ...CONFIG_DEFAULTS, ...JSON.parse(raw) } as Config;
  } catch {
    _cache = { ...CONFIG_DEFAULTS };
  }
  return _cache;
}

export function saveConfig(config: Config): void {
  _cache = { ...config };
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2) + '\n', 'utf8');
}

export function updateConfig<K extends keyof Config>(key: K, value: Config[K]): Config {
  const next = { ...loadConfig(), [key]: value };
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
