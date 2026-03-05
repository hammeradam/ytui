/**
 * binary.ts — shared helpers for locating and auto-downloading tool binaries.
 */

import fs from 'node:fs';
import path from 'node:path';

export const IS_WIN = process.platform === 'win32';
export const EXE    = IS_WIN ? '.exe' : '';

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

export function isExecutable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Find a binary on PATH using `which` (Unix) or `where` (Windows). */
export function findOnPath(name: string): string | null {
  try {
    const r = Bun.spawnSync(IS_WIN ? ['where', name] : ['which', name]);
    const found = new TextDecoder().decode(r.stdout).split('\n')[0]?.trim() ?? '';
    if (r.exitCode === 0 && found && isExecutable(found)) return found;
  } catch { /* ignore */ }
  return null;
}

// ---------------------------------------------------------------------------
// GitHub release download helpers
// ---------------------------------------------------------------------------

type GithubAsset = { name: string; browser_download_url: string };
type GithubRelease = { assets: GithubAsset[] };

/** Fetch the latest release metadata for a GitHub repo. */
export async function fetchLatestRelease(repo: string): Promise<GithubRelease> {
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { 'User-Agent': 'ytui' },
  });
  if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${repo}`);
  return res.json() as Promise<GithubRelease>;
}

/**
 * Download a single release asset to `destPath` and mark it executable.
 * Writes atomically via a `.tmp` file to avoid leaving a partial binary.
 */
export async function downloadAsset(
  asset: GithubAsset,
  destPath: string,
  onProgress?: (msg: string) => void,
): Promise<void> {
  onProgress?.(`Downloading ${asset.name}…`);
  const res = await fetch(asset.browser_download_url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  const tmp = `${destPath}.tmp`;
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  await Bun.write(tmp, await res.arrayBuffer());
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, destPath);
}
