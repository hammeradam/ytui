import React from 'react';
import { Box, Text } from 'ink';

import { useStore } from '../../store/index';
import { formatDuration } from '../../lib/ytdlp';

function progressBar(elapsed: number, duration: number, width = 30): string {
  if (!duration) return '░'.repeat(width);
  const filled = Math.round((elapsed / duration) * width);
  return '█'.repeat(Math.min(filled, width)) + '░'.repeat(Math.max(width - filled, 0));
}

export function PlayerBar(): React.ReactElement {
  const ps = useStore((s) => s.player);
  const tracks = useStore((s) => s.tracks);

  if (!ps) {
    return (
      <Box borderStyle="single" borderColor="white" paddingX={1}>
        <Text color="white"> No track playing · Space to play selected · q quit</Text>
      </Box>
    );
  }

  const elapsed = formatDuration(ps.elapsed);
  const total = formatDuration(ps.duration);
  const bar = progressBar(ps.elapsed, ps.duration);

  // Look up title/channel from library; fall back to filename
  const trackMeta = tracks.find((t) => t.filePath === ps.filePath);
  const title = trackMeta
    ? `${trackMeta.title.slice(0, 40)} · ${trackMeta.channel.slice(0, 20)}`
    : ps.filePath.split('/').pop()?.replace(/\.[^.]+$/, '').slice(0, 40) ?? ps.filePath;

  // Refresh player state from module (tracks elapsed via interval)
  // The store is updated via callbacks set in App.tsx

  return (
    <Box borderStyle="single" borderColor={ps.playing ? 'green' : 'yellow'} paddingX={1} gap={1}>
      <Text color={ps.playing ? 'green' : 'yellow'}>{ps.playing ? '▶' : '⏸'}</Text>
      <Text bold>{title}</Text>
      <Text color="white">{bar}</Text>
      <Text color="cyan">{elapsed}/{total}</Text>
      <Text color="white">vol:{ps.volume}%</Text>
      <Text color="white">Space:pause  u:vol-  i:vol+  n:stop  q:quit</Text>
    </Box>
  );
}
