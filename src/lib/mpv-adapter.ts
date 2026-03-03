/**
 * mpv-adapter.ts — translates raw mpv JSON messages into typed domain events.
 *
 * Nothing above this layer ever sees mpv-specific field names.
 */

// ---------------------------------------------------------------------------
// Domain events
// ---------------------------------------------------------------------------

export type DomainEvent =
  | { type: 'TrackChanged'; title: string }
  | { type: 'PauseChanged'; paused: boolean }
  | { type: 'Progress'; time: number }
  | { type: 'DurationChanged'; duration: number }
  | { type: 'VolumeChanged'; volume: number }
  | { type: 'TrackEnded' }
  | { type: 'TrackError'; reason: string };

// ---------------------------------------------------------------------------
// Listener registry
// ---------------------------------------------------------------------------

type Listener = (event: DomainEvent) => void;

const listeners = new Set<Listener>();

/** Subscribe to domain events. Returns an unsubscribe function. */
export function onEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: DomainEvent): void {
  for (const l of listeners) l(event);
}

// ---------------------------------------------------------------------------
// Throttle: only emit Progress when the integer second changes
// ---------------------------------------------------------------------------

let _lastSecond = -1;

// ---------------------------------------------------------------------------
// Raw message → domain event translation
// ---------------------------------------------------------------------------

export function handleRawMessage(msg: any): void {
  if (msg.event === 'property-change') {
    switch (msg.name) {
      case 'media-title':
        emit({ type: 'TrackChanged', title: msg.data ?? '' });
        break;
      case 'pause':
        emit({ type: 'PauseChanged', paused: !!msg.data });
        break;
      case 'playback-time': {
        const sec = Math.floor(msg.data ?? 0);
        if (sec !== _lastSecond) {
          _lastSecond = sec;
          emit({ type: 'Progress', time: sec });
        }
        break;
      }
      case 'duration':
        if (msg.data != null) {
          emit({ type: 'DurationChanged', duration: msg.data });
        }
        break;
      case 'volume':
        if (msg.data != null) {
          emit({ type: 'VolumeChanged', volume: Math.round(msg.data) });
        }
        break;
    }
    return;
  }

  if (msg.event === 'end-file') {
    if (msg.reason === 'eof') {
      _lastSecond = -1;
      emit({ type: 'TrackEnded' });
    } else if (msg.reason === 'error') {
      emit({ type: 'TrackError', reason: msg.file_error ?? 'unknown' });
    }
  }
}
