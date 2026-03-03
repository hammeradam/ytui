/**
 * mpv-player.ts — drop-in replacement for player.ts using mpv IPC.
 *
 * Call `init()` once at startup (before startTui).  After that, the module
 * exposes the same surface as player.ts so App.tsx / store/index.ts need only
 * change their import path.
 */

import { usePlayerStore } from '../store/mpv-store';
import { createClient } from './mpv';

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
// Module-level state
// ---------------------------------------------------------------------------

const SOCKET_PATH = '/tmp/mpv.sock';

let _client: Awaited<ReturnType<typeof createClient>> | null = null;
let _proc: ReturnType<typeof Bun.spawn> | null = null;
let _state: PlayerState | null = null;
let _volume = 100;
let _onStateChange: ((s: PlayerState | null) => void) | null = null;
let _onTrackEnd: (() => void) | null = null;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function emit(): void {
  _onStateChange?.(_state ? { ..._state } : null);
}

function resolveMpvBin(): string {
  for (const p of ['/opt/homebrew/bin/mpv', '/usr/local/bin/mpv', 'mpv', './src/bin/mpv.app/Contents/MacOS/mpv']) {
    try {
      const { exitCode } = Bun.spawnSync(['test', '-x', p]);
      if (exitCode === 0) return p;
    } catch { /* not found */ }
  }
  return 'mpv';
}

function handleTrackEnd(): void {
  if (_state) {
    _state.playing = false;
    emit();
  }
  _onTrackEnd?.();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function setPlayerCallbacks(
  onStateChange: (s: PlayerState | null) => void,
  onTrackEnd: () => void,
): void {
  _onStateChange = onStateChange;
  _onTrackEnd = onTrackEnd;
}

/**
 * Spawn mpv and establish the IPC connection.  Must be awaited before the TUI
 * starts so that the client is ready when play() is first called.
 */
export async function init(): Promise<void> {
  // Remove stale socket
  Bun.spawnSync(['rm', '-f', SOCKET_PATH]);

  const bin = resolveMpvBin();

  console.log(bin)

  _proc = Bun.spawn(
    [resolveMpvBin(), '--idle=yes', '--no-video', `--input-ipc-server=${SOCKET_PATH}`],
    { stdout: 'ignore', stderr: 'ignore' },
  );

  // Retry connecting — the socket file may take a moment to appear
  for (let i = 0; i < 50; i++) {
    try {
      _client = await createClient({ onTrackEnd: handleTrackEnd });
      break;
    } catch {
      await new Promise<void>((r) => setTimeout(r, 100));
    }
  }

  if (!_client) throw new Error('mpv: could not connect to IPC socket at ' + SOCKET_PATH);

  // Bridge mpv-store → PlayerState callbacks so the TUI stays in sync
  usePlayerStore.subscribe((s) => {
    if (!_state) return;
    const updated: PlayerState = {
      ..._state,
      playing: !s.pause,
      elapsed: s.playbackTime,
      duration: s.duration > 0 ? s.duration : _state.duration,
    };
    _state = updated;
    emit();
  });
}

export async function play(filePath: string, duration: number, startOffset = 0): Promise<void> {
  if (!_client) return;
  _state = {
    filePath,
    playing: true,
    elapsed: startOffset,
    duration,
    volume: _volume,
    pid: _proc?.pid ?? null,
  };
  emit();
  _client.loadFile(filePath);
  if (startOffset > 0) {
    // Give mpv a moment to open the file before seeking
    await new Promise<void>((r) => setTimeout(r, 300));
    _client.seekAbsolute(startOffset);
  }
  _client.setVolume(_volume);
}

export function pause(): void {
  _client?.pause();
}

export async function resume(): Promise<void> {
  _client?.resume();
}

export async function seekBy(deltaSec: number): Promise<void> {
  _client?.seek(deltaSec);
}

export async function togglePlayPause(): Promise<void> {
  if (!_state) return;
  if (_state.playing) pause();
  else await resume();
}

export function stop(): void {
  _client?.stop();
  _state = null;
  emit();
}

export function setVolume(vol: number): void {
  _volume = Math.max(0, Math.min(100, Math.round(vol)));
  if (_state) { _state.volume = _volume; emit(); }
  _client?.setVolume(_volume);
}

export function getVolume(): number {
  return _volume;
}

export function getPlayerState(): PlayerState | null {
  return _state ? { ..._state } : null;
}
