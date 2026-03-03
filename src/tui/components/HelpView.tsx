import React from 'react';
import { Box, Text } from 'ink';

const BINDINGS = [
  ['1', 'Search view'],
  ['2', 'Library view'],
  ['3', 'Playlists view'],
  ['4', 'Download queue'],
  ['?', 'Toggle this help'],
  ['', ''],
  ['j / ↓', 'Move down'],
  ['k / ↑', 'Move up'],
  ['g', 'Jump to top'],
  ['G', 'Jump to bottom'],
  ['Enter', 'Select / confirm'],
  ['Space', 'Play/pause'],
  ['← / →', 'Seek -5 / +5 seconds'],
  ['n', 'Next track'],
  ['p', 'Previous track'],
  ['s', 'Toggle shuffle'],
  ['r', 'Cycle repeat mode (off → one → all)'],
  ['u / i', 'Volume down / up (5%)'],
  ['d', 'Delete / remove'],
  ['a', 'Add to playlist'],
  ['/', 'Focus search input'],
  ['q', 'Quit'],
] as const;

export function HelpView(): React.ReactElement {
  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
      <Text bold color="cyan">Keybindings</Text>
      <Text> </Text>
      {BINDINGS.map(([key, desc], i) =>
        key
          ? (
            <Box key={i} gap={2}>
              <Text color="yellow">{key.padEnd(12)}</Text>
              <Text>{desc}</Text>
            </Box>
          )
          : <Text key={i}> </Text>,
      )}
    </Box>
  );
}
