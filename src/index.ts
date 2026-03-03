import { ensureYtDlp } from './lib/ytdlp';
import { ensureFfmpeg, ensureFfplay } from './lib/ffmpeg';
import { startTui } from './tui/index';
import { openDb } from './db/index';

async function main(): Promise<void> {
  openDb();
  await ensureYtDlp((msg) => process.stderr.write(msg + '\n'));
  await ensureFfmpeg((msg) => process.stderr.write(msg + '\n'));
  await ensureFfplay((msg) => process.stderr.write(msg + '\n'));
  startTui();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
