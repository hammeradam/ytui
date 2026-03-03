import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDataDir } from '../db/index';

// ---------------------------------------------------------------------------
// ffmpeg + ffplay binary resolution + auto-download
//
// Resolution order for each binary:
//   1. Environment variable (FFMPEG_BIN / FFPLAY_BIN)
//   2. PATH (via `which`)
//   3. Common Homebrew locations
//   4. Next to the other resolved binary (ffplay lives beside ffmpeg)
//   5. Local cache in ~/.ytui/
//
// Auto-download sources:
//   ffmpeg  — eugeneware/ffmpeg-static (GitHub) — arm64 + x64 static binaries
//   ffplay  — evermeet.cx zip — Intel static, works on arm64 via Rosetta
// ---------------------------------------------------------------------------

let _ffmpegBin: string | null | undefined;
let _ffplayBin: string | null | undefined;

function isExecutable(p: string): boolean {
  try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------
// ffmpeg
// ---------------------------------------------------------------------------

function localFfmpegPath(): string {
  return path.join(getDataDir(), 'ffmpeg');
}

export function resolveFfmpeg(): string | null {
  if (_ffmpegBin !== undefined) return _ffmpegBin;

  const env = (process.env.FFMPEG_BIN ?? '').trim();
  if (env && isExecutable(env)) { _ffmpegBin = env; return _ffmpegBin; }

  try {
    const r = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' });
    const cand = (r.stdout ?? '').trim();
    if (r.status === 0 && cand && isExecutable(cand)) { _ffmpegBin = cand; return _ffmpegBin; }
  } catch { /* ignore */ }

  for (const c of ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']) {
    if (isExecutable(c)) { _ffmpegBin = c; return _ffmpegBin; }
  }

  const local = localFfmpegPath();
  if (isExecutable(local)) { _ffmpegBin = local; return _ffmpegBin; }

  _ffmpegBin = null;
  return null;
}

export async function ensureFfmpeg(
  onProgress?: (msg: string) => void,
): Promise<string> {
  const existing = resolveFfmpeg();
  if (existing) return existing;

  onProgress?.('ffmpeg not found — fetching static binary from GitHub…');

  const apiUrl = 'https://api.github.com/repos/eugeneware/ffmpeg-static/releases/latest';
  const res = await fetch(apiUrl, { headers: { 'User-Agent': 'ytui/0.1' } });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const release = (await res.json()) as {
    assets: { name: string; browser_download_url: string }[];
  };

  const wantName = process.arch === 'arm64' ? 'ffmpeg-darwin-arm64' : 'ffmpeg-darwin-x64';
  const asset = release.assets.find((a) => a.name === wantName)
    ?? release.assets.find((a) => a.name.startsWith('ffmpeg-darwin'));
  if (!asset) throw new Error('Could not find a macOS ffmpeg binary in the release assets');

  onProgress?.(`Downloading ${asset.name}…`);
  const binRes = await fetch(asset.browser_download_url);
  if (!binRes.ok) throw new Error(`Download failed: ${binRes.status}`);

  const dest = localFfmpegPath();
  fs.writeFileSync(dest, Buffer.from(await binRes.arrayBuffer()), { mode: 0o755 });

  _ffmpegBin = undefined;
  const bin = resolveFfmpeg();
  if (!bin) throw new Error('ffmpeg downloaded but still not executable');
  onProgress?.('ffmpeg ready.');
  return bin;
}

// ---------------------------------------------------------------------------
// ffplay
// ---------------------------------------------------------------------------

function localFfplayPath(): string {
  return path.join(getDataDir(), 'ffplay');
}

export function resolveFfplay(): string | null {
  if (_ffplayBin !== undefined) return _ffplayBin;

  const env = (process.env.FFPLAY_BIN ?? '').trim();
  if (env && isExecutable(env)) { _ffplayBin = env; return _ffplayBin; }

  try {
    const r = spawnSync('which', ['ffplay'], { encoding: 'utf8' });
    const cand = (r.stdout ?? '').trim();
    if (r.status === 0 && cand && isExecutable(cand)) { _ffplayBin = cand; return _ffplayBin; }
  } catch { /* ignore */ }

  for (const c of ['/opt/homebrew/bin/ffplay', '/usr/local/bin/ffplay']) {
    if (isExecutable(c)) { _ffplayBin = c; return _ffplayBin; }
  }

  // ffplay often lives next to ffmpeg
  const ffmpegBin = resolveFfmpeg();
  if (ffmpegBin) {
    const sibling = path.join(path.dirname(ffmpegBin), 'ffplay');
    if (isExecutable(sibling)) { _ffplayBin = sibling; return _ffplayBin; }
  }

  const local = localFfplayPath();
  if (isExecutable(local)) { _ffplayBin = local; return _ffplayBin; }

  _ffplayBin = null;
  return null;
}

export async function ensureFfplay(
  onProgress?: (msg: string) => void,
): Promise<string> {
  const existing = resolveFfplay();
  if (existing) return existing;

  // evermeet.cx provides static macOS binaries (Intel; runs via Rosetta on arm64)
  onProgress?.('ffplay not found — fetching static binary from evermeet.cx…');

  const zipUrl = 'https://evermeet.cx/ffmpeg/getrelease/ffplay/zip';
  const zipRes = await fetch(zipUrl, {
    headers: { 'User-Agent': 'ytui/0.1' },
    redirect: 'follow',
  });
  if (!zipRes.ok) throw new Error(`ffplay download failed: ${zipRes.status}`);

  const dest = localFfplayPath();
  const dataDir = getDataDir();

  // Write zip to a temp file then unzip
  const zipPath = dest + '.zip';
  fs.writeFileSync(zipPath, Buffer.from(await zipRes.arrayBuffer()));

  const unzip = spawnSync('unzip', ['-o', '-j', zipPath, 'ffplay', '-d', dataDir], {
    encoding: 'utf8',
  });
  fs.unlinkSync(zipPath);

  if (unzip.status !== 0) throw new Error(`unzip failed: ${unzip.stderr}`);
  fs.chmodSync(dest, 0o755);

  _ffplayBin = undefined;
  const bin = resolveFfplay();
  if (!bin) throw new Error('ffplay downloaded but still not executable');
  onProgress?.('ffplay ready.');
  return bin;
}
