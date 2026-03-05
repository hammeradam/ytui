import fs from 'node:fs';
import path from 'node:path';

import { getCacheDir } from '../db/index';
import { loadConfig, resolvedDownloadDir } from './config';
import {
  IS_WIN, EXE,
  isExecutable, findOnPath,
  fetchLatestRelease, downloadAsset,
} from './binary';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SearchResult = {
  id: string;
  title: string;
  channel: string;
  duration: number; // seconds
  thumbnailUrl: string;
  url: string;
};

export type DownloadProgress = {
  percent: number;    // 0-100
  speed: string;      // e.g. "1.23MiB/s"
  eta: string;        // e.g. "00:12"
};

export type DownloadResult = {
  filePath: string;
  fileExt: string;
  fileSize: number;
};

// ---------------------------------------------------------------------------
// Binary resolution + auto-download
// ---------------------------------------------------------------------------

let _ytdlpBin: string | null | undefined;

function localBinPath(): string {
  return path.join(getCacheDir(), `yt-dlp${EXE}`);
}

export function resolveYtDlp(): string | null {
  if (_ytdlpBin !== undefined) return _ytdlpBin;

  const env = (process.env.YTDLP_BIN ?? '').trim();
  if (env && isExecutable(env)) { _ytdlpBin = env; return _ytdlpBin; }

  // Check PATH
  const onPath = findOnPath(`yt-dlp${EXE}`);
  if (onPath) { _ytdlpBin = onPath; return _ytdlpBin; }

  // Common install locations by platform
  const candidates: string[] = IS_WIN
    ? [
        path.join(process.env.LOCALAPPDATA ?? '', 'Programs', 'yt-dlp', 'yt-dlp.exe'),
        'C:\\yt-dlp\\yt-dlp.exe',
      ]
    : process.platform === 'darwin'
      ? ['/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp']
      : ['/usr/bin/yt-dlp', '/usr/local/bin/yt-dlp'];

  for (const c of candidates) {
    if (isExecutable(c)) { _ytdlpBin = c; return _ytdlpBin; }
  }

  // Locally downloaded
  const local = localBinPath();
  if (isExecutable(local)) { _ytdlpBin = local; return _ytdlpBin; }

  _ytdlpBin = null;
  return null;
}

export async function ensureYtDlp(
  onProgress?: (msg: string) => void,
): Promise<string> {
  const existing = resolveYtDlp();
  if (existing) return existing;

  onProgress?.('yt-dlp not found — fetching latest release from GitHub…');

  const release = await fetchLatestRelease('yt-dlp/yt-dlp');

  // Pick the right binary per platform/arch
  const platform = process.platform;
  const arch = process.arch;

  let wantName: string;
  if (platform === 'win32') {
    wantName = 'yt-dlp.exe';
  } else if (platform === 'darwin') {
    wantName = arch === 'arm64' ? 'yt-dlp_macos' : 'yt-dlp_macos_legacy';
  } else {
    wantName = arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
  }

  const asset = release.assets.find((a) => a.name === wantName)
    ?? release.assets.find((a) => a.name === 'yt-dlp_macos')
    ?? release.assets.find((a) => a.name === 'yt-dlp');

  if (!asset) throw new Error(`Could not find a ${platform} yt-dlp binary in the release assets`);

  await downloadAsset(asset, localBinPath(), onProgress);

  // Reset cache so next call picks it up.
  _ytdlpBin = undefined;
  const bin = resolveYtDlp();
  if (!bin) throw new Error('yt-dlp downloaded but still not executable');
  onProgress?.('yt-dlp ready.');
  return bin;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchYouTube(
  query: string,
  maxResults = 20,
): Promise<SearchResult[]> {
  const bin = resolveYtDlp();
  if (!bin) throw new Error('yt-dlp not available');

  const proc = Bun.spawn(
    [
      bin,
      `ytsearch${maxResults}:${query}`,
      '--dump-json',
      '--no-download',
      '--no-playlist',
      '--flat-playlist',
      // Avoid JS-runtime dependency (throttling decryption) by using the
      // YouTube iOS / mobile web client which does not require it.
      '--extractor-args', 'youtube:player_client=ios,mweb',
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  const decoder = new TextDecoder();
  const reader = proc.stdout.getReader();
  let raw = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }

  const exitCode = await proc.exited;
  if (exitCode !== 0 && !raw.trim()) {
    const errText = decoder.decode(await new Response(proc.stderr).arrayBuffer());
    throw new Error(`yt-dlp search failed: ${errText.slice(0, 300)}`);
  }

  const results: SearchResult[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      results.push({
        id: String(obj.id ?? ''),
        title: String(obj.title ?? obj.fulltitle ?? ''),
        channel: String(obj.uploader ?? obj.channel ?? ''),
        duration: Number(obj.duration ?? 0),
        thumbnailUrl: String(obj.thumbnail ?? ''),
        url: String(obj.webpage_url ?? obj.url ?? `https://www.youtube.com/watch?v=${obj.id}`),
      });
    } catch {
      // skip malformed line
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

export async function downloadAudio(
  videoIdOrUrl: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<DownloadResult> {
  const bin = resolveYtDlp();
  if (!bin) throw new Error('yt-dlp not available');

  const cfg = loadConfig();
  const musicDir = resolvedDownloadDir();
  fs.mkdirSync(musicDir, { recursive: true });

  const url = videoIdOrUrl.startsWith('http')
    ? videoIdOrUrl
    : `https://www.youtube.com/watch?v=${videoIdOrUrl}`;

  const outputTemplate = path.join(musicDir, '%(id)s.%(ext)s');

  // Build format selector from config
  let formatSelector: string;
  if (cfg.audioFormat === 'm4a') {
    formatSelector = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio';
  } else if (cfg.audioFormat === 'opus') {
    formatSelector = 'bestaudio[ext=opus]/bestaudio[ext=webm]/bestaudio';
  } else {
    formatSelector = 'bestaudio';
  }

  const args = [
    bin,
    '-f', formatSelector,
    '--no-playlist',
    '-o', outputTemplate,
    '--print', 'after_move:filepath',
    // Avoid JS-runtime dependency (throttling decryption) by using the
    // YouTube iOS / mobile web client which does not require it.
    '--extractor-args', 'youtube:player_client=ios,mweb',
  ];

  if (cfg.audioQuality !== 'best') {
    args.push('--audio-quality', cfg.audioQuality);
  }

  args.push(url);

  // Use Bun.spawn for streaming progress output
  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });

  let finalPath = '';
  const decoder = new TextDecoder();

  // Read stdout for final filepath (--print after_move:filepath) and progress
  const reader = proc.stdout.getReader();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      // Progress lines look like: "[download]  42.3% of   3.45MiB at   1.23MiB/s ETA 00:01"
      const prog = t.match(/\[download\]\s+([\d.]+)%.*?at\s+(\S+)\s+ETA\s+(\S+)/);
      if (prog) {
        onProgress?.({ percent: parseFloat(prog[1]!), speed: prog[2]!, eta: prog[3]! });
        continue;
      }
      // --print after_move:filepath outputs the final path
      if (t.startsWith('/') || t.startsWith('~') || /^[A-Za-z]:[/\\]/.test(t)) {
        finalPath = t;
      }
    }
  }
  if (buf.trim()) finalPath = finalPath || buf.trim();

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const errText = decoder.decode(await new Response(proc.stderr).arrayBuffer());
    throw new Error(`yt-dlp exited with ${exitCode}: ${errText.slice(0, 300)}`);
  }

  // If --print didn't give us the path, glob for it
  if (!finalPath || !fs.existsSync(finalPath)) {
    const id = videoIdOrUrl.replace(/^.*[?&]v=/, '').replace(/[^a-zA-Z0-9_-]/g, '');
    const found = fs.readdirSync(musicDir).find((f) => f.startsWith(id));
    if (found) finalPath = path.join(musicDir, found);
  }

  if (!finalPath || !fs.existsSync(finalPath)) {
    throw new Error('Download completed but output file not found');
  }

  const stat = fs.statSync(finalPath);
  const fileExt = path.extname(finalPath).replace('.', '') || 'webm';

  return { filePath: finalPath, fileExt, fileSize: stat.size };
}

// ---------------------------------------------------------------------------
// Fetch metadata for a single video (for URL/ID paste flow)
// ---------------------------------------------------------------------------

export async function fetchVideoInfo(videoIdOrUrl: string): Promise<SearchResult> {
  const bin = resolveYtDlp();
  if (!bin) throw new Error('yt-dlp not available');

  const url = videoIdOrUrl.startsWith('http')
    ? videoIdOrUrl
    : `https://www.youtube.com/watch?v=${videoIdOrUrl}`;

  const proc = Bun.spawn(
    [bin, '--dump-json', '--no-download', '--extractor-args', 'youtube:player_client=ios,mweb', url],
    { stdout: 'pipe', stderr: 'pipe' },
  );

  const decoder = new TextDecoder();
  const reader = proc.stdout.getReader();
  let raw = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const errText = decoder.decode(await new Response(proc.stderr).arrayBuffer());
    throw new Error(`yt-dlp error: ${errText.slice(0, 300)}`);
  }

  const obj = JSON.parse(raw.trim() || '{}') as Record<string, unknown>;
  return {
    id: String(obj.id ?? ''),
    title: String(obj.title ?? ''),
    channel: String(obj.uploader ?? obj.channel ?? ''),
    duration: Number(obj.duration ?? 0),
    thumbnailUrl: String(obj.thumbnail ?? ''),
    url: String(obj.webpage_url ?? url),
  };
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
