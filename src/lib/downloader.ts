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
// Downloader
// ---------------------------------------------------------------------------

class Downloader {
  private queue:     DownloadJob[]          = [];
  private running:   boolean                = false;
  private callbacks: DownloaderCallbacks | null = null;

  private emit(): void {
    this.callbacks?.onUpdate([...this.queue]);
  }

  setCallbacks(cb: DownloaderCallbacks): void {
    this.callbacks = cb;
  }

  /** Add a video to the download queue. No-op if already queued/downloading/done. */
  enqueue(item: { id: string; title: string; channel: string; duration: number }): void {
    if (this.queue.find((j) => j.id === item.id)) return;

    this.queue.push({
      ...item,
      status: 'pending',
      progress: 0,
      speed: '',
      eta: '',
      error: '',
      addedAt: Date.now(),
    });
    this.emit();
    void this.tick();
  }

  /** Add by URL or video ID — fetches metadata first if needed. */
  async enqueueUrl(urlOrId: string): Promise<void> {
    const id = this.extractVideoId(urlOrId);
    if (id && this.queue.find((j) => j.id === id)) return;

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
    this.enqueue(info);
  }

  getQueue(): DownloadJob[] {
    return [...this.queue];
  }

  removeFromQueue(videoId: string): void {
    const idx = this.queue.findIndex((j) => j.id === videoId && j.status !== 'downloading');
    if (idx >= 0) {
      this.queue.splice(idx, 1);
      this.emit();
    }
  }

  /** Reset an errored job back to pending so it will be retried. */
  retryJob(videoId: string): void {
    const job = this.queue.find((j) => j.id === videoId && j.status === 'error');
    if (!job) return;
    job.status = 'pending';
    job.progress = 0;
    job.speed = '';
    job.eta = '';
    job.error = '';
    this.emit();
    void this.tick();
  }

  private extractVideoId(urlOrId: string): string | null {
    const s = urlOrId.trim();
    const m = s.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    if (m) return m[1]!;
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
    return null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    const next = this.queue.find((j) => j.status === 'pending');
    if (!next) return;

    this.running = true;
    next.status = 'downloading';
    this.emit();

    try {
      const result = await downloadAudio(next.id, (p: DownloadProgress) => {
        next.progress = p.percent;
        next.speed = p.speed;
        next.eta = p.eta;
        this.emit();
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

    this.running = false;
    this.emit();
    // Process next pending job
    void this.tick();
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const downloader = new Downloader();
