import { useEffect } from "react";
import { render, Box, Text, useInput } from "ink";
import { usePlayerStore } from "./store/mpv-store";
import { createClient } from './lib/mpv';

// const proc = Bun.spawn([
//   "./src/bin/mpv.app/Contents/MacOS/mpv",
//   "--idle",
//   "--input-ipc-server=/tmp/mpv.sock"
// ]);

// console.log(proc)

const client = await createClient();

const Player = () => {
  const { title, pause, playbackTime, duration } = usePlayerStore();

  const progress =
    duration > 0
      ? Math.floor((playbackTime / duration) * 20)
      : 0;

  const bar =
    "█".repeat(progress) +
    "░".repeat(20 - progress);

  useEffect(() => {
    client.loadFile('./src/audio/test.m4a');

    // const timeout = setTimeout(() => {
    //   console.log('resume')
    //   client.resume();
    // }, 10_000);

    // return () => clearTimeout(timeout);
  }, []);

  useInput((input) => {
    if (input === ' ') {
      if (pause) {
        client.resume();
      } else {
        client.pause();
      }
    }
  });

  return (
    <Box flexDirection="column">
      <Text>
        {pause ? "⏸ Paused" : "▶ Playing"}
      </Text>

      <Text>{title || "No track loaded"}</Text>

      <Text>
        [{bar}] {Math.floor(playbackTime)}s
      </Text>

      <Box marginTop={1} gap={2}>
        <Text
          bold
          color="green"
        >
          [ ▶ Play ]
        </Text>
        <Text
          bold
          color="yellow"
        >
          [ ⏸ Pause ]
        </Text>
      </Box>

      <Text dimColor>Press Space to toggle play/pause</Text>
    </Box>
  );
};

render(<Player />);

process.on('SIGINT', () => {
  // proc.kill();
  process.exit();
});

process.on('SIGTERM', () => {
  // proc.kill();
  process.exit();
});