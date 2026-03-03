import { ensureYtDlp } from './lib/ytdlp';
import { startTui } from './tui/index';
import { openDb } from './db/index';
import { init as initMpv } from './lib/mpv-player';

async function main(): Promise<void> {
  openDb();
  await ensureYtDlp((msg) => process.stderr.write(msg + '\n'));
  await initMpv();
  startTui();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
