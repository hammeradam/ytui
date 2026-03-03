import { useEffect } from "react";
import { render, Box, Text, useInput } from "ink";
import { connectMpv } from './lib/mpv';
import { commands } from './lib/commands';
import {
  usePlayerStore,
  useTitle,
  useIsPlaying,
  useProgressPercent,
  useFormattedTime,
} from './store/mpv-store';

// Spawn mpv and connect IPC
Bun.spawnSync(['rm', '-f', '/tmp/mpv.sock']);
const proc = Bun.spawn([
  '/opt/homebrew/bin/mpv',
  '--idle=yes',
  '--no-video',
  '--input-ipc-server=/tmp/mpv.sock',
], { stdout: 'ignore', stderr: 'ignore' });

// Retry until socket is ready
for (let i = 0; i < 50; i++) {
  try { await connectMpv(); break; } catch { await Bun.sleep(100); }
}

const Player = () => {
  const title      = useTitle();
  const isPlaying  = useIsPlaying();
  const pct        = useProgressPercent();
  const timeStr    = useFormattedTime();
  const volume     = usePlayerStore((s) => s.volume);

  const BAR_WIDTH = 20;
  const filled = Math.round(pct * BAR_WIDTH);
  const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);

  useEffect(() => {
    commands.loadFile('./src/audio/test.m4a');
  }, []);

  useInput((input) => {
    if (input === ' ') commands.toggle();
    if (input === 'q') { proc.kill(); process.exit(0); }
  });

  return (
    <Box flexDirection="column" gap={1}>
      <Text>{isPlaying ? '▶ Playing' : '⏸ Paused'}</Text>
      <Text bold>{title ?? 'No track loaded'}</Text>
      <Text>[{bar}] {timeStr}</Text>
      <Text dimColor>vol: {volume}  ·  Space: toggle  ·  q: quit</Text>
    </Box>
  );
};

render(<Player />);
