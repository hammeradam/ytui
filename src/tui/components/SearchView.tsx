import React, { useState, useCallback, useRef } from 'react';
import { Box, Text, useInput } from 'ink';

import { useStore } from '../../store/index';
import { searchYouTube, formatDuration } from '../../lib/ytdlp';
import { enqueue, enqueueUrl } from '../../lib/downloader';
import { ScrollList } from './ScrollList';

type Props = { height: number };

export function SearchView({ height }: Props): React.ReactElement {
  const [inputVal, setInputVal] = useState('');
  const [inputFocused, setInputFocused] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const results = useStore((s) => s.searchResults);
  const loading = useStore((s) => s.searchLoading);
  const error = useStore((s) => s.searchError);
  const setResults = useStore((s) => s.setSearchResults);
  const setLoading = useStore((s) => s.setSearchLoading);
  const setError = useStore((s) => s.setSearchError);
  const setStatusMsg = useStore((s) => s.setStatusMsg);
  const downloadedIds = useStore((s) => s.tracks.map((t) => t.id).join(','));
  const searchResultsLimit = useStore((s) => s.settings.searchResultsLimit);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = useCallback(
    async (q: string) => {
      if (!q.trim()) { setResults([]); return; }
      setLoading(true);
      setError('');
      try {
        const res = await searchYouTube(q.trim(), searchResultsLimit);
        setResults(res);
        setSelectedIdx(0);
      } catch (e: unknown) {
        setError(String((e as Error)?.message ?? e));
      } finally {
        setLoading(false);
      }
    },
    [setResults, setLoading, setError],
  );

  useInput(
    (input, key) => {
      if (inputFocused) {
        if (key.return) {
          // Submit search or enqueue URL if YouTube link detected
          if (debounceRef.current) clearTimeout(debounceRef.current);
          const q = inputVal.trim();
          if (q.includes('youtu')) {
            setInputFocused(false);
            setStatusMsg('Fetching video info…');
            void enqueueUrl(q).then(() => setStatusMsg('Queued!')).catch((e: unknown) => setStatusMsg(`Error: ${String((e as Error)?.message ?? e)}`));
          } else {
            void doSearch(q);
            setInputFocused(false);
          }
          return;
        }
        if (key.escape) { setInputFocused(false); return; }
        if (key.backspace || key.delete) {
          setInputVal((v) => v.slice(0, -1));
          return;
        }
        if (!key.ctrl && !key.meta && input) {
          setInputVal((v) => v + input);
          // Debounce auto-search
          if (debounceRef.current) clearTimeout(debounceRef.current);
          debounceRef.current = setTimeout(() => void doSearch(inputVal + input), 400);
          return;
        }
        return;
      }

      // List navigation mode
      if (input === '/') { setInputFocused(true); return; }
      if (key.return) {
        const item = results[selectedIdx];
        if (item) {
          enqueue(item);
          setStatusMsg(`Queued: ${item.title}`);
        }
        return;
      }
    },
  );

  const listHeight = height - 3; // subtract input + padding

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Search input */}
      <Box borderStyle="single" borderColor={inputFocused ? 'cyan' : 'gray'} paddingX={1}>
        <Text color="white">{'> '}</Text>
        <Text>{inputVal}</Text>
        {inputFocused && <Text color="cyan">█</Text>}
      </Box>

      {/* Hints */}
      <Box>
        {loading && <Text color="yellow"> Searching…</Text>}
        {error && <Text color="red"> {error}</Text>}
        {!loading && !error && results.length === 0 && inputVal && (
          <Text color="white"> No results</Text>
        )}
        {!loading && !error && results.length > 0 && (
          <Text color="white"> {results.length} results · Enter to download · / to search</Text>
        )}
        {!inputVal && !loading && (
          <Text color="white"> Type to search YouTube · paste a URL to download directly</Text>
        )}
      </Box>

      {/* Results */}
      <ScrollList
        items={results}
        selectedIndex={selectedIdx}
        onSelect={setSelectedIdx}
        height={listHeight}
        isActive={!inputFocused}
        renderItem={(item, _idx, isSelected) => (
          <Box>
            <Text
              backgroundColor={isSelected ? 'blue' : undefined}
              color={isSelected ? 'white' : undefined}
            >
              {isSelected ? '▶ ' : '  '}
              <Text color="green">{downloadedIds.includes(item.id) ? '✓ ' : '  '}</Text>
              <Text bold={isSelected}>{item.title.slice(0, 53).padEnd(53)}</Text>
              {'  '}
              <Text color="white">{item.channel.slice(0, 20).padEnd(20)}</Text>
              {'  '}
              <Text color="cyan">{formatDuration(item.duration)}</Text>
            </Text>
          </Box>
        )}
      />
    </Box>
  );
}
