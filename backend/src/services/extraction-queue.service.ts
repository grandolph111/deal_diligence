/**
 * Durable, priority-ordered extraction queue.
 *
 * The Document table *is* the queue: `processingStatus = 'PENDING'` rows are jobs.
 * A worker claims the highest-priority pending document atomically
 * (`FOR UPDATE SKIP LOCKED`), so the queue is:
 *   - **priority-ordered** — P0 (critical) before P3 (bulk),
 *   - **concurrency-capped** — never fire 50 extractions at once and melt the rate limit,
 *   - **durable** — survives restarts (state is in Postgres, not memory),
 *   - **multi-instance safe** — SKIP LOCKED means two servers never grab the same job.
 *
 * `notify()` pumps immediately (low latency for a single upload); `startWorker()`
 * adds a periodic pump so any backlog (e.g. after a crash) drains on its own.
 */

import { prisma } from '../config/database';
import { extractionService } from './extraction.service';

const CONCURRENCY = Math.max(1, parseInt(process.env.EXTRACTION_CONCURRENCY || '8', 10));
const POLL_MS = Math.max(1000, parseInt(process.env.EXTRACTION_POLL_MS || '5000', 10));

let inFlight = 0;
let pumping = false;
let started = false;

/** Atomically claim the next highest-priority PENDING document (→ PROCESSING). */
const claimNext = async (): Promise<string | null> => {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    UPDATE "Document" SET "processingStatus" = 'PROCESSING', "lastError" = NULL
    WHERE "id" = (
      SELECT "id" FROM "Document"
      WHERE "processingStatus" = 'PENDING'
      ORDER BY "priority" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id"`;
  return rows[0]?.id ?? null;
};

const runOne = async (documentId: string): Promise<void> => {
  try {
    // Already claimed (PROCESSING) by claimNext — go straight to processing.
    await extractionService.process(documentId);
  } catch (err) {
    // process() handles its own errors/retries; this is a last-resort guard.
    // eslint-disable-next-line no-console
    console.error(`[queue] process ${documentId} threw:`, err instanceof Error ? err.message : err);
  } finally {
    inFlight -= 1;
    void pump();
  }
};

/**
 * Claim and dispatch jobs up to the concurrency cap. Re-entrant-guarded so the
 * `inFlight` accounting stays exact (single-threaded JS + the `pumping` flag mean
 * the cap is never exceeded).
 */
const pump = async (): Promise<void> => {
  if (pumping) return;
  pumping = true;
  try {
    while (inFlight < CONCURRENCY) {
      const id = await claimNext();
      if (!id) break;
      inFlight += 1;
      void runOne(id);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[queue] pump error:', err instanceof Error ? err.message : err);
  } finally {
    pumping = false;
  }
};

export const extractionQueue = {
  /** Nudge the queue to drain now (call after enqueuing / confirming an upload). */
  notify(): void {
    void pump();
  },

  /** Start the periodic durability poller + drain any existing backlog. */
  startWorker(): void {
    if (started) return;
    started = true;
    setInterval(() => this.notify(), POLL_MS).unref?.();
    this.notify();
    // eslint-disable-next-line no-console
    console.log(`✓ Extraction queue started (concurrency=${CONCURRENCY}, poll=${POLL_MS}ms)`);
  },

  /** Observability. */
  stats(): { inFlight: number; concurrency: number } {
    return { inFlight, concurrency: CONCURRENCY };
  },
};
