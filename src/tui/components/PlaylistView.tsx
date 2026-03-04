import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

import { useStore } from '../../store/index';
import { formatDuration } from '../../lib/ytdlp';
import { ScrollList } from './ScrollList';

type Mode = 'playlists' | 'tracks' | 'new-playlist';

type Props = { height: number };

export function PlaylistView({ height }: Props): React.ReactElement {
  const [mode, setMode] = useState<Mode>('playlists');
  const [plSelIdx, setPlSelIdx] = useState(0);
  const [trSelIdx, setTrSelIdx] = useState(0);
  const [newName, setNewName] = useState('');

  const playlists = useStore((s) => s.playlists);
  const activePlaylistId = useStore((s) => s.activePlaylistId);
  const playlistTracks = useStore((s) => s.playlistTracks);
  const setActivePlaylistId = useStore((s) => s.setActivePlaylistId);
  const createPlaylist = useStore((s) => s.createPlaylist);
  const deletePlaylist = useStore((s) => s.deletePlaylist);
  const removeTrackFromPlaylist = useStore((s) => s.removeTrackFromPlaylist);
  const moveTrackInPlaylist = useStore((s) => s.moveTrackInPlaylist);
  const playFromContext = useStore((s) => s.playFromContext);
  const setStatusMsg = useStore((s) => s.setStatusMsg);

  useInput(
    (input, key) => {
      // New playlist name entry
      if (mode === 'new-playlist') {
        if (key.return) {
          if (newName.trim()) {
            void createPlaylist(newName.trim()).then(() =>
              setStatusMsg(`Created playlist "${newName.trim()}"`),
            );
          }
          setNewName('');
          setMode('playlists');
          return;
        }
        if (key.escape) { setMode('playlists'); setNewName(''); return; }
        if (key.backspace || key.delete) { setNewName((v) => v.slice(0, -1)); return; }
        if (!key.ctrl && !key.meta && input) { setNewName((v) => v + input); return; }
        return;
      }

      if (mode === 'playlists') {
        if (key.return) {
          const pl = playlists[plSelIdx];
          if (pl) { setActivePlaylistId(pl.id); setMode('tracks'); setTrSelIdx(0); }
          return;
        }
        if (input === 'n') { setMode('new-playlist'); return; }
        if (input === 'd') {
          const pl = playlists[plSelIdx];
          if (pl) {
            deletePlaylist(pl.id).then(() => setStatusMsg(`Deleted "${pl.name}"`));
            setPlSelIdx((i) => Math.max(0, i - 1));
          }
          return;
        }
        return;
      }

      if (mode === 'tracks') {
        if (key.escape) { setMode('playlists'); return; }
        if (key.return) {
          const track = playlistTracks[trSelIdx];
          if (track) {
            playFromContext(track, playlistTracks)

            setStatusMsg(`Playing: ${track.title}`)
          }
          return;
        }
        if (input === 'd') {
          const track = playlistTracks[trSelIdx];
          if (track && activePlaylistId !== null) {
            void removeTrackFromPlaylist(activePlaylistId, track.id);
            setTrSelIdx((i) => Math.max(0, i - 1));
          }
          return;
        }
        if (key.shift && key.upArrow) {
          const track = playlistTracks[trSelIdx];
          if (track && activePlaylistId !== null) {
            void moveTrackInPlaylist(activePlaylistId, track.id, 'up');
            setTrSelIdx((i) => Math.max(0, i - 1));
          }
          return;
        }
        if (key.shift && key.downArrow) {
          const track = playlistTracks[trSelIdx];
          if (track && activePlaylistId !== null) {
            void moveTrackInPlaylist(activePlaylistId, track.id, 'down');
            setTrSelIdx((i) => Math.min(playlistTracks.length - 1, i + 1));
          }
          return;
        }
      }
    },
  );

  const listH = height - 2;
  const activePl = playlists.find((p) => p.id === activePlaylistId);

  if (mode === 'new-playlist') {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan"> New playlist name (Enter to confirm, Esc to cancel):</Text>
        <Box borderStyle="single" borderColor="cyan" paddingX={1}>
          <Text>{newName}</Text>
          <Text color="cyan">█</Text>
        </Box>
      </Box>
    );
  }

  if (mode === 'tracks' && activePl) {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color="cyan"> {activePl.name}</Text>
        <Text color="white"> {playlistTracks.length} tracks · Enter to play · d remove · Shift+↑↓ reorder · Esc back</Text>
        {playlistTracks.length === 0
          ? <Text color="white">  Empty playlist</Text>
          : (
            <ScrollList
              items={playlistTracks}
              selectedIndex={trSelIdx}
              onSelect={setTrSelIdx}
              height={listH}
              renderItem={(track, _i, isSel) => (
                <Box>
                  <Text
                    backgroundColor={isSel ? 'blue' : undefined}
                    color={isSel ? 'white' : undefined}
                  >
                    {isSel ? '▶ ' : '  '}
                    <Text bold={isSel}>{track.title.slice(0, 55).padEnd(55)}</Text>
                    {'  '}
                    <Text color="cyan">{formatDuration(track.duration)}</Text>
                  </Text>
                </Box>
              )}
            />
          )
        }
      </Box>
    );
  }

  // Playlists list
  if (playlists.length === 0) {
    return (
      <Box flexDirection="column" flexGrow={1} justifyContent="center" alignItems="center">
        <Text color="white">No playlists. Press n to create one.</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Text color="white"> {playlists.length} playlists · Enter to open · n new · d delete</Text>
      <ScrollList
        items={playlists}
        selectedIndex={plSelIdx}
        onSelect={setPlSelIdx}
        height={listH}
        renderItem={(pl, _i, isSel) => (
          <Box>
            <Text
              backgroundColor={isSel ? 'blue' : undefined}
              color={isSel ? 'white' : undefined}
            >
              {isSel ? '▶ ' : '  '}{pl.name}
            </Text>
          </Box>
        )}
      />
    </Box>
  );
}
