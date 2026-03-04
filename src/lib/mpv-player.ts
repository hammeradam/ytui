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

import { handleRawMessage, onEvent } from './mpv-adapter';
import { loadConfig } from './config';

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

  private resolveMpvBin(): string {
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
      [this.resolveMpvBin(), '--idle=yes', '--no-video', `--input-ipc-server=${socketPath}`],
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
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const player = new MpvPlayer();

