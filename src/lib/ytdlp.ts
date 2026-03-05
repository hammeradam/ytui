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
// Search — YouTube Data API v3 (fast path, requires API key)
// ---------------------------------------------------------------------------

/** Parse an ISO 8601 duration string (e.g. "PT3M45S") into seconds. */
function parseIsoDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (Number(m[1] ?? 0) * 3600) + (Number(m[2] ?? 0) * 60) + Number(m[3] ?? 0);
}

async function searchYouTubeApi(
  query: string,
  maxResults: number,
  apiKey: string,
): Promise<SearchResult[]> {
  // Step 1: search.list — get video IDs, titles, channel names, thumbnails
  const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
  searchUrl.searchParams.set('part', 'snippet');
  searchUrl.searchParams.set('type', 'video');
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('maxResults', String(maxResults));
  searchUrl.searchParams.set('key', apiKey);

  const searchRes = await fetch(searchUrl.toString());
  if (!searchRes.ok) {
    const body = await searchRes.text();
    throw new Error(`YouTube API search failed (${searchRes.status}): ${body.slice(0, 300)}`);
  }

  const searchData = await searchRes.json() as {
    items?: Array<{
      id: { videoId: string };
      snippet: {
        title: string;
        channelTitle: string;
        thumbnails?: { default?: { url: string } };
      };
    }>;
  };

  const items = searchData.items ?? [];
  if (items.length === 0) return [];

  const ids = items.map((it) => it.id.videoId);

  // Step 2: videos.list — get durations for all IDs in one request
  const videosUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
  videosUrl.searchParams.set('part', 'contentDetails');
  videosUrl.searchParams.set('id', ids.join(','));
  videosUrl.searchParams.set('key', apiKey);

  const videosRes = await fetch(videosUrl.toString());
  const durationMap = new Map<string, number>();
  if (videosRes.ok) {
    const videosData = await videosRes.json() as {
      items?: Array<{ id: string; contentDetails: { duration: string } }>;
    };
    for (const v of videosData.items ?? []) {
      durationMap.set(v.id, parseIsoDuration(v.contentDetails.duration));
    }
  }

  return items.map((it) => ({
    id: it.id.videoId,
    title: it.snippet.title,
    channel: it.snippet.channelTitle,
    duration: durationMap.get(it.id.videoId) ?? 0,
    thumbnailUrl: it.snippet.thumbnails?.default?.url ?? '',
    url: `https://www.youtube.com/watch?v=${it.id.videoId}`,
  }));
}

// ---------------------------------------------------------------------------
// Search — public entry point (API key → fast path, else yt-dlp fallback)
// ---------------------------------------------------------------------------

export async function searchYouTube(
  query: string,
  maxResults = 20,
  apiKey = '',
): Promise<SearchResult[]> {
  if (apiKey.trim()) {
    return searchYouTubeApi(query, maxResults, apiKey.trim());
  }
  return searchYouTubeFallback(query, maxResults);
}

async function searchYouTubeFallback(
  query: string,
  maxResults: number,
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
    // Use the mediaconnect client — works without a JS runtime or PO token.
    // ios/mweb now require a GVS PO Token (YouTube change, 2025) and fail with 403.
    '--extractor-args', 'youtube:player_client=mediaconnect',
  ];

  if (cfg.audioQuality !== 'best') {
    args.push('--audio-quality', cfg.audioQuality);
  }

  args.push(url);

  // Use Bun.spawn for streaming progress output
  const proc = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });

  let finalPath = '';
  const decoder = new TextDecoder();

  // yt-dlp writes [download] progress lines to stderr; --print filepath goes to stdout.
  // Read both streams concurrently so progress fires while the download runs.

  async function readStdout(): Promise<void> {
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
        // --print after_move:filepath outputs the final path on stdout
        if (t.startsWith('/') || t.startsWith('~') || /^[A-Za-z]:[/\\]/.test(t)) {
          finalPath = t;
        }
      }
    }
    if (buf.trim() && !finalPath) finalPath = buf.trim();
  }

  let stderrText = '';
  async function readStderr(): Promise<void> {
    const reader = proc.stderr.getReader();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      stderrText += chunk;
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const t = line.trim();
        if (!t) continue;
        // Progress lines: "[download]  42.3% of  3.45MiB at  1.23MiB/s ETA 00:01"
        // Speed can be "Unknown B/s" (two tokens) so match everything up to " ETA "
        const prog = t.match(/\[download\]\s+([\d.]+)%\s+of\s+\S+\s+at\s+(.+?)\s+ETA\s+(\S+)/);
        if (prog) {
          onProgress?.({ percent: parseFloat(prog[1]!), speed: prog[2]!, eta: prog[3]! });
        }
      }
    }
  }

  await Promise.all([readStdout(), readStderr()]);

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`yt-dlp exited with ${exitCode}: ${stderrText.slice(0, 300)}`);
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
    [bin, '--dump-json', '--no-download', '--extractor-args', 'youtube:player_client=mediaconnect', url],
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
