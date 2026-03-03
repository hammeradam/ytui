/**
 * commands.ts — the only place in the codebase allowed to send mpv IPC commands.
 *
 * UI and store layers import named commands. The mpv transport never leaks upward.
 */

type SendFn = (command: any[], request_id?: number) => void;

let _send: SendFn | null = null;

/** Called once by the socket layer after the connection is established. */
export function registerSend(fn: SendFn): void {
  _send = fn;
}

function send(command: any[]): void {
  _send?.(command);
}

export const commands = {
  loadFile: (filePath: string) =>
    send(['loadfile', filePath]),

  pause: () =>
    send(['set_property', 'pause', true]),

  resume: () =>
    send(['set_property', 'pause', false]),

  toggle: () =>
    send(['cycle', 'pause']),

  seek: (seconds: number) =>
    send(['seek', seconds, 'relative']),

  seekAbsolute: (seconds: number) =>
    send(['seek', seconds, 'absolute']),

  stop: () =>
    send(['stop']),

  setVolume: (volume: number) =>
    send(['set_property', 'volume', volume]),

  next: () =>
    send(['playlist-next']),
} as const;
