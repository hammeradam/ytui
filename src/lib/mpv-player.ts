/**
 * mpv-player.ts — orchestration layer.
 *
 * Stack:
 *   mpv process
 *     └─ mpv.ts          (raw socket)
 *          └─ mpv-adapter.ts  (domain events)
 *               └─ mpv-store.ts  (state machine)
 *                    └─ mpv-player.ts  (app API + queue bridge)
 *
 * This module:
 *   • Spawns the mpv process and connects the IPC socket.
 *   • Exposes play/pause/resume/seek/stop/setVolume for the app.
 */

import { connectMpv } from './mpv';
import { commands } from './commands';
import { onEvent } from './mpv-adapter';

// ---------------------------------------------------------------------------
// Types (kept for store/index.ts queue actions)
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
// Module-level state
// ---------------------------------------------------------------------------

const SOCKET_PATH = '/tmp/mpv.sock';

let _proc: ReturnType<typeof Bun.spawn> | null = null;
let _filePath = '';
let _volume = 100;
let _onTrackEnd: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveMpvBin(): string {
  const candidates = [
    '/opt/homebrew/bin/mpv',
    '/usr/local/bin/mpv',
    './src/bin/mpv.app/Contents/MacOS/mpv',
    'mpv',
  ];
  for (const p of candidates) {
    if (Bun.spawnSync(['test', '-x', p]).exitCode === 0) return p;
  }
  return 'mpv';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function setPlayerCallbacks(
  _onStateChange: (s: PlayerState | null) => void,
  onTrackEnd: () => void,
): void {
  _onTrackEnd = onTrackEnd;
}

/**
 * Spawn mpv and connect the IPC socket.  Must be awaited before the TUI starts.
 */
export async function init(): Promise<void> {
  // Remove stale socket
  Bun.spawnSync(['rm', '-f', SOCKET_PATH]);

  _proc = Bun.spawn(
    [resolveMpvBin(), '--idle=yes', '--no-video', `--input-ipc-server=${SOCKET_PATH}`],
    { stdout: 'ignore', stderr: 'ignore' },
  );

  // Retry connection — socket file takes a moment to appear
  let connected = false;
  for (let i = 0; i < 50 && !connected; i++) {
    try {
      await connectMpv(SOCKET_PATH);
      connected = true;
    } catch {
      await new Promise<void>((r) => setTimeout(r, 100));
    }
  }
  if (!connected) throw new Error('mpv: could not connect to IPC socket at ' + SOCKET_PATH);

  // Forward state machine changes to the app store
  // (no bridge needed: mpv-store is the source of truth and is read directly by UI)

  // Handle track-end: notify app store so it can advance the queue
  onEvent((event) => {
    if (event.type === 'TrackEnded') {
      _filePath = '';
      _onTrackEnd?.();
    }
  });
}

export async function play(filePath: string, _duration: number, startOffset = 0): Promise<void> {
  _filePath = filePath;
  commands.loadFile(filePath);
  if (startOffset > 0) {
    await new Promise<void>((r) => setTimeout(r, 300));
    commands.seekAbsolute(startOffset);
  }
  commands.setVolume(_volume);
}

export function pause(): void {
  commands.pause();
}

export async function resume(): Promise<void> {
  commands.resume();
}

export async function seekBy(deltaSec: number): Promise<void> {
  commands.seek(deltaSec);
}

export async function togglePlayPause(): Promise<void> {
  commands.toggle();
}

export function stop(): void {
  _filePath = '';
  commands.stop();
}

export function setVolume(vol: number): void {
  _volume = Math.max(0, Math.min(100, Math.round(vol)));
  commands.setVolume(_volume);
}

export function getVolume(): number {
  return _volume;
}

