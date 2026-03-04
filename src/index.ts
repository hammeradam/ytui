import { ensureYtDlp } from './lib/ytdlp';
import { startTui } from './tui/index';
import { getDb } from './db/index';
import { player } from './lib/mpv-player';

async function main(): Promise<void> {
  getDb();
  await ensureYtDlp((msg) => process.stderr.write(msg + '\n'));
  await player.init();
  startTui();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
