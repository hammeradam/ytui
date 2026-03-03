/**
 * mpv.ts — raw socket layer.
 *
 * Responsibilities:
 *   1. Connect to the mpv IPC socket.
 *   2. Register the send function with the commands module.
 *   3. Route incoming messages to the adapter.
 *
 * Nothing here touches the store or business logic.
 */

import { registerSend } from './commands';
import { handleRawMessage } from './mpv-adapter';

export async function connectMpv(socketPath = '/tmp/mpv.sock'): Promise<() => void> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let buffer = '';
  let sock: any;

  const connection = await Bun.connect({
    unix: socketPath,
    socket: {
      open(s) {
        sock = s;
        registerSend((command, request_id) => {
          s.write(encoder.encode(JSON.stringify({ command, request_id }) + '\n'));
        });
        observeProperties();
      },

      data(_s, data) {
        buffer += decoder.decode(data);
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            handleRawMessage(JSON.parse(line));
          } catch { /* malformed JSON — ignore */ }
        }
      },
    },
  });

  function observeProperties() {
    const observe = (id: number, prop: string) =>
      sock?.write(encoder.encode(JSON.stringify({ command: ['observe_property', id, prop] }) + '\n'));
    observe(1, 'media-title');
    observe(2, 'pause');
    observe(3, 'playback-time');
    observe(4, 'duration');
    observe(5, 'volume');
  }

  return () => connection.end();
}

