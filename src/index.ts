import { ensureYtDlp } from './lib/ytdlp';
import { ensureMpv } from './lib/mpv-player';
import { startTui } from './tui/index';
import { getDb } from './db/index';
import { player } from './lib/mpv-player';

async function main(): Promise<void> {
  getDb();
  await ensureYtDlp((msg) => process.stderr.write(msg + '\n'));
  await ensureMpv((msg) => process.stderr.write(msg + '\n'));
  await player.init();
  startTui();
}

main().catch((e) => {
  console.error('Fatal error:', e);
  
  player.quit();
  process.exit(1);
});

const STOP_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];
for (const sig of STOP_SIGNALS) {
  process.on(sig, () => {
    console.log(`Received ${sig}, shutting down...`);
    player.quit();
    process.exit(0);
  });
}