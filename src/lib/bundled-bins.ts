/**
 * bundled-bins.ts
 *
 * Handles extracting binaries that are embedded into the compiled ytui
 * executable at build time via Bun's asset embedding.
 *
 * At build time: Bun embeds `src/assets/mpv.app.tar.gz` because it is
 * referenced with `new URL(...)` relative to `import.meta.url`.
 *
 * At runtime: the tarball is extracted once to `~/.cache/ytui/mpv-<version>/`
 * and the path to the mpv binary is returned.
 */

import path from 'node:path';
import os from 'node:os';

// Increment this when the bundled mpv changes to force cache invalidation.
const BUNDLE_VERSION = '1';

// Bun embeds files referenced via new URL(..., import.meta.url) at compile time.
const MPV_TARBALL_URL = new URL('../assets/mpv.app.tar.gz', import.meta.url);

const CACHE_DIR = path.join(os.homedir(), '.cache', 'ytui', `mpv-${BUNDLE_VERSION}`);
const MPV_BIN   = path.join(CACHE_DIR, 'mpv.app', 'Contents', 'MacOS', 'mpv');

let _resolved: string | null = null;

/**
 * Returns the path to the bundled mpv binary, extracting it from the embedded
 * tarball on first call. Subsequent calls return the cached path immediately.
 */
export async function bundledMpvBin(): Promise<string | null> {
  if (_resolved !== null) return _resolved;

  try {
    // Already extracted on a previous run?
    if (await Bun.file(MPV_BIN).exists()) {
      _resolved = MPV_BIN;
      return _resolved;
    }

    const tar = Bun.file(MPV_TARBALL_URL);
    if (!(await tar.exists())) return null;

    // Create cache dir
    await Bun.spawn(['mkdir', '-p', CACHE_DIR]).exited;

    // Write tarball to a temp path then extract
    const tempTar = path.join(CACHE_DIR, 'mpv.app.tar.gz');
    await Bun.write(tempTar, tar);

    const extract = Bun.spawn(['tar', 'xzf', tempTar, '-C', CACHE_DIR], {
      stdout: 'ignore',
      stderr: 'pipe',
    });
    await extract.exited;

    if (extract.exitCode !== 0) {
      const err = await new Response(extract.stderr).text();
      throw new Error(`tar extraction failed: ${err}`);
    }

    // Clean up temp tar
    await Bun.spawn(['rm', '-f', tempTar]).exited;

    // Ensure the binary is executable
    await Bun.spawn(['chmod', '+x', MPV_BIN]).exited;

    _resolved = MPV_BIN;
    return _resolved;
  } catch (e) {
    console.warn('[bundled-bins] failed to extract mpv:', e);
    return null;
  }
}
