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
  const queue = useStore((s) => s.queue);
  const queueIndex = useStore((s) => s.queueIndex);
  const repeatMode = useStore((s) => s.repeatMode);
  const shuffle = useStore((s) => s.shuffle);

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

  const repeatLabel = repeatMode === 'none' ? '' : repeatMode === 'one' ? ' [R:1]' : ' [R:all]';
  const shuffleLabel = shuffle ? ' [S]' : '';
  const queueLabel = queue.length > 0 ? ` [${queueIndex + 1}/${queue.length}]` : '';

  return (
    <Box borderStyle="single" borderColor={ps.playing ? 'green' : 'yellow'} paddingX={1} gap={1}>
      <Text color={ps.playing ? 'green' : 'yellow'}>{ps.playing ? '▶' : '⏸'}</Text>
      <Text bold>{title}</Text>
      <Text color="white">{bar}</Text>
      <Text color="cyan">{elapsed}/{total}</Text>
      <Text color="white">vol:{ps.volume}%{repeatLabel}{shuffleLabel}{queueLabel}</Text>
      <Text color="white">Space:pause  ←→:seek  p:prev  n:next  s:shuffle  r:repeat  u/i:vol  q:quit</Text>
    </Box>
  );
}
