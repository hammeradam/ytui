import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

import {
  updateConfig,
  CONFIG_DEFAULTS,
  type Config,
  type AudioFormat,
  type AudioQuality,
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

type AnySetting =
  | EnumSetting<'audioFormat'>
  | EnumSetting<'audioQuality'>
  | EnumSetting<'searchResultsLimit'>
  | IntSetting<'defaultVolume'>
  | StrSetting<'mpvSocketPath'>
  | StrSetting<'downloadDir'>;

const SETTINGS: AnySetting[] = [
  {
    kind: 'int',
    key: 'defaultVolume',
    label: 'Default volume',
    description: 'Starting playback volume (0–100)',
    min: 0, max: 100, step: 5,
  },
  {
    kind: 'enum',
    key: 'audioFormat',
    label: 'Audio format',
    description: 'Preferred container for downloaded audio',
    options: [
      { value: 'm4a' as AudioFormat,  label: 'm4a  (AAC, broad compatibility)' },
      { value: 'opus' as AudioFormat, label: 'opus (better quality at low bitrate)' },
      { value: 'best' as AudioFormat, label: 'best (let yt-dlp decide)' },
    ],
  },
  {
    kind: 'enum',
    key: 'audioQuality',
    label: 'Audio quality',
    description: 'Maximum bitrate requested from yt-dlp',
    options: [
      { value: 'best' as AudioQuality,  label: 'best (highest available)' },
      { value: '256k' as AudioQuality,  label: '256k' },
      { value: '192k' as AudioQuality,  label: '192k' },
      { value: '128k' as AudioQuality,  label: '128k' },
    ],
  },
  {
    kind: 'enum',
    key: 'searchResultsLimit',
    label: 'Search results',
    description: 'Max number of results shown per search',
    options: [
      { value: 5,  label: '5' },
      { value: 10, label: '10' },
      { value: 20, label: '20' },
      { value: 25, label: '25' },
    ],
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SettingsView(): React.ReactElement {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editing, setEditing]         = useState(false);
  const [editBuf, setEditBuf]         = useState('');
  const setStatusMsg                  = useStore((s) => s.setStatusMsg);
  const setSettings                   = useStore((s) => s.setSettings);

  // Read from the store so useInput always sees the latest values
  const cfg = useStore((s) => s.settings);

  function persist<K extends keyof Config>(key: K, value: Config[K]) {
    const next = updateConfig(key, value);
    setSettings(next);
    setStatusMsg(`Saved: ${key}`);
  }

  useInput((input, key) => {
    // ── String editor mode ───────────────────────────────────────────────
    if (editing) {
      if (key.escape) { setEditing(false); return; }
      if (key.return) {
        const setting = SETTINGS[selectedIdx] as StrSetting<keyof Config>;
        persist(setting.key, editBuf as Config[typeof setting.key]);
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
      setSelectedIdx((i) => Math.min(SETTINGS.length - 1, i + 1));
      return;
    }

    const setting = SETTINGS[selectedIdx]!;

    // ── Int: +/- or left/right ────────────────────────────────────────────
    if (setting.kind === 'int') {
      const s = setting as IntSetting<'defaultVolume'>;
      const curr = cfg[s.key] as number;
      if (key.rightArrow || input === 'l') {
        persist(s.key, Math.min(s.max, curr + s.step) as Config[typeof s.key]);
        return;
      }
      if (key.leftArrow || input === 'h') {
        persist(s.key, Math.max(s.min, curr - s.step) as Config[typeof s.key]);
        return;
      }
    }

    // ── Enum: left/right cycles options ──────────────────────────────────
    if (setting.kind === 'enum') {
      const s = setting as EnumSetting<'audioFormat'>;
      const opts = s.options;
      const currIdx = opts.findIndex((o) => o.value === cfg[s.key]);
      if (key.rightArrow || input === 'l') {
        const next = opts[(currIdx + 1) % opts.length]!;
        persist(s.key, next.value as Config[typeof s.key]);
        return;
      }
      if (key.leftArrow || input === 'h') {
        const next = opts[(currIdx - 1 + opts.length) % opts.length]!;
        persist(s.key, next.value as Config[typeof s.key]);
        return;
      }
    }

    // ── String: Enter to start editing ───────────────────────────────────
    if (setting.kind === 'str' && key.return) {
      const s = setting as StrSetting<keyof Config>;
      setEditBuf(String(cfg[s.key] ?? ''));
      setEditing(true);
      return;
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
      <Text bold color="cyan">Settings</Text>
      <Text dimColor>Saved automatically to ~/.ytui/config.json</Text>
      <Text> </Text>

      {SETTINGS.map((setting, i) => {
        const isSelected = i === selectedIdx;
        const rawValue = cfg[setting.key];

        let valueDisplay: string;
        if (setting.kind === 'int') {
          valueDisplay = String(rawValue);
        } else if (setting.kind === 'enum') {
          const opt = (setting as EnumSetting<typeof setting.key>).options.find(
            (o) => o.value === rawValue,
          );
          valueDisplay = opt?.label ?? String(rawValue);
        } else {
          valueDisplay = String(rawValue || (setting as StrSetting<typeof setting.key>).placeholder);
        }

        const isEditingThis = isSelected && editing;

        return (
          <Box key={setting.key} flexDirection="column" marginBottom={isSelected ? 1 : 0}>
            <Box gap={2}>
              <Text color={isSelected ? 'yellow' : 'white'} bold={isSelected}>
                {isSelected ? '▶ ' : '  '}{setting.label.padEnd(22)}
              </Text>
              {isEditingThis ? (
                <Box>
                  <Text color="cyan">{editBuf}</Text>
                  <Text color="cyan" inverse> </Text>
                </Box>
              ) : (
                <Text color={isSelected ? 'green' : 'white'}>
                  {setting.kind === 'enum'
                    ? `◀ ${valueDisplay} ▶`
                    : setting.kind === 'int'
                    ? `◀ ${valueDisplay} ▶`
                    : valueDisplay}
                </Text>
              )}
            </Box>
            {isSelected && (
              <Text dimColor>
                {'    '}{setting.description}
                {setting.kind === 'str' && !editing ? '  [Enter to edit]' : ''}
                {setting.kind === 'str' && editing ? '  [Enter to save · Esc to cancel]' : ''}
              </Text>
            )}
          </Box>
        );
      })}

      <Text> </Text>
      <Text dimColor>j/k or ↑↓ navigate  ·  h/l or ←→ change value  ·  Enter edit text</Text>
    </Box>
  );
}
