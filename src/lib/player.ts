import { resolveFfplay } from './ffmpeg';

// ---------------------------------------------------------------------------
// Player: ffplay -nodisp -autoexit -ss <offset> <file>
//
// Pause  : kill ffplay, record elapsed.
// Resume : re-spawn ffplay with -ss <elapsed>.
// Single process, no FIFO, no pipes — clean and simple.
// ---------------------------------------------------------------------------

export type PlayerState = {
  filePath: string;
  playing: boolean;
  elapsed: number;  // seconds
  duration: number; // seconds
  volume: number;   // 0-100
  pid: number | null;
};

type PlayHandle = {
  proc: ReturnType<typeof Bun.spawn>;
  startedAt: number;   // Date.now() at start of this play segment
  startOffset: number; // -ss value passed to ffplay
};

let _state: PlayerState | null = null;
let _handle: PlayHandle | null = null;
let _ticker: ReturnType<typeof setInterval> | null = null;
let _onStateChange: ((s: PlayerState | null) => void) | null = null;
let _onTrackEnd: (() => void) | null = null;
let _volume = 100; // 0-100, persists across tracks

export function setPlayerCallbacks(
  onStateChange: (s: PlayerState | null) => void,
  onTrackEnd: () => void,
): void {
  _onStateChange = onStateChange;
  _onTrackEnd = onTrackEnd;
}

function emit(): void {
  _onStateChange?.(_state ? { ..._state } : null);
}

function stopTicker(): void {
  if (_ticker) { clearInterval(_ticker); _ticker = null; }
}

function startTicker(): void {
  stopTicker();
  _ticker = setInterval(() => {
    if (!_state || !_handle || !_state.playing) return;
    const elapsed = _handle.startOffset + (Date.now() - _handle.startedAt) / 1000;
    _state.elapsed = Math.min(elapsed, _state.duration || elapsed);
    emit();
  }, 500);
}

function spawnFfplay(filePath: string, offsetSec: number): PlayHandle {
  const bin = resolveFfplay() ?? 'ffplay';
  const proc = Bun.spawn(
    [bin, '-nodisp', '-autoexit', '-ss', String(offsetSec), '-volume', String(_volume), filePath],
    { stdout: 'ignore', stderr: 'ignore' },
  );
  return { proc, startedAt: Date.now(), startOffset: offsetSec };
}

function watchEnd(handle: PlayHandle): void {
  handle.proc.exited.then((code) => {
    if (_handle !== handle) return; // superseded
    if (code === 0) {
      stopTicker();
      if (_state) { _state.playing = false; _state.elapsed = _state.duration; }
      _handle = null;
      emit();
      _onTrackEnd?.();
    }
  });
}

export async function play(filePath: string, duration: number, startOffset = 0): Promise<void> {
  stopTicker();
  if (_handle) { try { _handle.proc.kill(); } catch { /* ignore */ } _handle = null; }

  _state = { filePath, playing: true, elapsed: startOffset, duration, volume: _volume, pid: null };
  const handle = spawnFfplay(filePath, startOffset);
  _handle = handle;
  _state.pid = handle.proc.pid ?? null;
  emit();
  startTicker();
  watchEnd(handle);
}

export function pause(): void {
  if (!_state || !_state.playing || !_handle) return;
  stopTicker();
  _state.elapsed = _handle.startOffset + (Date.now() - _handle.startedAt) / 1000;
  _state.playing = false;
  _state.pid = null;
  try { _handle.proc.kill(); } catch { /* ignore */ }
  _handle = null;
  emit();
}

export async function resume(): Promise<void> {
  if (!_state || _state.playing) return;
  const handle = spawnFfplay(_state.filePath, _state.elapsed);
  _handle = handle;
  _state.pid = handle.proc.pid ?? null;
  _state.playing = true;
  emit();
  startTicker();
  watchEnd(handle);
}

export async function seekBy(deltaSec: number): Promise<void> {
  if (!_state) return;
  const wasPlaying = _state.playing;
  // Snapshot current elapsed
  if (_handle && wasPlaying) {
    _state.elapsed = _handle.startOffset + (Date.now() - _handle.startedAt) / 1000;
  }
  const target = Math.max(0, Math.min(_state.elapsed + deltaSec, _state.duration));
  _state.elapsed = target;

  stopTicker();
  if (_handle) { try { _handle.proc.kill(); } catch { /* ignore */ } _handle = null; }

  if (wasPlaying) {
    const handle = spawnFfplay(_state.filePath, target);
    _handle = handle;
    _state.pid = handle.proc.pid ?? null;
    _state.playing = true;
    emit();
    startTicker();
    watchEnd(handle);
  } else {
    _state.playing = false;
    emit();
  }
}

export async function togglePlayPause(): Promise<void> {
  if (!_state) return;
  if (_state.playing) pause();
  else await resume();
}

export function stop(): void {
  stopTicker();
  if (_handle) { try { _handle.proc.kill(); } catch { /* ignore */ } _handle = null; }
  _state = null;
  emit();
}

/** Adjust volume (0-100). Takes effect on the next play/resume/seek. */
export async function setVolume(vol: number): Promise<void> {
  _volume = Math.max(0, Math.min(100, Math.round(vol)));
  if (_state) {
    _state.volume = _volume;
    emit();
  }
}

export function getVolume(): number {
  return _volume;
}

export function getPlayerState(): PlayerState | null {
  return _state ? { ..._state } : null;
}
