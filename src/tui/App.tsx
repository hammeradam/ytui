import React, { useEffect } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';

import { useStore, type ActiveView } from '../store/index';
import { setDownloaderCallbacks } from '../lib/downloader';
import { setPlayerCallbacks } from '../lib/player';
import * as player from '../lib/player';
import { SearchView } from './components/SearchView';
import { LibraryView } from './components/LibraryView';
import { PlaylistView } from './components/PlaylistView';
import { DownloadQueue } from './components/DownloadQueue';
import { HelpView } from './components/HelpView';
import { PlayerBar } from './components/PlayerBar';

const VIEW_KEYS: Record<string, ActiveView> = {
  '1': 'search',
  '2': 'library',
  '3': 'playlists',
  '4': 'queue',
  '?': 'help',
};

const VIEW_LABELS: Record<ActiveView, string> = {
  search: '1:Search',
  library: '2:Library',
  playlists: '3:Playlists',
  queue: '4:Queue',
  help: '?:Help',
};

export function App(): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;
  const cols = stdout?.columns ?? 80;

  const activeView = useStore((s) => s.activeView);
  const setActiveView = useStore((s) => s.setActiveView);
  const statusMsg = useStore((s) => s.statusMsg);
  const setDownloadQueue = useStore((s) => s.setDownloadQueue);
  const setPlayerState = useStore((s) => s.setPlayer);
  const reloadTracks = useStore((s) => s.reloadTracks);
  const reloadPlaylists = useStore((s) => s.reloadPlaylists);

  // Wire up downloader → store
  useEffect(() => {
    setDownloaderCallbacks({
      onUpdate: (jobs) => {
        setDownloadQueue(jobs);
        // Reload library when a download completes
        if (jobs.some((j) => j.status === 'done')) {
          void reloadTracks();
        }
      },
    });
  }, [setDownloadQueue, reloadTracks]);

  // Wire up player → store
  useEffect(() => {
    setPlayerCallbacks(
      (state) => setPlayerState(state),
      () => {
        // Track ended naturally — update store
        setPlayerState(player.getPlayerState());
      },
    );
  }, [setPlayerState]);

  // Initial data load
  useEffect(() => {
    void reloadTracks();
    void reloadPlaylists();
  }, [reloadTracks, reloadPlaylists]);

  // Global keybindings
  useInput((input, key) => {
    if (input === 'q' && !key.ctrl) { player.stop(); exit(); return; }
    if (input === ' ') { void player.togglePlayPause().then(() => setPlayerState(player.getPlayerState())); return; }
    if (key.leftArrow) { void player.seekBy(-5).then(() => setPlayerState(player.getPlayerState())); return; }
    if (key.rightArrow) { void player.seekBy(5).then(() => setPlayerState(player.getPlayerState())); return; }
    if (input === '[') { void player.setVolume(player.getVolume() - 5).then(() => setPlayerState(player.getPlayerState())); return; }
    if (input === ']') { void player.setVolume(player.getVolume() + 5).then(() => setPlayerState(player.getPlayerState())); return; }
    if (input === 'n' && activeView !== 'search') { player.stop(); return; }
    const view = VIEW_KEYS[input];
    if (view) { setActiveView(view === activeView && view === 'help' ? 'search' : view); return; }
  });

  const headerH = 1;
  const footerH = 3; // player bar (border = 3 lines)
  const statusH = 1;
  const contentH = rows - headerH - footerH - statusH - 2; // 2 for borders

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      {/* Header / tab bar */}
      <Box gap={2} paddingX={1} backgroundColor="gray" padding={1}>
        <Text bold color="white">ytui</Text>
        {(Object.entries(VIEW_LABELS) as [ActiveView, string][]).map(([view, label]) => (
          <Text
            key={view}
            bold={activeView === view}
            color={activeView === view ? 'yellow' : 'magenta'}
            underline={activeView === view}
          >
            {label}
          </Text>
        ))}
      </Box>

      {/* Main content */}
      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        {activeView === 'search' && <SearchView height={contentH} />}
        {activeView === 'library' && <LibraryView height={contentH} />}
        {activeView === 'playlists' && <PlaylistView height={contentH} />}
        {activeView === 'queue' && <DownloadQueue />}
        {activeView === 'help' && <HelpView />}
      </Box>

      {/* Status bar */}
      <Box paddingX={1}>
        <Text color="white">{statusMsg || ' '}</Text>
      </Box>

      {/* Player bar */}
      <PlayerBar />
    </Box>
  );
}
