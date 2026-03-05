import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

import {
  updateConfig,
  updateHotkey,
  captureHotkey,
  displayHotkey,
  DEFAULT_HOTKEYS,
  CONFIG_DEFAULTS,
  type Config,
  type AudioFormat,
  type AudioQuality,
  type HotkeyAction,
} from '../../lib/config';
import { useStore } from '../../store/index';

// ---------------------------------------------------------------------------
// Setting definitions
// ---------------------------------------------------------------------------

type EnumSetting<K extends keyof Config> = {
  kind: 'enum';
  key: K;
  label: string;
  description: string;
  options: Array<{ value: Config[K]; label: string }>;
};

type IntSetting<K extends keyof Config> = {
  kind: 'int';
  key: K;
  label: string;
  description: string;
  min: number;
  max: number;
  step: number;
};

type StrSetting<K extends keyof Config> = {
  kind: 'str';
  key: K;
  label: string;
  description: string;
  placeholder: string;
};

type HotkeySetting = {
  kind: 'hotkey';
  action: HotkeyAction;
  label: string;
  description: string;
};

type SectionHeader = {
  kind: 'section';
  label: string;
};

type GeneralSetting =
  | EnumSetting<'audioFormat'>
  | EnumSetting<'audioQuality'>
  | EnumSetting<'searchResultsLimit'>
  | IntSetting<'defaultVolume'>
  | IntSetting<'restartThreshold'>
  | StrSetting<'mpvSocketPath'>
  | StrSetting<'downloadDir'>
  | StrSetting<'youtubeApiKey'>;

type Item = GeneralSetting | HotkeySetting | SectionHeader;

// ---------------------------------------------------------------------------
// Item lists
// ---------------------------------------------------------------------------

const GENERAL_SETTINGS: GeneralSetting[] = [
  {
    kind: 'int',
    key: 'defaultVolume',
    label: 'Default volume',
    description: 'Starting playback volume (0–100)',
    min: 0,
    max: 100,
    step: 5,
  },
  {
    kind: 'int',
    key: 'restartThreshold',
    label: 'Restart threshold',
    description: 'Seconds after which "previous" jumps to the previous track instead of restarting the current one',
    min: 0,
    max: 60,
    step: 1,
  },
  {
    kind: 'enum',
    key: 'audioFormat',
    label: 'Audio format',
    description: 'Preferred container for downloaded audio',
    options: [
      { value: 'm4a' as AudioFormat, label: 'm4a  (AAC, broad compatibility)' },
      {
        value: 'opus' as AudioFormat,
        label: 'opus (better quality at low bitrate)',
      },
      { value: 'best' as AudioFormat, label: 'best (let yt-dlp decide)' },
    ],
  },
  {
    kind: 'enum',
    key: 'audioQuality',
    label: 'Audio quality',
    description: 'Maximum bitrate requested from yt-dlp',
    options: [
      { value: 'best' as AudioQuality, label: 'best (highest available)' },
      { value: '256k' as AudioQuality, label: '256k' },
      { value: '192k' as AudioQuality, label: '192k' },
      { value: '128k' as AudioQuality, label: '128k' },
    ],
  },
  {
    kind: 'enum',
    key: 'searchResultsLimit',
    label: 'Search results',
    description: 'Max number of results shown per search',
    options: [
      { value: 5, label: '5' },
      { value: 10, label: '10' },
      { value: 20, label: '20' },
      { value: 25, label: '25' },
    ],
  },
  {
    kind: 'str',
    key: 'youtubeApiKey',
    label: 'YouTube API key',
    description: 'Google API key for YouTube Data API v3 — enables fast search (~1 s vs ~12 s). Leave empty to use yt-dlp for search.',
    placeholder: '(not set — using yt-dlp for search)',
  },
  {
    kind: 'str',
    key: 'mpvSocketPath',
    label: 'mpv socket path',
    description: 'Unix socket used for mpv IPC (requires restart)',
    placeholder: CONFIG_DEFAULTS.mpvSocketPath,
  },
  {
    kind: 'str',
    key: 'downloadDir',
    label: 'Download directory',
    description: 'Where audio files are saved. Empty = ~/.ytui/music',
    placeholder: '~/.ytui/music (default)',
  },
];

const HOTKEY_SETTINGS: HotkeySetting[] = [
  {
    kind: 'hotkey',
    action: 'quit',
    label: 'Quit',
    description: 'Exit the application',
  },
  {
    kind: 'hotkey',
    action: 'playPause',
    label: 'Play / Pause',
    description: 'Toggle playback',
  },
  {
    kind: 'hotkey',
    action: 'seekBack',
    label: 'Seek back',
    description: 'Seek backward 5 seconds',
  },
  {
    kind: 'hotkey',
    action: 'seekForward',
    label: 'Seek forward',
    description: 'Seek forward 5 seconds',
  },
  {
    kind: 'hotkey',
    action: 'volumeDown',
    label: 'Volume down',
    description: 'Decrease volume by 5',
  },
  {
    kind: 'hotkey',
    action: 'volumeUp',
    label: 'Volume up',
    description: 'Increase volume by 5',
  },
  {
    kind: 'hotkey',
    action: 'nextTrack',
    label: 'Next track',
    description: 'Advance to next track',
  },
  {
    kind: 'hotkey',
    action: 'prevTrack',
    label: 'Prev track',
    description: 'Go back to previous track',
  },
  {
    kind: 'hotkey',
    action: 'toggleShuffle',
    label: 'Toggle shuffle',
    description: 'Toggle shuffle mode',
  },
  {
    kind: 'hotkey',
    action: 'cycleRepeat',
    label: 'Cycle repeat',
    description: 'Cycle repeat mode (off → one → all)',
  },
  {
    kind: 'hotkey',
    action: 'viewSearch',
    label: 'Go: Search',
    description: 'Switch to Search view',
  },
  {
    kind: 'hotkey',
    action: 'viewLibrary',
    label: 'Go: Library',
    description: 'Switch to Library view',
  },
  {
    kind: 'hotkey',
    action: 'viewPlaylists',
    label: 'Go: Playlists',
    description: 'Switch to Playlists view',
  },
  {
    kind: 'hotkey',
    action: 'viewQueue',
    label: 'Go: Queue',
    description: 'Switch to Download Queue view',
  },
  {
    kind: 'hotkey',
    action: 'viewSettings',
    label: 'Go: Settings',
    description: 'Switch to Settings view',
  },
  {
    kind: 'hotkey',
    action: 'viewHelp',
    label: 'Go: Help',
    description: 'Toggle help view',
  },
];

// Combined list with section headers interleaved
const ALL_ITEMS: Item[] = [
  { kind: 'section', label: 'General' },
  ...GENERAL_SETTINGS,
  { kind: 'section', label: 'Hotkeys' },
  ...HOTKEY_SETTINGS,
];

// Indices into ALL_ITEMS that are selectable (not section headers)
const SELECTABLE: number[] = ALL_ITEMS.reduce<number[]>((acc, item, i) => {
  if (item.kind !== 'section') acc.push(i);
  return acc;
}, []);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Partially mask a secret string for display, showing only first/last 4 chars. */
function maskSecret(s: string): string {
  if (!s) return '';
  if (s.length <= 8) return '●'.repeat(s.length);
  return `${s.slice(0, 4)}${'●'.repeat(Math.min(s.length - 8, 20))}${s.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsView(): React.ReactElement {
  // selectedIdx is an index into SELECTABLE
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editing, setEditing] = useState(false); // str-field editor open
  const [capturing, setCapturing] = useState(false); // hotkey capture mode
  const [editBuf, setEditBuf] = useState('');
  const setStatusMsg = useStore((s) => s.setStatusMsg);
  const setSettings = useStore((s) => s.setSettings);

  const cfg = useStore((s) => s.settings);
  const hotkeys = cfg.hotkeys;

  function persistGeneral<K extends keyof Config>(key: K, value: Config[K]) {
    const next = updateConfig(key, value);
    setSettings(next);
    setStatusMsg(`Saved: ${key}`);
  }

  function persistHotkey(action: HotkeyAction, hk: string) {
    const next = updateHotkey(action, hk);
    setSettings(next);
    setStatusMsg(`Hotkey saved: ${action} → ${displayHotkey(hk)}`);
  }

  const allItemIdx = SELECTABLE[selectedIdx]!;
  const currentItem = ALL_ITEMS[allItemIdx] as Exclude<Item, SectionHeader>;

  useInput((input, key) => {
    // ── Hotkey capture mode ──────────────────────────────────────────────
    if (capturing) {
      if (key.escape) {
        setCapturing(false);
        setStatusMsg('Cancelled');
        return;
      }
      const captured = captureHotkey(input, key);
      if (captured) {
        const item = currentItem as HotkeySetting;
        persistHotkey(item.action, captured);
        setCapturing(false);
      }
      return;
    }

    // ── String editor mode ───────────────────────────────────────────────
    if (editing) {
      if (key.escape) {
        setEditing(false);
        return;
      }
      if (key.return) {
        const item = currentItem as StrSetting<keyof Config>;
        persistGeneral(item.key, editBuf as Config[typeof item.key]);
        setEditing(false);
        return;
      }
      if (key.backspace || key.delete) {
        setEditBuf((b) => b.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setEditBuf((b) => b + input);
      }
      return;
    }

    // ── Navigation ───────────────────────────────────────────────────────
    if (key.upArrow || input === 'k') {
      setSelectedIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelectedIdx((i) => Math.min(SELECTABLE.length - 1, i + 1));
      return;
    }

    // ── Actions per item kind ────────────────────────────────────────────
    if (currentItem.kind === 'int') {
      const s = currentItem as IntSetting<'defaultVolume'>;
      const curr = cfg[s.key] as number;
      if (key.rightArrow || input === 'l') {
        persistGeneral(
          s.key,
          Math.min(s.max, curr + s.step) as Config[typeof s.key],
        );
        return;
      }
      if (key.leftArrow || input === 'h') {
        persistGeneral(
          s.key,
          Math.max(s.min, curr - s.step) as Config[typeof s.key],
        );
        return;
      }
    }

    if (currentItem.kind === 'enum') {
      const s = currentItem as EnumSetting<'audioFormat'>;
      const opts = s.options;
      const currIdx = opts.findIndex((o) => o.value === cfg[s.key]);
      if (key.rightArrow || input === 'l') {
        const next = opts[(currIdx + 1) % opts.length]!;
        persistGeneral(s.key, next.value as Config[typeof s.key]);
        return;
      }
      if (key.leftArrow || input === 'h') {
        const next = opts[(currIdx - 1 + opts.length) % opts.length]!;
        persistGeneral(s.key, next.value as Config[typeof s.key]);
        return;
      }
    }

    if (currentItem.kind === 'str' && key.return) {
      const s = currentItem as StrSetting<keyof Config>;
      setEditBuf(String(cfg[s.key] ?? ''));
      setEditing(true);
      return;
    }

    // Enter on a hotkey → capture mode
    if (currentItem.kind === 'hotkey' && key.return) {
      setCapturing(true);
      setStatusMsg('Press a key to bind — Esc to cancel');
      return;
    }

    // 'x' on a hotkey → reset to default
    if (currentItem.kind === 'hotkey' && input === 'x') {
      const item = currentItem as HotkeySetting;
      const def = DEFAULT_HOTKEYS[item.action];
      persistHotkey(item.action, def);
      return;
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
      <Text bold color="cyan">
        Settings
      </Text>
      <Text dimColor>Saved automatically to ~/.ytui/config.json</Text>
      <Text> </Text>

      {ALL_ITEMS.map((item, allIdx) => {
        // Section headers
        if (item.kind === 'section') {
          return (
            <Box key={`section-${item.label}`} marginTop={1} marginBottom={0}>
              <Text bold color="cyan">
                ─ {item.label}{' '}
              </Text>
            </Box>
          );
        }

        const selectablePos = SELECTABLE.indexOf(allIdx);
        const isSelected = selectablePos === selectedIdx;

        // General settings (int / enum / str)
        if (item.kind !== 'hotkey') {
          const setting = item as GeneralSetting;
          const rawValue = cfg[setting.key];
          let valueDisplay: string;
          if (setting.kind === 'int') {
            valueDisplay = String(rawValue);
          } else if (setting.kind === 'enum') {
            const opt = (
              setting as EnumSetting<typeof setting.key>
            ).options.find((o) => o.value === rawValue);
            valueDisplay = opt?.label ?? String(rawValue);
          } else {
            const strVal = String(rawValue ?? '');
            const isSecret = setting.key === 'youtubeApiKey';
            const masked = isSecret ? maskSecret(strVal) : strVal;
            valueDisplay = masked ||
              (setting as StrSetting<typeof setting.key>).placeholder;
          }

          const isEditingThis = isSelected && editing;

          return (
            <Box
              key={setting.key}
              flexDirection="column"
              marginBottom={isSelected ? 1 : 0}
            >
              <Box gap={2}>
                <Text color={isSelected ? 'yellow' : 'white'} bold={isSelected}>
                  {isSelected ? '▶ ' : '  '}
                  {setting.label.padEnd(22)}
                </Text>
                {isEditingThis ? (
                  <Box>
                    <Text color="cyan">{editBuf}</Text>
                    <Text color="cyan" inverse>
                      {' '}
                    </Text>
                  </Box>
                ) : (
                  <Text color={isSelected ? 'green' : 'white'}>
                    {setting.kind === 'enum' || setting.kind === 'int'
                      ? `◀ ${valueDisplay} ▶`
                      : valueDisplay}
                  </Text>
                )}
              </Box>
              {isSelected && (
                <Text dimColor>
                  {'    '}
                  {setting.description}
                  {setting.kind === 'str' && !editing
                    ? '  [Enter to edit]'
                    : ''}
                  {setting.kind === 'str' && editing
                    ? '  [Enter to save · Esc to cancel]'
                    : ''}
                </Text>
              )}
            </Box>
          );
        }

        // Hotkey setting
        const hk = item as HotkeySetting;
        const currentBinding = displayHotkey(hotkeys[hk.action]);
        const isCapturingThis = isSelected && capturing;

        return (
          <Box
            key={hk.action}
            flexDirection="column"
            marginBottom={isSelected ? 1 : 0}
          >
            <Box gap={2}>
              <Text color={isSelected ? 'yellow' : 'white'} bold={isSelected}>
                {isSelected ? '▶ ' : '  '}
                {hk.label.padEnd(22)}
              </Text>
              {isCapturingThis ? (
                <Text color="magenta" bold>
                  Press a key…
                </Text>
              ) : (
                <Text color={isSelected ? 'green' : 'white'}>
                  {currentBinding}
                </Text>
              )}
            </Box>
            {isSelected && !capturing && (
              <Text dimColor>
                {'    '}
                {hk.description}
                {'  [Enter to rebind · x to reset]'}
              </Text>
            )}
          </Box>
        );
      })}

      <Text> </Text>
      <Text dimColor>
        j/k ↑↓ navigate · h/l ←→ change · Enter edit/rebind · x reset hotkey
      </Text>
    </Box>
  );
}
