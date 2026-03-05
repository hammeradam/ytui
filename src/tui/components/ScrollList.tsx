import React, { useLayoutEffect, useRef } from 'react';
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

  // Derive the scroll offset for this render without mutating the ref.
  // The ref is updated after the render is committed (useLayoutEffect) so
  // it is ready for the next render — but never mutated mid-render.
  const maxOffset = Math.max(0, items.length - height);
  let scrollOffset = scrollOffsetRef.current;
  if (selectedIndex < scrollOffset) {
    scrollOffset = selectedIndex;
  } else if (selectedIndex >= scrollOffset + height) {
    scrollOffset = selectedIndex - height + 1;
  }
  scrollOffset = Math.min(scrollOffset, maxOffset);

  useLayoutEffect(() => {
    scrollOffsetRef.current = scrollOffset;
  });

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
