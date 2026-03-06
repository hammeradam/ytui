import React from 'react';
import { Box, Text } from 'ink';

import { displayHotkey } from '../../lib/config';
import { useStore } from '../../store/index';

type Row = [string, string] | null; // null = blank spacer

export function HelpView(): React.ReactElement {
  const hk = useStore((s) => s.settings.hotkeys);

  const dk = (action: keyof typeof hk) => displayHotkey(hk[action]);

  const rows: Row[] = [
    // Views
    [dk('viewSearch'),    'Search view'],
    [dk('viewLibrary'),   'Library view'],
    [dk('viewPlaylists'), 'Playlists view'],
    [dk('viewQueue'),     'Download queue'],
    [dk('viewSettings'),  'Settings'],
    [dk('viewHelp'),      'Toggle this help'],
    null,
    // Navigation (view-local, not configurable)
    ['j / ↓',   'Move down'],
    ['k / ↑',   'Move up'],
    ['g',        'Jump to top'],
    ['G',        'Jump to bottom'],
    ['Enter',    'Select / confirm'],
    null,
    // Playback
    [dk('playPause'),     'Play / pause'],
    [`${dk('seekBack')} / ${dk('seekForward')}`,  'Seek -5 / +5 seconds'],
    [`${dk('volumeDown')} / ${dk('volumeUp')}`,   'Volume down / up (5%)'],
    [dk('nextTrack'),     'Next track'],
    [dk('prevTrack'),     'Previous track'],
    [dk('toggleShuffle'), 'Toggle shuffle'],
    [dk('cycleRepeat'),   'Cycle repeat mode (off → one → all)'],
    null,
    // Equalizer
    ['e', 'Toggle equalizer panel'],
    ['← / →', 'Select EQ band (when open)'],
    ['↑ / ↓', 'Adjust gain (when open)'],
    null,
    // Library actions (view-local)
    ['d', 'Delete / remove'],
    ['a', 'Add to playlist'],
    ['/', 'Focus search input'],
    null,
    [dk('quit'), 'Quit'],
  ];

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
      <Text bold color="cyan">Keybindings</Text>
      <Text dimColor>Configurable bindings marked with * can be changed in Settings.</Text>
      <Text> </Text>
      {rows.map((row, i) =>
        row === null
          ? <Text key={`spacer-${i}`}> </Text>
          : (
            <Box key={`${row[0]}-${row[1]}`} gap={2}>
              <Text color="yellow">{row[0].padEnd(14)}</Text>
              <Text>{row[1]}</Text>
            </Box>
          ),
      )}
    </Box>
  );
}
