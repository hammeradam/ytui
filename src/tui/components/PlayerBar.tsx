import React from 'react';
import { Box, Text } from 'ink';

import { useStore } from '../../store/index';
import { usePlayerStore } from '../../store/mpv-store';
import { formatDuration } from '../../lib/ytdlp';

function progressBar({ elapsed, duration, width = 30 }: { elapsed: number; duration: number; width?: number }) {
  if (!duration) return '░'.repeat(width);
  const filled = Math.round((elapsed / duration) * width);  

  return '█'.repeat(Math.min(filled, width)) + '░'.repeat(Math.max(width - filled, 0));
}

export function PlayerBar(): React.ReactElement {
  const { status, time, duration, volume } = usePlayerStore();
  const track      = useStore((s) => s.queue[s.queueIndex] ?? null);
  const queue      = useStore((s) => s.queue);
  const queueIndex = useStore((s) => s.queueIndex);
  const repeatMode = useStore((s) => s.repeatMode);
  const shuffle    = useStore((s) => s.shuffle);

  if (status.kind === 'idle') {
    return (
      <Box borderStyle="single" borderColor="white" paddingX={1}>
        <Text color="white"> No track playing · Space to play selected · q quit</Text>
      </Box>
    );
  }

  const isPlaying = status.kind === 'playing';

  // Rich metadata from the queue track; fall back to the title mpv reported
  const title = track
    ? `${track.title.slice(0, 40)} · ${track.channel.slice(0, 20)}`
    : status.title.slice(0, 60);

  const repeatLabel  = repeatMode === 'none' ? '' : repeatMode === 'one' ? ' [R:1]' : ' [R:all]';
  const shuffleLabel = shuffle ? ' [S]' : '';
  const queueLabel   = queue.length > 0 ? ` [${queueIndex + 1}/${queue.length}]` : '';

  return (
    <Box borderStyle="single" borderColor={isPlaying ? 'green' : 'yellow'} paddingX={1} gap={1}>
      <Text color={isPlaying ? 'green' : 'yellow'}>{isPlaying ? '▶' : '⏸'}</Text>
      <Text bold>{title}</Text>
      <Text color="white">{progressBar({ elapsed: time, duration })}</Text>
      <Text color="cyan">{formatDuration(time)}/{formatDuration(duration)}</Text>
      <Text color="white">vol:{volume}%{repeatLabel}{shuffleLabel}{queueLabel}</Text>
      <Text color="white">Space:pause  ←→:seek  p:prev  n:next  s:shuffle  r:repeat  u/i:vol  q:quit</Text>
    </Box>
  );
}
