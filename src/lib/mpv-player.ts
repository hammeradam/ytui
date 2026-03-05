/**
 * mpv-player.ts — mpv process, IPC socket, and playback API.
 *
 * Stack:
 *   MpvPlayer
 *     ├─ spawns the mpv process
 *     ├─ connects + owns the IPC socket        (was mpv.ts)
 *     ├─ sends raw IPC commands                (was commands.ts / mpvIpc)
 *     └─ subscribes to mpv-adapter events for track-end callbacks
 */

import fs from 'node:fs';
import path from 'node:path';

import { handleRawMessage, onEvent } from './mpv-adapter';
import { loadConfig } from './config';
import { isExecutable, findOnPath, fetchLatestRelease, downloadAsset } from './binary';
import { getCacheDir } from '../db/index';

// ---------------------------------------------------------------------------
// mpv binary resolution + auto-download
// ---------------------------------------------------------------------------

const MPV_CACHE_DIR = path.join(getCacheDir(), 'mpv');
const MPV_BIN = path.join(MPV_CACHE_DIR, 'mpv.app', 'Contents', 'MacOS', 'mpv');
let _mpvBin: string | null | undefined;

function resolveMpvSystem(): string | null {
  const env = (process.env.MPV_BIN ?? '').trim();
  if (env && isExecutable(env)) return env;

  const candidates = process.platform === 'darwin'
    ? ['/opt/homebrew/bin/mpv', '/usr/local/bin/mpv']
    : process.platform === 'win32'
      ? ['C:\\Program Files\\mpv\\mpv.exe']
      : ['/usr/bin/mpv', '/usr/local/bin/mpv'];

  for (const c of candidates) {
    if (isExecutable(c)) return c;
  }

  // Check PATH
  const onPath = findOnPath('mpv');
  if (onPath) return onPath;

  // Previously downloaded
  if (isExecutable(MPV_BIN)) return MPV_BIN;

  return null;
}

export async function ensureMpv(
  onProgress?: (msg: string) => void,
): Promise<string> {
  if (_mpvBin) return _mpvBin;

  const existing = resolveMpvSystem();
  if (existing) { _mpvBin = existing; return existing; }

  if (process.platform !== 'darwin') {
    throw new Error('mpv not found. Please install mpv and ensure it is on your $PATH.');
  }

  onProgress?.('mpv not found — fetching latest release from GitHub…');

  const release = await fetchLatestRelease('mpv-player/mpv');

  // Release assets look like: mpv-v0.41.0-macos-26-arm.zip  (arm64)
  //                            mpv-v0.41.0-macos-26-x86_64.zip
  const archSuffix = process.arch === 'arm64' ? '-arm.zip' : '-x86_64.zip';
  const asset =
    release.assets.find((a) => a.name.includes('macos') && a.name.endsWith(archSuffix)) ??
    release.assets.find((a) => a.name.includes('macos') && a.name.endsWith('.zip'));

  if (!asset) throw new Error('Could not find a macOS mpv binary in the latest release assets.');

  const tempZip = path.join(MPV_CACHE_DIR, 'mpv.zip');
  await downloadAsset(asset, tempZip, onProgress);

  onProgress?.('Extracting…');

  // Step 1: unzip the outer .zip
  const unzip = Bun.spawn(['unzip', '-o', '-q', tempZip, '-d', MPV_CACHE_DIR], {
    stdout: 'ignore', stderr: 'pipe',
  });
  await unzip.exited;
  if (unzip.exitCode !== 0) {
    const err = await new Response(unzip.stderr).text();
    throw new Error(`mpv unzip failed: ${err}`);
  }
  fs.unlinkSync(tempZip);

  // Step 2: extract the inner mpv.tar.gz that lives inside the zip
  const innerTar = fs.readdirSync(MPV_CACHE_DIR).find((f) => f.endsWith('.tar.gz'));
  if (!innerTar) throw new Error('Could not find inner mpv.tar.gz after unzip.');
  const innerTarPath = path.join(MPV_CACHE_DIR, innerTar);
  const tar = Bun.spawn(['tar', 'xzf', innerTarPath, '-C', MPV_CACHE_DIR], {
    stdout: 'ignore', stderr: 'pipe',
  });
  await tar.exited;
  if (tar.exitCode !== 0) {
    const err = await new Response(tar.stderr).text();
    throw new Error(`mpv tar extraction failed: ${err}`);
  }
  fs.unlinkSync(innerTarPath);

  fs.chmodSync(MPV_BIN, 0o755);

  _mpvBin = MPV_BIN;
  onProgress?.('mpv ready.');
  return MPV_BIN;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlayerState = {
  filePath: string;
  playing: boolean;
  elapsed: number;
  duration: number;
  volume: number;
  pid: number | null;
};

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

class MpvPlayer {
  private process: ReturnType<typeof Bun.spawn> | null = null;
  private send: (command: unknown[]) => void = () => {};
  private volume = 100;
  private onTrackEnd: (() => void) | null = null;

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async resolveMpvBin(): Promise<string> {
    return ensureMpv();
  }

  private ipc(command: unknown[]): void {
    this.send(command);
  }

  private async connectSocket(socketPath: string): Promise<void> {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let buffer = '';
    let sock: any;

    await Bun.connect({
      unix: socketPath,
      socket: {
        open: (s) => {
          sock = s;
          this.send = (cmd) => s.write(encoder.encode(JSON.stringify({ command: cmd }) + '\n'));
          // Observe properties for domain event translation
          const observe = (id: number, prop: string) =>
            s.write(encoder.encode(JSON.stringify({ command: ['observe_property', id, prop] }) + '\n'));
          observe(1, 'media-title');
          observe(2, 'pause');
          observe(3, 'playback-time');
          observe(4, 'duration');
          observe(5, 'volume');
        },
        data: (_s, data) => {
          buffer += decoder.decode(data);
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try { handleRawMessage(JSON.parse(line)); } catch { /* malformed JSON */ }
          }
        },
      },
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  setCallbacks(onTrackEnd: () => void): void {
    this.onTrackEnd = onTrackEnd;
  }

  /** Spawn mpv and connect the IPC socket. Must be awaited before the TUI starts. */
  async init(): Promise<void> {
    const cfg = loadConfig();
    this.volume = cfg.defaultVolume;
    const socketPath = cfg.mpvSocketPath;

    Bun.spawnSync(['rm', '-f', socketPath]);

    this.process = Bun.spawn(
      [await this.resolveMpvBin(), '--idle=yes', '--no-video', `--input-ipc-server=${socketPath}`],
      { stdout: 'ignore', stderr: 'ignore' },
    );

    let connected = false;
    for (let i = 0; i < 50 && !connected; i++) {
      try {
        await this.connectSocket(socketPath);
        connected = true;
      } catch {
        await new Promise<void>((r) => setTimeout(r, 100));
      }
    }
    if (!connected) throw new Error('mpv: could not connect to IPC socket at ' + socketPath);

    onEvent((event) => {
      if (event.type === 'TrackEnded') this.onTrackEnd?.();
    });
  }

  /** Stop playback and kill the mpv process. */
  destroy(): void {
    this.ipc(['stop']);
    this.process?.kill();
    this.process = null;
  }

  // ── Playback API ──────────────────────────────────────────────────────────

  play(filePath: string): void {
    this.ipc(['loadfile', filePath]);
    this.ipc(['set_property', 'volume', this.volume]);
  }

  pause(): void {
    this.ipc(['set_property', 'pause', true]);
  }

  resume(): void {
    this.ipc(['set_property', 'pause', false]);
  }

  togglePlayPause(): void {
    this.ipc(['cycle', 'pause']);
  }

  seekBy(deltaSec: number): void {
    this.ipc(['seek', deltaSec, 'relative']);
  }

  seekTo(sec: number): void {
    this.ipc(['seek', sec, 'absolute']);
  }

  stop(): void {
    this.ipc(['stop']);
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(100, Math.round(vol)));
    this.ipc(['set_property', 'volume', this.volume]);
  }

  getVolume(): number {
    return this.volume;
  }

  quit(): void {
    this.ipc(['quit']);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const player = new MpvPlayer();

