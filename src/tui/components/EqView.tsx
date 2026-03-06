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

export function EqView(): React.ReactElement {
  const eqBands = useStore((s) => s.eqBands);
  const selectedBand = useStore((s) => s.eqSelectedBand);
  const eqPresets = useStore((s) => s.eqPresets);
  const eqPresetViewOpen = useStore((s) => s.eqPresetViewOpen);

  // Fixed height for all sliders
  const sliderHeight = 9;

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
      <Text bold color="cyan">Equalizer (← → select, ↑ ↓ adjust)</Text>
      <Text> </Text>

      {/* Slider area */}
      <Box gap={1} alignItems="flex-end">
        {eqBands.map((band, idx) => {
          const sliderLines = drawVerticalSlider(band.gain, sliderHeight);
          return (
            <Box
              key={idx}
              flexDirection="column"
              alignItems="center"
              borderStyle="round"
              borderColor={selectedBand === idx ? 'yellow' : 'gray'}
            >
              {/* Slider bars */}
              <Box flexDirection="column" marginBottom={1}>
                {sliderLines.map((line, i) => (
                  <Text key={i}>{line}</Text>
                ))}
              </Box>

              {/* Label and value */}
              <Text color={selectedBand === idx ? 'yellow' : 'white'} bold={selectedBand === idx}>
                {band.label}
              </Text>
              <Text color={selectedBand === idx ? 'yellow' : 'gray'} dimColor={selectedBand !== idx}>
                {band.gain > 0 ? '+' : ''}{band.gain.toFixed(1)} dB
              </Text>
            </Box>
          );
        })}
      </Box>

      <Text dimColor> </Text>

      {/* Preset list */}
      {eqPresetViewOpen ? (
        <Box flexDirection="column" gap={0} borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text bold color="cyan">Presets (↑↓ to select, Enter to load, 's' to save, 'd' to delete):</Text>
          {eqPresets.length === 0 ? (
            <Text dimColor>No presets saved yet</Text>
          ) : (
            eqPresets.map((p) => (
              <Text key={p.name} color="white">
                • {p.name}
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
