import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

import { useStore } from '../../store/index';
import { formatDuration } from '../../lib/ytdlp';
import * as player from '../../lib/player';
import { ScrollList } from './ScrollList';
import type { Track } from '../../db/schema';

type Mode = 'list' | 'add-to-playlist';
type Props = { height: number };

export function LibraryView({ height }: Props): React.ReactElement {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mode, setMode] = useState<Mode>('list');
  const [playlistSelIdx, setPlaylistSelIdx] = useState(0);

  const tracks = useStore((s) => s.tracks);
  const playlists = useStore((s) => s.playlists);
  const setStatusMsg = useStore((s) => s.setStatusMsg);
  const setPlayer = useStore((s) => s.setPlayer);
  const addTrackToPlaylist = useStore((s) => s.addTrackToPlaylist);

  const selectedTrack: Track | undefined = tracks[selectedIdx];

  useInput(
    (input, key) => {
      if (mode === 'add-to-playlist') {
        if (key.escape) { setMode('list'); return; }
        if (key.return) {
          const pl = playlists[playlistSelIdx];
          if (pl && selectedTrack) {
            void addTrackToPlaylist(pl.id, selectedTrack.id).then(() =>
              setStatusMsg(`Added to "${pl.name}"`),
            );
          }
          setMode('list');
          return;
        }
        if (key.downArrow || input === 'j')
          setPlaylistSelIdx((i) => Math.min(i + 1, playlists.length - 1));
        if (key.upArrow || input === 'k')
          setPlaylistSelIdx((i) => Math.max(i - 1, 0));
        return;
      }

      if (key.return) {
        if (selectedTrack) {
          void player.play(selectedTrack.filePath, selectedTrack.duration).then(() => {
            setPlayer(player.getPlayerState());
          });
          setStatusMsg(`Playing: ${selectedTrack.title}`);
        }
        return;
      }
      if (input === 'a') {
        if (selectedTrack && playlists.length > 0) {
          setMode('add-to-playlist');
          setPlaylistSelIdx(0);
        } else {
          setStatusMsg('No playlists — create one in the Playlists view (3)');
        }
        return;
      }
    },
  );

  const listHeight = height - 1;

  if (mode === 'add-to-playlist') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan"> Add to playlist (Esc to cancel)</Text>
        {playlists.map((pl, i) => (
          <Box key={pl.id}>
            <Text backgroundColor={i === playlistSelIdx ? 'blue' : undefined}>
              {i === playlistSelIdx ? '▶ ' : '  '}{pl.name}
            </Text>
          </Box>
        ))}
      </Box>
    );
  }

  if (tracks.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
        <Text color="white">Library is empty. Search and download tracks (1)</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text color="white"> {tracks.length} tracks · Enter to play · Space to pause/resume · a to add to playlist</Text>
      <ScrollList
        items={tracks}
        selectedIndex={selectedIdx}
        onSelect={setSelectedIdx}
        height={listHeight}
        renderItem={(track, _idx, isSelected) => (
          <Box>
            <Text
              backgroundColor={isSelected ? 'blue' : undefined}
              color={isSelected ? 'white' : undefined}
            >
              {isSelected ? '▶ ' : '  '}
              <Text bold={isSelected}>{track.title.slice(0, 55).padEnd(55)}</Text>
              {'  '}
              <Text color="white">{track.channel.slice(0, 20).padEnd(20)}</Text>
              {'  '}
              <Text color="cyan">{formatDuration(track.duration)}</Text>
            </Text>
          </Box>
        )}
      />
    </Box>
  );
}
