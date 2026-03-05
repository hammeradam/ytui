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

  // Derive scroll offset for this render as a pure local value — never
  // mutate the ref during render (React may call render multiple times).
  // Only scroll the window when the selection moves out of view.
  const maxOffset = Math.max(0, items.length - height);
  let scrollOffset = scrollOffsetRef.current;
  if (selectedIndex < scrollOffset) {
    scrollOffset = selectedIndex;
  } else if (selectedIndex >= scrollOffset + height) {
    scrollOffset = selectedIndex - height + 1;
  }
  scrollOffset = Math.min(scrollOffset, maxOffset);
  // Sync back after render so the next render starts from the right place.
  scrollOffsetRef.current = scrollOffset;

  useInput((input, key) => {
    if (key.downArrow || input === 'j') {
      onSelect(Math.min(selectedIndex + 1, items.length - 1));
    } else if (key.upArrow || input === 'k') {
      onSelect(Math.max(selectedIndex - 1, 0));
    } else if (input === 'g') {
      onSelect(0);
    } else if (input === 'G') {
      onSelect(items.length - 1);
    }
  }, { isActive });

  const visible = items.slice(scrollOffset, scrollOffset + height);

  return (
    <Box flexDirection="column" height={height} overflow="hidden">
      {visible.map((item, vi) => {
        const absIdx = vi + scrollOffset;
        return (
          <Box key={absIdx}>
            {renderItem(item, absIdx, absIdx === selectedIndex)}
          </Box>
        );
      })}
    </Box>
  );
}
