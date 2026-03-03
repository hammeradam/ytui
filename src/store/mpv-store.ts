import { create } from "zustand";

type PlayerState = {
  title: string;
  pause: boolean;
  playbackTime: number;
  duration: number;
  setTitle: (title: string) => void;
  setPause: (pause: boolean) => void;
  setPlaybackTime: (time: number) => void;
  setDuration: (duration: number) => void;
};

export const usePlayerStore = create<PlayerState>((set) => ({
  title: "",
  pause: true,
  playbackTime: 0,
  duration: 0,
  setTitle: (title) => set({ title }),
  setPause: (pause) => set({ pause }),
  setPlaybackTime: (playbackTime) => set({ playbackTime }),
  setDuration: (duration) => set({ duration }),
}));