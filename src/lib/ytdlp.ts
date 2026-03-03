import fs from 'node:fs';
import path from 'node:path';

import { spawnSync } from 'node:child_process';
import { getDataDir } from '../db/index';

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

function isExecutable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function localBinPath(): string {
  return path.join(getDataDir(), 'yt-dlp');
}

export function resolveYtDlp(): string | null {
  if (_ytdlpBin !== undefined) return _ytdlpBin;

  const env = (process.env.YTDLP_BIN ?? '').trim();
  if (env && isExecutable(env)) { _ytdlpBin = env; return _ytdlpBin; }

  // Check PATH
  try {
    const r = spawnSync('which', ['yt-dlp'], { encoding: 'utf8' });
    const cand = (r.stdout ?? '').trim();
    if (r.status === 0 && cand && isExecutable(cand)) { _ytdlpBin = cand; return _ytdlpBin; }
  } catch { /* ignore */ }

  // Common brew location
  for (const c of ['/opt/homebrew/bin/yt-dlp', '/usr/local/bin/yt-dlp']) {
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

  const apiUrl = 'https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest';
  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': 'ytui/0.1' },
  });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const release = (await res.json()) as {
    assets: { name: string; browser_download_url: string }[];
  };

  // Pick the right binary for macOS (arm64 → darwin_aarch64, x64 → yt-dlp_macos)
  const arch = process.arch; // 'arm64' or 'x64'
  const wantName = arch === 'arm64' ? 'yt-dlp_macos' : 'yt-dlp_macos_legacy';
  const asset = release.assets.find((a) => a.name === wantName)
    ?? release.assets.find((a) => a.name === 'yt-dlp_macos')
    ?? release.assets.find((a) => a.name === 'yt-dlp');

  if (!asset) throw new Error('Could not find a macOS yt-dlp binary in the release assets');

  onProgress?.(`Downloading ${asset.name}…`);
  const binRes = await fetch(asset.browser_download_url);
  if (!binRes.ok) throw new Error(`Download failed: ${binRes.status}`);

  const dest = localBinPath();
  const buf = await binRes.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buf), { mode: 0o755 });

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

  const musicDir = path.join(getDataDir(), 'music');
  fs.mkdirSync(musicDir, { recursive: true });

  const url = videoIdOrUrl.startsWith('http')
    ? videoIdOrUrl
    : `https://www.youtube.com/watch?v=${videoIdOrUrl}`;

  const outputTemplate = path.join(musicDir, '%(id)s.%(ext)s');

  // Use Bun.spawn for streaming progress output
  const proc = Bun.spawn(
    [
      bin,
      '-f', 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
      '--no-playlist',
      '-o', outputTemplate,
      '--print', 'after_move:filepath',
      url,
    ],
    { stdout: 'pipe', stderr: 'pipe' },
  );

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
      if (t.startsWith('/') || t.startsWith('~')) {
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
    [bin, '--dump-json', '--no-download', url],
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
