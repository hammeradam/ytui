import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

import { useStore } from '../../store/index';
import { retryJob } from '../../lib/downloader';
import type { DownloadJob } from '../../lib/downloader';

function statusColor(s: DownloadJob['status']): string {
  if (s === 'done') return 'green';
  if (s === 'error') return 'red';
  if (s === 'downloading') return 'yellow';
  return 'white';
}

function progressBar(pct: number, width = 20): string {
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function DownloadQueue(): React.ReactElement {
  const queue = useStore((s) => s.downloadQueue);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useInput((_input, key) => {
    if (key.downArrow || _input === 'j') setSelectedIdx((i) => Math.min(i + 1, queue.length - 1));
    if (key.upArrow || _input === 'k') setSelectedIdx((i) => Math.max(i - 1, 0));
    if (_input === 'r') {
      const job = queue[selectedIdx];
      if (job) retryJob(job.id);
    }
  });

  if (queue.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
        <Text color="white">No downloads. Search and press Enter to queue (1)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text color="white"> {queue.length} jobs · r to retry errored</Text>
      {queue.map((job, i) => (
        <Box key={job.id} flexDirection="column" marginBottom={1}>
          <Box>
            <Text color={i === selectedIdx ? 'cyan' : undefined}>{i === selectedIdx ? '▶ ' : '  '}</Text>
            <Text color={statusColor(job.status)}>
              {job.status === 'downloading' ? '⬇ ' : job.status === 'done' ? '✓ ' : job.status === 'error' ? '✗ ' : '○ '}
            </Text>
            <Text bold>{job.title.slice(0, 60)}</Text>
          </Box>
          {job.status === 'downloading' && (
            <Box paddingLeft={4}>
              <Text color="yellow">{progressBar(job.progress)} {job.progress.toFixed(0)}% {job.speed} ETA {job.eta}</Text>
            </Box>
          )}
          {job.status === 'error' && (
            <Box paddingLeft={4}>
              <Text color="red">{job.error.slice(0, 80)}</Text>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
}
