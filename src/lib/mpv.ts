import { usePlayerStore } from '../store/mpv-store';

type ClientOptions = {
  onTrackEnd?: () => void;
};

export const createClient = async (opts: ClientOptions = {}) => {
  const socketPath = '/tmp/mpv.sock';
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let buffer = '';
  let socket: any;

  const client = await Bun.connect({
    unix: socketPath,
    socket: {
      open(sock) {
        socket = sock;
        observeProperties();
      },

      data(sock, data) {
        buffer += decoder.decode(data);

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          const message = JSON.parse(line);
          handleMessage(message);
        }
      },
    },
  });

  function send(command: any[], request_id?: number) {
    socket.write(
      encoder.encode(JSON.stringify({ command, request_id }) + '\n'),
    );
  }

  function loadFile(filePath: string) {
    send(['loadfile', filePath]);
  }

  function pause() {
    send(['set_property', 'pause', true]);
  }

  // Resume
  function resume() {
    send(['set_property', 'pause', false]);
  }

  // Next track
  function nextTrack() {
    send(['playlist-next']);
  }

  // Set volume
  function setVolume(volume: number) {
    send(['set_property', 'volume', volume]);
  }

  // Seek forward 10 seconds
  function seek(seconds: number) {
    send(['seek', seconds, 'relative']);
  }

  function seekAbsolute(seconds: number) {
    send(['seek', seconds, 'absolute']);
  }

  function stop() {
    send(['stop']);
  }

  function observeProperties() {
    send(['observe_property', 1, 'media-title']);
    send(['observe_property', 2, 'pause']);
    send(['observe_property', 3, 'playback-time']);
    send(['observe_property', 4, 'duration']);
  }

  function handleMessage(msg: any) {
    if (msg.event === 'property-change') {
      const store = usePlayerStore.getState();
      switch (msg.name) {
        case 'media-title':
          store.setTitle(msg.data ?? '');
          break;
        case 'pause':
          store.setPause(!!msg.data);
          break;
        case 'playback-time':
          store.setPlaybackTime(msg.data ?? 0);
          break;
        case 'duration':
          store.setDuration(msg.data ?? 0);
          break;
      }
    } else if (msg.event === 'end-file' && msg.reason === 'eof') {
      opts.onTrackEnd?.();
    }
  }

  return {
    loadFile,
    pause,
    resume,
    nextTrack,
    seek,
    seekAbsolute,
    stop,
    setVolume,
  };
};
