import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDataDir } from '../db/index';

// ---------------------------------------------------------------------------
// ffmpeg + ffplay binary resolution + auto-download
//
// Resolution order for each binary:
//   1. Environment variable (FFMPEG_BIN / FFPLAY_BIN)
//   2. PATH (via `which` on Unix, `where` on Windows)
//   3. Common install locations (Homebrew on macOS, /usr/bin on Linux)
//   4. Next to the other resolved binary (ffplay lives beside ffmpeg)
//   5. Local cache in ~/.ytui/
//
// Auto-download sources:
//   ffmpeg  — eugeneware/ffmpeg-static (GitHub) — macOS arm64/x64, Linux arm64/x64
//             Windows: ffmpeg-static provides win32-x64
//   ffplay  — macOS: evermeet.cx zip
//             Linux: same static build as ffmpeg (bundled)
//             Windows: gyan.dev essentials zip (includes ffplay.exe)
// ---------------------------------------------------------------------------

const IS_WIN = process.platform === 'win32';
const EXE = IS_WIN ? '.exe' : '';

let _ffmpegBin: string | null | undefined;
let _ffplayBin: string | null | undefined;

function isExecutable(p: string): boolean {
  try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; }
}

/** Find a binary on PATH using `which` (Unix) or `where` (Windows). */
function findOnPath(name: string): string | null {
  const cmd = IS_WIN ? 'where' : 'which';
  try {
    const r = spawnSync(cmd, [name], { encoding: 'utf8' });
    const cand = (r.stdout ?? '').split('\n')[0]?.trim() ?? '';
    if (r.status === 0 && cand && isExecutable(cand)) return cand;
  } catch { /* ignore */ }
  return null;
}

// ---------------------------------------------------------------------------
// ffmpeg
// ---------------------------------------------------------------------------

function localFfmpegPath(): string {
  return path.join(getDataDir(), `ffmpeg${EXE}`);
}

export function resolveFfmpeg(): string | null {
  if (_ffmpegBin !== undefined) return _ffmpegBin;

  const env = (process.env.FFMPEG_BIN ?? '').trim();
  if (env && isExecutable(env)) { _ffmpegBin = env; return _ffmpegBin; }

  const onPath = findOnPath(`ffmpeg${EXE}`);
  if (onPath) { _ffmpegBin = onPath; return _ffmpegBin; }

  // Common locations by platform
  const candidates: string[] = IS_WIN
    ? [
        'C:\\ffmpeg\\bin\\ffmpeg.exe',
        path.join(process.env.LOCALAPPDATA ?? '', 'ffmpeg', 'bin', 'ffmpeg.exe'),
      ]
    : process.platform === 'darwin'
      ? ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg']
      : ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/snap/bin/ffmpeg'];

  for (const c of candidates) {
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

  const platform = process.platform; // 'darwin' | 'linux' | 'win32'
  const arch = process.arch;         // 'arm64' | 'x64'

  // eugeneware/ffmpeg-static asset names follow the pattern:
  //   ffmpeg-<platform>-<arch>   e.g. ffmpeg-darwin-arm64, ffmpeg-linux-x64
  // Windows: ffmpeg-win32-x64 (no arm64 build available)
  let wantName: string;
  if (platform === 'win32') {
    wantName = 'ffmpeg-win32-x64';
  } else {
    const plat = platform === 'darwin' ? 'darwin' : 'linux';
    const ar = arch === 'arm64' ? 'arm64' : 'x64';
    wantName = `ffmpeg-${plat}-${ar}`;
  }

  const apiUrl = 'https://api.github.com/repos/eugeneware/ffmpeg-static/releases/latest';
  const res = await fetch(apiUrl, { headers: { 'User-Agent': 'ytui/0.1' } });
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const release = (await res.json()) as {
    assets: { name: string; browser_download_url: string }[];
  };

  const asset = release.assets.find((a) => a.name === wantName)
    ?? release.assets.find((a) => a.name.startsWith(`ffmpeg-${platform === 'win32' ? 'win32' : process.platform}`));
  if (!asset) throw new Error(`Could not find a ${platform} ffmpeg binary in the release assets`);

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
  return path.join(getDataDir(), `ffplay${EXE}`);
}

export function resolveFfplay(): string | null {
  if (_ffplayBin !== undefined) return _ffplayBin;

  const env = (process.env.FFPLAY_BIN ?? '').trim();
  if (env && isExecutable(env)) { _ffplayBin = env; return _ffplayBin; }

  const onPath = findOnPath(`ffplay${EXE}`);
  if (onPath) { _ffplayBin = onPath; return _ffplayBin; }

  const candidates: string[] = IS_WIN
    ? [
        'C:\\ffmpeg\\bin\\ffplay.exe',
        path.join(process.env.LOCALAPPDATA ?? '', 'ffmpeg', 'bin', 'ffplay.exe'),
      ]
    : process.platform === 'darwin'
      ? ['/opt/homebrew/bin/ffplay', '/usr/local/bin/ffplay']
      : ['/usr/bin/ffplay', '/usr/local/bin/ffplay'];

  for (const c of candidates) {
    if (isExecutable(c)) { _ffplayBin = c; return _ffplayBin; }
  }

  // ffplay often lives next to ffmpeg
  const ffmpegBin = resolveFfmpeg();
  if (ffmpegBin) {
    const sibling = path.join(path.dirname(ffmpegBin), `ffplay${EXE}`);
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

  const platform = process.platform;

  if (platform === 'darwin') {
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
    const zipPath = dest + '.zip';
    fs.writeFileSync(zipPath, Buffer.from(await zipRes.arrayBuffer()));

    const unzip = spawnSync('unzip', ['-o', '-j', zipPath, 'ffplay', '-d', dataDir], {
      encoding: 'utf8',
    });
    fs.unlinkSync(zipPath);
    if (unzip.status !== 0) throw new Error(`unzip failed: ${unzip.stderr}`);
    fs.chmodSync(dest, 0o755);
  } else if (platform === 'linux') {
    // On Linux, ffplay is bundled with ffmpeg — ensure ffmpeg first, then look for sibling
    onProgress?.('ffplay not found — ensuring ffmpeg (ffplay is bundled)…');
    const ffmpegBin = await ensureFfmpeg(onProgress);
    const sibling = path.join(path.dirname(ffmpegBin), 'ffplay');
    if (!isExecutable(sibling)) {
      // Some static ffmpeg builds don't bundle ffplay; try apt/package manager name
      throw new Error(
        'ffplay not found. On Linux, install it with: sudo apt install ffmpeg  (or your distro equivalent)',
      );
    }
  } else if (platform === 'win32') {
    // Download gyan.dev essentials zip which contains ffplay.exe
    onProgress?.('ffplay not found — downloading ffmpeg essentials (includes ffplay) from gyan.dev…');

    const releaseUrl = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';
    const zipRes = await fetch(releaseUrl, { headers: { 'User-Agent': 'ytui/0.1' }, redirect: 'follow' });
    if (!zipRes.ok) throw new Error(`ffplay (gyan.dev) download failed: ${zipRes.status}`);

    const dataDir = getDataDir();
    const zipPath = path.join(dataDir, 'ffmpeg-essentials.zip');
    fs.writeFileSync(zipPath, Buffer.from(await zipRes.arrayBuffer()));

    // unzip using PowerShell (always available on Windows 10+)
    const ps = spawnSync('powershell', [
      '-NoProfile', '-Command',
      `Expand-Archive -Force -Path "${zipPath}" -DestinationPath "${dataDir}"`,
    ], { encoding: 'utf8' });
    fs.unlinkSync(zipPath);
    if (ps.status !== 0) throw new Error(`PowerShell Expand-Archive failed: ${ps.stderr}`);

    // The zip contains a single top-level folder like ffmpeg-X.Y.Z-essentials_build\bin\
    const extracted = fs.readdirSync(dataDir).find((d) => d.startsWith('ffmpeg-') && d.includes('essentials'));
    if (!extracted) throw new Error('Could not find extracted ffmpeg folder');
    const binDir = path.join(dataDir, extracted, 'bin');
    for (const exe of ['ffmpeg.exe', 'ffplay.exe']) {
      const src = path.join(binDir, exe);
      const dst = path.join(dataDir, exe);
      if (fs.existsSync(src)) fs.copyFileSync(src, dst);
    }
    // Clean up extracted folder
    fs.rmSync(path.join(dataDir, extracted), { recursive: true, force: true });
  } else {
    throw new Error(`Unsupported platform: ${platform}. Install ffplay manually.`);
  }

  _ffplayBin = undefined;
  const bin = resolveFfplay();
  if (!bin) throw new Error('ffplay downloaded but still not executable');
  onProgress?.('ffplay ready.');
  return bin;
}

