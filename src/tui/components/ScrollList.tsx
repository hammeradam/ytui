import React, { useRef } from 'react';
import { Box, useInput } from 'ink';

type Props<T> = {
  items: T[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  height: number;
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  isActive?: boolean;
};

export function ScrollList<T>({
  items,
  selectedIndex,
  onSelect,
  height,
  renderItem,
  isActive = true,
}: Props<T>): React.ReactElement {
  const scrollOffsetRef = useRef(0);

  // Keep selected item in view
  const maxOffset = Math.max(0, items.length - height);
  if (selectedIndex < scrollOffsetRef.current) {
    scrollOffsetRef.current = selectedIndex;
  } else if (selectedIndex >= scrollOffsetRef.current + height) {
    scrollOffsetRef.current = selectedIndex - height + 1;
  }
  scrollOffsetRef.current = Math.min(scrollOffsetRef.current, maxOffset);

  useInput((input, key) => {
    if (key.downArrow || input === 'j') {
      const next = Math.min(selectedIndex + 1, items.length - 1);
      onSelect(next);
    } else if (key.upArrow || input === 'k') {
      const next = Math.max(selectedIndex - 1, 0);
      onSelect(next);
    } else if (input === 'g') {
      onSelect(0);
    } else if (input === 'G') {
      onSelect(items.length - 1);
    }
  }, { isActive });

  const visible = items.slice(scrollOffsetRef.current, scrollOffsetRef.current + height);

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {visible.map((item, vi) => {
        const absIdx = vi + scrollOffsetRef.current;
        return (
          <Box key={absIdx}>
            {renderItem(item, absIdx, absIdx === selectedIndex)}
          </Box>
        );
      })}
    </Box>
  );
}
