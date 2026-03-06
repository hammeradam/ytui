import React from 'react';
import { Box, Text } from 'ink';

import { useStore, type EqBand } from '../../store/index';

/**
 * Draw a vertical slider bar for a single EQ band.
 * Height is fixed at 9 units (representing -12 to +12 dB).
 * Returns an array of strings representing lines from top to bottom.
 */
function drawVerticalSlider(gain: number, height: number = 9): string[] {
  // Map gain (-12 to +12) to position (0 to height-1)
  // 0 dB is in the middle
  const center = (height - 1) / 2;
  const position = Math.round(center + (gain / 12) * center);
  const clamped = Math.max(0, Math.min(height - 1, position));

  const bars: string[] = [];
  for (let i = height - 1; i >= 0; i--) {
    if (i === clamped) {
      bars.push('●'); // filled circle for current position
    } else if (i === Math.round(center)) {
      bars.push('─'); // dash for center (0 dB)
    } else {
      bars.push('│'); // vertical bar
    }
  }

  return bars;
}

function displayGain(gain: number): string {
  return gain > 0 ? `+${gain.toFixed(1)} dB` : `${gain.toFixed(1)} dB`;
}

export function EqView(): React.ReactElement {
  const eqBands = useStore((s) => s.eqBands);
  const selectedBand = useStore((s) => s.eqSelectedBand);
  const eqPresets = useStore((s) => s.eqPresets);
  const eqPresetViewOpen = useStore((s) => s.eqPresetViewOpen);
  const eqPresetSelectedIndex = useStore((s) => s.eqPresetSelectedIndex);
  const eqSavePresetMode = useStore((s) => s.eqSavePresetMode);
  const eqPresetNameInput = useStore((s) => s.eqPresetNameInput);

  // Fixed height for all sliders
  const sliderHeight = 9;

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
      <Text bold color="cyan">Equalizer (← → select, ↑ ↓ adjust)</Text>

      {/* Slider area */}
      <Box gap={1} alignItems="flex-start">
        {eqBands.map((band, idx) => {
          const sliderLines = drawVerticalSlider(band.gain, sliderHeight);

          return (
            <Box
              key={idx}
              flexDirection="column"
              width={13}
              flexShrink={0}
              borderStyle="round"
              borderColor={selectedBand === idx ? 'yellow' : 'gray'}
            >
              <Box flexDirection="column"  paddingBottom={1}>
                {sliderLines.map((line, i) => (
                  <Box key={i} justifyContent="center">
                    <Text>{line}</Text>
                  </Box>
                ))}
              </Box>

              <Box justifyContent="center">
                <Text color={selectedBand === idx ? 'yellow' : 'gray'} dimColor={selectedBand !== idx}>
                  {displayGain(band.gain)}
                </Text>
              </Box>
              <Box justifyContent="center">
                <Text color={selectedBand === idx ? 'yellow' : 'gray'} dimColor={selectedBand !== idx}>
                  {band.label}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Text dimColor> </Text>

      {/* Preset save mode */}
      {eqSavePresetMode ? (
        <Box flexDirection="column" gap={0} borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text bold color="yellow">Save Preset As:</Text>
          <Text color="white">{'>>'} {eqPresetNameInput}_</Text>
          <Text dimColor>Enter name, then press Return to save. Press Escape to cancel.</Text>
        </Box>
      ) : eqPresetViewOpen ? (
        <Box flexDirection="column" gap={0} borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text bold color="cyan">Presets (↑↓ to select, Enter to load, 's' to save, 'd' to delete):</Text>
          {eqPresets.length === 0 ? (
            <Text dimColor>No presets saved yet</Text>
          ) : (
            eqPresets.map((p, idx) => (
              <Text key={p.name} color={eqPresetSelectedIndex === idx ? 'yellow' : 'white'}>
                {eqPresetSelectedIndex === idx ? '> ' : '  '}{p.name}
              </Text>
            ))
          )}
        </Box>
      ) : (
        <Text dimColor>Press 'p' to open presets</Text>
      )}

      <Text dimColor>Press 'e' to close the EQ panel</Text>
    </Box>
  );
}
