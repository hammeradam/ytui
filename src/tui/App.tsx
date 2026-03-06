import React, { useEffect, useState } from 'react';
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
import { EqView } from './components/EqView';

const VIEW_LABELS: Record<ActiveView, string> = {
  search: 'Search',
  library: 'Library',
  playlists: 'Playlists',
  queue: 'Queue',
  settings: 'Settings',
  help: 'Help',
};

const VIEW_ACTIONS = [
  { view: 'search' as ActiveView, action: 'viewSearch' as const },
  { view: 'library' as ActiveView, action: 'viewLibrary' as const },
  { view: 'playlists' as ActiveView, action: 'viewPlaylists' as const },
  { view: 'queue' as ActiveView, action: 'viewQueue' as const },
  { view: 'settings' as ActiveView, action: 'viewSettings' as const },
  { view: 'help' as ActiveView, action: 'viewHelp' as const },
];

export function App(): React.ReactElement {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [rows, setRows] = useState(() => stdout?.rows ?? 24);
  const [cols, setCols] = useState(() => stdout?.columns ?? 80);

  useEffect(() => {
    if (!stdout) return;
    const onResize = () => {
      setRows(stdout.rows);
      setCols(stdout.columns);
    };
    stdout.on('resize', onResize);
    return () => { stdout.off('resize', onResize); };
  }, [stdout]);

  const activeView = useStore((s) => s.activeView);
  const setActiveView = useStore((s) => s.setActiveView);
  const statusMsg = useStore((s) => s.statusMsg);
  const inputFocused = useStore((s) => s.inputFocused);
  const setDownloadQueue = useStore((s) => s.setDownloadQueue);
  const reloadTracks = useStore((s) => s.reloadTracks);
  const reloadPlaylists = useStore((s) => s.reloadPlaylists);
  const playNext = useStore((s) => s.playNext);
  const playPrev = useStore((s) => s.playPrev);
  const toggleShuffle = useStore((s) => s.toggleShuffle);
  const cycleRepeat = useStore((s) => s.cycleRepeat);
  const hotkeys = useStore((s) => s.settings.hotkeys);

  // EQ state
  const eqPanelOpen = useStore((s) => s.eqPanelOpen);
  const toggleEqPanel = useStore((s) => s.toggleEqPanel);
  const eqSelectedBand = useStore((s) => s.eqSelectedBand);
  const eqBands = useStore((s) => s.eqBands);
  const setEqBandGain = useStore((s) => s.setEqBandGain);
  const selectEqBandRelative = useStore((s) => s.selectEqBandRelative);
  const eqPresets = useStore((s) => s.eqPresets);
  const eqPresetViewOpen = useStore((s) => s.eqPresetViewOpen);
  const eqPresetSelectedIndex = useStore((s) => s.eqPresetSelectedIndex);
  const eqSavePresetMode = useStore((s) => s.eqSavePresetMode);
  const toggleEqPresetView = useStore((s) => s.toggleEqPresetView);
  const selectEqPresetRelative = useStore((s) => s.selectEqPresetRelative);
  const loadEqPreset = useStore((s) => s.loadEqPreset);
  const enterEqPresetSaveMode = useStore((s) => s.enterEqPresetSaveMode);
  const cancelEqPresetSaveMode = useStore((s) => s.cancelEqPresetSaveMode);
  const appendEqPresetNameInput = useStore((s) => s.appendEqPresetNameInput);
  const backspaceEqPresetName = useStore((s) => s.backspaceEqPresetName);
  const confirmEqPresetSave = useStore((s) => s.confirmEqPresetSave);
  const deleteEqPreset = useStore((s) => s.deleteEqPreset);

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
    player.setCallbacks(() => void playNext());
  }, [playNext]);

  // Initial data load
  useEffect(() => {
    void reloadTracks();
    void reloadPlaylists();
  }, [reloadTracks, reloadPlaylists]);

  // Global keybindings
  useInput((input, key) => {
    // Suppress all global hotkeys while a text input field has focus
    if (inputFocused) return;

    // Let view-local handlers own all input when on settings (or help)
    const viewOwnsInput = activeView === 'settings' || activeView === 'help';

    if (matchHotkey(hotkeys.quit, input, key) && !key.ctrl) {
      player.destroy();
      exit();
      return;
    }

    // EQ panel toggle (always available)
    if (input === 'e') {
      toggleEqPanel();
      return;
    }

    // If EQ panel is open, handle EQ-specific controls
    if (eqPanelOpen) {
      // If in preset save mode, handle text input
      if (eqSavePresetMode) {
        if (key.return) {
          confirmEqPresetSave();
          return;
        }
        if (key.escape) {
          cancelEqPresetSaveMode();
          return;
        }
        if (key.backspace) {
          backspaceEqPresetName();
          return;
        }
        if (input && input.length === 1 && /[a-zA-Z0-9\s\-_.]/.test(input)) {
          appendEqPresetNameInput(input);
          return;
        }
        // All other input ignored during save mode
        return;
      }

      // If preset view is open, handle preset selection
      if (eqPresetViewOpen) {
        if (key.upArrow) {
          selectEqPresetRelative(-1);
          return;
        }
        if (key.downArrow) {
          selectEqPresetRelative(1);
          return;
        }
        if (key.return && eqPresets.length > 0) {
          loadEqPreset(eqPresets[eqPresetSelectedIndex]!.name);
          return;
        }
        if (input === 's') {
          enterEqPresetSaveMode();
          return;
        }
        if (input === 'd' && eqPresets.length > 0) {
          deleteEqPreset(eqPresets[eqPresetSelectedIndex]!.name);
          return;
        }
        if (input === 'p') {
          toggleEqPresetView();
          return;
        }
      } else {
        // Band adjustment mode
        if (key.leftArrow) {
          selectEqBandRelative(-1);
          return;
        }
        if (key.rightArrow) {
          selectEqBandRelative(1);
          return;
        }
        if (key.upArrow) {
          const band = eqBands[eqSelectedBand];
          if (band) {
            setEqBandGain(eqSelectedBand, band.gain + 0.5);
          }
          return;
        }
        if (key.downArrow) {
          const band = eqBands[eqSelectedBand];
          if (band) {
            setEqBandGain(eqSelectedBand, band.gain - 0.5);
          }
          return;
        }
        if (input === 'p') {
          toggleEqPresetView();
          return;
        }
      }

      // All other keys are ignored while EQ panel is open (music controls disabled)
      return;
    }

    // View-switching keys
    for (const { view, action } of VIEW_ACTIONS) {
      if (matchHotkey(hotkeys[action], input, key)) {
        setActiveView(view === activeView && view === 'help' ? 'search' : view);
        return;
      }
    }

    if (viewOwnsInput) return;

    if (matchHotkey(hotkeys.playPause, input, key)) {
      void player.togglePlayPause();
      return;
    }
    if (matchHotkey(hotkeys.seekBack, input, key)) {
      void player.seekBy(-5);
      return;
    }
    if (matchHotkey(hotkeys.seekForward, input, key)) {
      void player.seekBy(5);
      return;
    }
    if (matchHotkey(hotkeys.volumeDown, input, key)) {
      player.setVolume(player.getVolume() - 5);
      return;
    }
    if (matchHotkey(hotkeys.volumeUp, input, key)) {
      player.setVolume(player.getVolume() + 5);
      return;
    }
    if (matchHotkey(hotkeys.nextTrack, input, key)) {
      void playNext();
      return;
    }
    if (matchHotkey(hotkeys.prevTrack, input, key)) {
      void playPrev();
      return;
    }
    if (matchHotkey(hotkeys.toggleShuffle, input, key)) {
      toggleShuffle();
      return;
    }
    if (matchHotkey(hotkeys.cycleRepeat, input, key)) {
      cycleRepeat();
      return;
    }
  });

  const headerH = 1;
  const footerH = 3; // player bar (border = 3 lines)
  const statusH = 1;
  const contentH = rows - headerH - footerH - statusH - 2; // 2 for borders

  return (
    <Box flexDirection="column" width={cols} height={rows}>
      {/* Header / tab bar */}
      <Box gap={2} paddingX={1} backgroundColor="gray" padding={1}>
        <Text bold color="white">
          ytui
        </Text>
        {VIEW_ACTIONS.map(({ view, action }) => (
          <Text
            key={view}
            bold={activeView === view}
            color={activeView === view ? 'yellow' : 'magenta'}
            underline={activeView === view}
          >
            {hotkeys[action]}:{VIEW_LABELS[view]}
          </Text>
        ))}
      </Box>

      {/* Main content — flexes horizontally if EQ panel is open */}
      <Box flexGrow={1} flexDirection={eqPanelOpen ? 'row' : 'column'} paddingX={1}>
        {/* Primary view (left side or full width) */}
        <Box flexDirection="column" flexGrow={1}>
          {activeView === 'search' && <SearchView height={contentH} />}
          {activeView === 'library' && <LibraryView height={contentH} />}
          {activeView === 'playlists' && <PlaylistView height={contentH} />}
          {activeView === 'queue' && <DownloadQueue />}
          {activeView === 'settings' && <SettingsView />}
          {activeView === 'help' && <HelpView />}
        </Box>

        {/* EQ panel on the right (if open) */}
        {eqPanelOpen && (
          <Box borderStyle="round" borderColor="yellow" marginLeft={1} width={35}>
            <EqView />
          </Box>
        )}
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
