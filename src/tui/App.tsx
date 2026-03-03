import React, { useEffect } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';

import { useStore, type ActiveView } from '../store/index';
import { setDownloaderCallbacks } from '../lib/downloader';
import { setPlayerCallbacks } from '../lib/mpv-player';
import * as player from '../lib/mpv-player';
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
  const reloadTracks = useStore((s) => s.reloadTracks);
  const reloadPlaylists = useStore((s) => s.reloadPlaylists);
  const playNext = useStore((s) => s.playNext);
  const playPrev = useStore((s) => s.playPrev);
  const toggleShuffle = useStore((s) => s.toggleShuffle);
  const cycleRepeat = useStore((s) => s.cycleRepeat);

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

  // Wire up player track-end → advance queue
  useEffect(() => {
    setPlayerCallbacks(
      () => {}, // state is managed reactively by mpv-store
      () => void playNext(),
    );
  }, [playNext]);

  // Initial data load
  useEffect(() => {
    void reloadTracks();
    void reloadPlaylists();
  }, [reloadTracks, reloadPlaylists]);

  // Global keybindings
  useInput((input, key) => {
    if (input === 'q' && !key.ctrl) { player.stop(); exit(); return; }
    if (input === ' ') { void player.togglePlayPause(); return; }
    if (key.leftArrow) { void player.seekBy(-5); return; }
    if (key.rightArrow) { void player.seekBy(5); return; }
    if (input === 'u') { player.setVolume(player.getVolume() - 5); return; }
    if (input === 'i') { player.setVolume(player.getVolume() + 5); return; }
    if (input === 'n') { void playNext(); return; }
    if (input === 'p') { void playPrev(); return; }
    if (input === 's') { toggleShuffle(); return; }
    if (input === 'r') { cycleRepeat(); return; }
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
