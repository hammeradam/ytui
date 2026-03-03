import { eq } from 'drizzle-orm';

import { getDb, schema } from '../db/index';
import { downloadAudio, fetchVideoInfo, type DownloadProgress } from './ytdlp';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DownloadStatus = 'pending' | 'downloading' | 'done' | 'error';

export type DownloadJob = {
  id: string;           // YouTube video ID
  title: string;
  channel: string;
  duration: number;
  status: DownloadStatus;
  progress: number;     // 0-100
  speed: string;
  eta: string;
  error: string;
  addedAt: number;      // Date.now()
};

type DownloaderCallbacks = {
  onUpdate: (jobs: DownloadJob[]) => void;
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const _queue: DownloadJob[] = [];
let _running = false;
let _callbacks: DownloaderCallbacks | null = null;

function emit(): void {
  _callbacks?.onUpdate([..._queue]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function setDownloaderCallbacks(cb: DownloaderCallbacks): void {
  _callbacks = cb;
}

/** Add a video to the download queue. No-op if already queued/downloading/done. */
export function enqueue(item: {
  id: string;
  title: string;
  channel: string;
  duration: number;
}): void {
  const existing = _queue.find((j) => j.id === item.id);
  if (existing) return;

  _queue.push({
    id: item.id,
    title: item.title,
    channel: item.channel,
    duration: item.duration,
    status: 'pending',
    progress: 0,
    speed: '',
    eta: '',
    error: '',
    addedAt: Date.now(),
  });
  emit();
  void tick();
}

/** Add by URL or video ID — fetches metadata first if needed. */
export async function enqueueUrl(urlOrId: string): Promise<void> {
  const id = extractVideoId(urlOrId);
  if (id && _queue.find((j) => j.id === id)) return;

  // Check DB first to avoid re-download
  if (id) {
    const db = getDb();
    const existing = await db
      .select()
      .from(schema.tracks)
      .where(eq(schema.tracks.id, id))
      .limit(1);
    if (existing.length > 0) return; // already downloaded
  }

  const info = await fetchVideoInfo(urlOrId);
  enqueue(info);
}

export function getQueue(): DownloadJob[] {
  return [..._queue];
}

export function removeFromQueue(videoId: string): void {
  const idx = _queue.findIndex((j) => j.id === videoId && j.status !== 'downloading');
  if (idx >= 0) {
    _queue.splice(idx, 1);
    emit();
  }
}

// ---------------------------------------------------------------------------
// Internal worker
// ---------------------------------------------------------------------------

function extractVideoId(urlOrId: string): string | null {
  const s = urlOrId.trim();
  const m = s.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
  if (m) return m[1]!;
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  return null;
}

async function tick(): Promise<void> {
  if (_running) return;
  const next = _queue.find((j) => j.status === 'pending');
  if (!next) return;

  _running = true;
  next.status = 'downloading';
  emit();

  try {
    const result = await downloadAudio(next.id, (p: DownloadProgress) => {
      next.progress = p.percent;
      next.speed = p.speed;
      next.eta = p.eta;
      emit();
    });

    // Persist to DB
    const db = getDb();
    await db
      .insert(schema.tracks)
      .values({
        id: next.id,
        title: next.title,
        channel: next.channel,
        duration: next.duration,
        filePath: result.filePath,
        fileExt: result.fileExt,
        thumbnailUrl: '',
        downloadedAt: new Date().toISOString(),
        fileSize: result.fileSize,
      })
      .onConflictDoUpdate({
        target: schema.tracks.id,
        set: {
          filePath: result.filePath,
          fileExt: result.fileExt,
          fileSize: result.fileSize,
          downloadedAt: new Date().toISOString(),
        },
      });

    next.status = 'done';
    next.progress = 100;
    next.speed = '';
    next.eta = '';
  } catch (e: unknown) {
    next.status = 'error';
    next.error = String((e as Error)?.message ?? e);
  }

  _running = false;
  emit();
  // Process next pending job
  void tick();
}
