import React, { useEffect } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';

import { useStore, type ActiveView } from '../store/index';
import { downloader } from '../lib/downloader';
import { player } from '../lib/mpv-player';
import { matchHotkey } from '../lib/config';
import { SearchView } from './components/SearchView';
import { LibraryView } from './components/LibraryView';
import { PlaylistView } from './components/PlaylistView';
import { DownloadQueue } from './components/DownloadQueue';
import { HelpView } from './components/HelpView';
import { PlayerBar } from './components/PlayerBar';
import { SettingsView } from './components/SettingsView';

const VIEW_LABELS: Record<ActiveView, string> = {
  search:    'Search',
  library:   'Library',
  playlists: 'Playlists',
  queue:     'Queue',
  settings:  'Settings',
  help:      'Help',
};

const VIEW_ACTIONS = [
  { view: 'search'    as ActiveView, action: 'viewSearch'    as const },
  { view: 'library'   as ActiveView, action: 'viewLibrary'   as const },
  { view: 'playlists' as ActiveView, action: 'viewPlaylists' as const },
  { view: 'queue'     as ActiveView, action: 'viewQueue'     as const },
  { view: 'settings'  as ActiveView, action: 'viewSettings'  as const },
  { view: 'help'      as ActiveView, action: 'viewHelp'      as const },
];

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
  const hotkeys = useStore((s) => s.settings.hotkeys);

  // Wire up downloader → store
  useEffect(() => {
    downloader.setCallbacks({
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
    player.setCallbacks(
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
    // Let view-local handlers own all input when on settings (or help)
    const viewOwnsInput = activeView === 'settings' || activeView === 'help';

    if (matchHotkey(hotkeys.quit, input, key) && !key.ctrl) { player.destroy(); exit(); return; }

    // View-switching keys
    for (const { view, action } of VIEW_ACTIONS) {
      if (matchHotkey(hotkeys[action], input, key)) {
        setActiveView(view === activeView && view === 'help' ? 'search' : view);
        return;
      }
    }

    if (viewOwnsInput) return;

    if (matchHotkey(hotkeys.playPause,     input, key)) { void player.togglePlayPause(); return; }
    if (matchHotkey(hotkeys.seekBack,      input, key)) { void player.seekBy(-5);        return; }
    if (matchHotkey(hotkeys.seekForward,   input, key)) { void player.seekBy(5);         return; }
    if (matchHotkey(hotkeys.volumeDown,    input, key)) { player.setVolume(player.getVolume() - 5); return; }
    if (matchHotkey(hotkeys.volumeUp,      input, key)) { player.setVolume(player.getVolume() + 5); return; }
    if (matchHotkey(hotkeys.nextTrack,     input, key)) { void playNext();        return; }
    if (matchHotkey(hotkeys.prevTrack,     input, key)) { void playPrev();        return; }
    if (matchHotkey(hotkeys.toggleShuffle, input, key)) { toggleShuffle();        return; }
    if (matchHotkey(hotkeys.cycleRepeat,   input, key)) { cycleRepeat();          return; }
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
        {(VIEW_ACTIONS.map(({ view, action }) => (
          <Text
            key={view}
            bold={activeView === view}
            color={activeView === view ? 'yellow' : 'magenta'}
            underline={activeView === view}
          >
            {hotkeys[action]}:{VIEW_LABELS[view]}
          </Text>
        )))}
      </Box>

      {/* Main content */}
      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        {activeView === 'search' && <SearchView height={contentH} />}
        {activeView === 'library' && <LibraryView height={contentH} />}
        {activeView === 'playlists' && <PlaylistView height={contentH} />}
        {activeView === 'queue' && <DownloadQueue />}
        {activeView === 'settings' && <SettingsView />}
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
