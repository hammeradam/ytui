/**
 * mpv-store.ts — player state modelled as a finite state machine.
 *
 * Status transitions:
 *   idle ──loadFile──▶ playing ──pause──▶ paused
 *                        ▲                  │
 *                        └────────resume────┘
 *   playing / paused ──TrackEnded──▶ idle
 */

import { create } from 'zustand';
import { onEvent } from '../lib/mpv-adapter';

// ---------------------------------------------------------------------------
// State machine types
// ---------------------------------------------------------------------------

export type PlaybackStatus =
  | { kind: 'idle' }
  | { kind: 'playing'; title: string }
  | { kind: 'paused';  title: string };

export type MpvState = {
  status: PlaybackStatus;
  time:   number;   // integer seconds (throttled)
  duration: number; // seconds
  volume:   number; // 0–100
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePlayerStore = create<MpvState>(() => ({
  status:   { kind: 'idle' },
  time:     0,
  duration: 0,
  volume:   100,
}));

// ---------------------------------------------------------------------------
// Reducer: domain events → state transitions
// ---------------------------------------------------------------------------

onEvent((event) => {
  usePlayerStore.setState((state) => {
    switch (event.type) {
      case 'TrackChanged':
        return {
          ...state,
          status: { kind: 'playing', title: event.title },
          time: 0,
        };

      case 'PauseChanged': {
        const { status } = state;
        if (event.paused && status.kind === 'playing')
          return { ...state, status: { kind: 'paused', title: status.title } };
        if (!event.paused && status.kind === 'paused')
          return { ...state, status: { kind: 'playing', title: status.title } };
        return state;
      }

      case 'Progress':
        return { ...state, time: event.time };

      case 'DurationChanged':
        return { ...state, duration: event.duration };

      case 'VolumeChanged':
        return { ...state, volume: event.volume };

      case 'TrackEnded':
      case 'TrackError':
        return { ...state, status: { kind: 'idle' }, time: 0 };

      default:
        return state;
    }
  });
});

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------

export const useTitle = () =>
  usePlayerStore((s) =>
    s.status.kind !== 'idle' ? s.status.title : null
  );

export const useIsPlaying = () =>
  usePlayerStore((s) => s.status.kind === 'playing');

export const useIsPaused = () =>
  usePlayerStore((s) => s.status.kind === 'paused');

export const useProgressPercent = () =>
  usePlayerStore((s) =>
    s.duration > 0 ? s.time / s.duration : 0
  );

export const useFormattedTime = () =>
  usePlayerStore((s) => {
    const fmt = (sec: number) => {
      const m = Math.floor(sec / 60);
      const ss = String(Math.floor(sec % 60)).padStart(2, '0');
      return `${m}:${ss}`;
    };
    return `${fmt(s.time)} / ${fmt(s.duration)}`;
  });
