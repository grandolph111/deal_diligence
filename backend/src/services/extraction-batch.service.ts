/**
 * Asynchronous bulk extraction via the Message Batches API.
 *
 * Purpose is throughput at scale, not latency. A 10,000-document VDR dump is
 * ~45M output tokens; run interactively it contends with live traffic for the
 * same per-minute budget and takes the better part of a day. Batched, it costs
 * 50% less and runs on a separate, far higher throughput ceiling.
 *
 * **It only engages when the backlog is genuinely large.** Below the threshold
 * a batch is strictly worse than the live path: same token cost in wall-clock
 * terms, but results arrive in minutes-to-hours instead of seconds, for no
 * benefit. Small and medium VDRs stay entirely synchronous.
 *
 * Eligibility is deliberately narrow — a document must be all of:
 *   - **P2/P3, FULL depth** — bulk work nobody is watching a spinner for. P0/P1
 *     are material deal instruments; a banker waiting on one needs live
 *     progress, and no cost saving justifies a 24-hour worst case there.
 *   - **text-layer** — batch payloads carry the document inline, and the API
 *     caps a batch at 256 MB. Text is ~20 KB/doc; the same pages as base64 PDF
 *     images are two orders of magnitude larger and would blow the cap within a
 *     few hundred scans.
 *   - **single-call size** — windowed documents fan out into many calls plus a
 *     consolidation pass whose input depends on all of them, which is a
 *     dependency graph the batch API has no way to express.
 *
 * Everything else keeps the live path. That is the point: this is a relief
 * valve for bulk, not a replacement pipeline.
 */

import { prisma } from '../config/database';
import { config } from '../config';
import { s3Service } from './s3.service';
import { extractionService, prepareSource } from './extraction.service';
import { playbookService } from './playbook.service';
import { getClaudeClient, isMock } from '../integrations/claude/client';
import { pickExtractionModel } from '../integrations/claude/model-router';
import { buildExtractionPrompt } from '../integrations/claude/prompts/extraction';
import {
  extractionResponseSchema,
  classifyResponseSchema,
  type ExtractionResponse,
  type ClassifyResponse,
} from '../integrations/claude/schema';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { DocumentStatus } from '@prisma/client';

const num = (v: string | undefined, fallback: number): number => {
  const n = parseInt(v || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Backlog size at which batching starts paying for itself. Below this, the
 * live path finishes sooner than a batch would even be picked up.
 */
const MIN_BACKLOG = num(process.env.CLAUDE_BATCH_MIN_BACKLOG, 250);
/** Documents per batch. Far under the API's 100k/256MB ceilings, so a single
 *  failure loses a recoverable slice rather than the whole backlog. */
const MAX_PER_BATCH = num(process.env.CLAUDE_BATCH_MAX_DOCUMENTS, 1_000);
const POLL_MS = num(process.env.CLAUDE_BATCH_POLL_MS, 60_000);
/** Documents prepared (downloaded + parsed) concurrently before submission. */
const PREPARE_CONCURRENCY = num(process.env.CLAUDE_BATCH_PREPARE_CONCURRENCY, 8);

export let polling = false;
let submitting = false;
/** Poll failures tolerated before a batch is abandoned and its docs re-queued. */
const MAX_POLL_FAILURES = Math.max(
  2,
  parseInt(process.env.CLAUDE_BATCH_MAX_POLL_FAILURES || '5', 10)
);

const isBatchingEnabled = (): boolean =>
  process.env.CLAUDE_BATCH_ENABLED === 'true' && !isMock();

/** SQL fragment for the documents this path is willing to take. */
const ELIGIBLE_WHERE = `
  "processingStatus" = 'PENDING'
  AND "priority" IN ('P2', 'P3')
  AND "extractionDepth" = 'FULL'
  AND "duplicateOfId" IS NULL
`;

/**
 * How many pending bulk documents are waiting.
 *
 * Note this counts *candidates*, not confirmed-eligible documents: whether a
 * PDF has a usable text layer is only knowable after parsing it, which is far
 * too expensive to do just to answer "should we batch?". The count is therefore
 * an upper bound, and documents that turn out to be scans are released back to
 * the live queue during preparation.
 */
export const pendingBulkCount = async (): Promise<number> => {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM "Document" WHERE ${ELIGIBLE_WHERE}`
  );
  return Number(rows[0]?.count ?? 0);
};

interface PreparedRequest {
  documentId: string;
  customId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: any;
  model: string;
}

const sanitizeSchema = (schema: unknown): unknown => {
  if (typeof schema !== 'object' || schema === null) return schema;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = { ...(schema as any) };
  delete s.$schema;
  return s;
};

/**
 * Build one batch request for a document, or null if it turns out ineligible.
 *
 * Classification is folded into the extraction prompt rather than run as its
 * own batched phase. A second phase would double the worst-case turnaround
 * (each batch can take up to 24 hours) to save a call that costs a few hundred
 * Haiku tokens — the wrong trade for bulk documents where the document type
 * mostly selects a prompt variant.
 */
const prepareRequest = async (documentId: string): Promise<PreparedRequest | null> => {
  const document = await prisma.document.findUnique({ where: { id: documentId } });
  if (!document) return null;

  const bytes = await s3Service.getObjectBytes(document.s3Key);
  const source = await prepareSource({
    filename: document.name,
    mimeType: document.mimeType,
    bytes,
    documentId,
    sourceETag: await s3Service.getObjectETag(document.s3Key),
  });

  // Scans carry their pages as base64 images; inlining those would blow the
  // 256 MB batch cap. Send them back to the live queue.
  if (source.kind !== 'text' || !source.text) return null;

  // Windowed documents need a multi-call fan-out plus a consolidation pass that
  // depends on all of them — not expressible as independent batch requests.
  const pageCount = source.pageCount ?? 0;
  if (pageCount > config.claude.windowing.thresholdPages) return null;

  const decision = pickExtractionModel({
    pageCount: source.pageCount,
    documentType: 'GENERIC',
    priority: document.priority as 'P0' | 'P1' | 'P2' | 'P3',
  });

  const [playbook, companyPlaybookMarkdown] = await Promise.all([
    playbookService.get(document.projectId),
    playbookService.getCompanyMarkdown(document.projectId),
  ]);

  const systemPrompt = buildExtractionPrompt({
    documentType: 'GENERIC',
    playbook,
    companyPlaybookMarkdown,
  });

  const pageNote = source.pageMarked
    ? `\n\nThe document text below is annotated with "=== Page N ===" markers. Every pageNumber you emit MUST be the number from the marker of the page the text actually appears under. Do not guess or interpolate page numbers.`
    : '';

  return {
    documentId,
    customId: documentId,
    model: decision.model,
    params: {
      model: decision.model,
      max_tokens: config.claude.extractionMaxOutputTokens,
      system: [
        { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
      ],
      tools: [
        {
          name: 'submit_extraction',
          description:
            'Emit the extracted fact sheet markdown plus structured top-level fields.',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          input_schema: sanitizeSchema(
            zodToJsonSchema(extractionResponseSchema as any)
          ),
        },
      ],
      tool_choice: { type: 'tool', name: 'submit_extraction' },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `---BEGIN DOCUMENT---\n${source.text}\n---END DOCUMENT---`,
              cache_control: { type: 'ephemeral' },
            },
            {
              type: 'text',
              text: `Filename: ${document.name}${pageNote}\n\nExtract the document into the submit_extraction tool call.`,
            },
          ],
        },
      ],
    },
  };
};

const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<Array<R | null>> => {
  const out = new Array<R | null>(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      try {
        out[i] = await fn(items[i]);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[batch] prepare failed:', err instanceof Error ? err.message : err);
        out[i] = null;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) || 1 }, worker));
  return out;
};

export const extractionBatchService = {
  /**
   * Submit one batch if the bulk backlog warrants it.
   *
   * Returns the batch id, or null when nothing was submitted — which is the
   * normal, expected outcome for any deal that is not a mass ingest.
   */
  async maybeSubmit(): Promise<string | null> {
    if (!isBatchingEnabled()) return null;
    // Preparation downloads and parses up to a thousand documents, which runs
    // far longer than the 60s tick. The atomic claim stops any document being
    // prepared twice, but without this the preparation passes still stack.
    if (submitting) return null;
    submitting = true;
    try {
      return await this.submitOnce();
    } finally {
      submitting = false;
    }
  },

  async submitOnce(): Promise<string | null> {
    const backlog = await pendingBulkCount();
    if (backlog < MIN_BACKLOG) return null;

    // Claim atomically so the synchronous queue cannot also pick these up.
    // SKIP LOCKED keeps this safe with multiple app instances running.
    const claimed = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `UPDATE "Document" SET "processingStatus" = 'BATCHED', "processingStartedAt" = NOW()
       WHERE "id" IN (
         SELECT "id" FROM "Document"
         WHERE ${ELIGIBLE_WHERE}
         ORDER BY "priority" ASC, "createdAt" ASC
         FOR UPDATE SKIP LOCKED
         LIMIT ${MAX_PER_BATCH}
       )
       RETURNING "id"`
    );
    if (claimed.length === 0) return null;

    // eslint-disable-next-line no-console
    console.log(
      `[batch] backlog ${backlog} >= ${MIN_BACKLOG}; preparing ${claimed.length} document(s)`
    );

    const prepared = (
      await mapWithConcurrency(
        claimed.map((r) => r.id),
        PREPARE_CONCURRENCY,
        (id) => prepareRequest(id)
      )
    ).filter((r): r is PreparedRequest => r !== null);

    // Anything that turned out to be a scan, oversized, or unreadable goes back
    // to the live queue rather than being silently dropped.
    const preparedIds = new Set(prepared.map((r) => r.documentId));
    const released = claimed.map((r) => r.id).filter((id) => !preparedIds.has(id));
    if (released.length > 0) {
      await prisma.document.updateMany({
        where: { id: { in: released } },
        data: { processingStatus: 'PENDING' as DocumentStatus },
      });
      // eslint-disable-next-line no-console
      console.log(`[batch] released ${released.length} ineligible document(s) to the live queue`);
    }
    if (prepared.length === 0) return null;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = getClaudeClient() as any;
      const batch = await client.messages.batches.create({
        requests: prepared.map((r) => ({ custom_id: r.customId, params: r.params })),
      });

      await prisma.extractionBatch.create({
        data: {
          id: batch.id,
          status: 'SUBMITTED',
          documentCount: prepared.length,
          model: prepared[0].model,
        },
      });
      await prisma.document.updateMany({
        where: { id: { in: prepared.map((r) => r.documentId) } },
        data: { extractionBatchId: batch.id },
      });

      // eslint-disable-next-line no-console
      console.log(`[batch] submitted ${batch.id} with ${prepared.length} document(s)`);
      return batch.id;
    } catch (err) {
      // Submission failed — every claimed document must go back, or they sit in
      // BATCHED forever with no batch to release them.
      await prisma.document.updateMany({
        where: { id: { in: prepared.map((r) => r.documentId) } },
        data: { processingStatus: 'PENDING' as DocumentStatus },
      });
      // eslint-disable-next-line no-console
      console.error(
        '[batch] submission failed; released documents back to the live queue:',
        err instanceof Error ? err.message : err
      );
      return null;
    }
  },

  /**
   * Reconcile every outstanding batch against the API.
   *
   * Also the restart-recovery path: a document in BATCHED is invisible to the
   * synchronous queue, so this poll is the only thing that can ever release it.
   * It therefore runs on boot as well as on a timer.
   */
  async poll(): Promise<void> {
    if (!isBatchingEnabled()) return;
    // applyResults re-downloads and re-runs the pipeline per document, which for
    // a large batch runs far longer than the poll interval. Without this guard
    // the next tick starts processing the same batch alongside the first.
    if (polling) return;
    polling = true;
    try {
      await this.pollOnce();
    } finally {
      polling = false;
    }
  },

  async pollOnce(): Promise<void> {
    const open = await prisma.extractionBatch.findMany({ where: { status: 'SUBMITTED' } });
    if (open.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = getClaudeClient() as any;

    for (const record of open) {
      try {
        const batch = await client.messages.batches.retrieve(record.id);
        // A healthy retrieve clears the failure streak. Without this, five
        // scattered transient failures across a 24-hour batch (~1440 polls)
        // abandoned a perfectly healthy batch.
        if (record.pollFailures > 0) {
          await prisma.extractionBatch.update({
            where: { id: record.id },
            data: { pollFailures: 0, lastError: null },
          });
        }
        if (batch.processing_status !== 'ended') continue;
        await this.applyResults(record.id, client);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
          `[batch] poll ${record.id} failed:`,
          err instanceof Error ? err.message : err
        );
        const failures = (record.pollFailures ?? 0) + 1;
        await prisma.extractionBatch.update({
          where: { id: record.id },
          data: {
            lastError: err instanceof Error ? err.message : String(err),
            pollFailures: failures,
            // Give up after repeated failures and hand the documents back to the
            // live queue. A batch that stops resolving (expired, 404 after the
            // 29-day window) would otherwise leave them in BATCHED forever —
            // exactly the stranding this design exists to prevent.
            ...(failures >= MAX_POLL_FAILURES ? { status: 'FAILED' as const, endedAt: new Date() } : {}),
          },
        });
        if (failures >= MAX_POLL_FAILURES) {
          const released = await prisma.document.updateMany({
            where: { extractionBatchId: record.id, processingStatus: 'BATCHED' as DocumentStatus },
            data: { processingStatus: 'PENDING' as DocumentStatus, extractionBatchId: null },
          });
          // eslint-disable-next-line no-console
          console.warn(
            `[batch] ${record.id} abandoned after ${failures} poll failures — returned ${released.count} document(s) to the live queue`
          );
        }
      }
    }
  },

  /**
   * Stream a finished batch's results and run each through the normal pipeline.
   *
   * Results arrive in arbitrary order, so everything is keyed by `custom_id`
   * (the document id) rather than position. An errored or missing result is
   * returned to PENDING rather than failed: batch errors are frequently
   * transient capacity problems, and the live queue is a perfectly good
   * fallback for a document that has already waited an hour.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async applyResults(batchId: string, client: any): Promise<void> {
    let succeeded = 0;
    let errored = 0;
    const seen = new Set<string>();

    for await (const result of await client.messages.batches.results(batchId)) {
      const documentId: string = result.custom_id;
      seen.add(documentId);

      if (result.result?.type !== 'succeeded') {
        errored += 1;
        await this.release(documentId, `batch result ${result.result?.type ?? 'missing'}`);
        continue;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const block = (result.result.message.content as any[]).find(
          (c) => c?.type === 'tool_use'
        );
        if (!block) throw new Error('no tool_use block in batch result');

        const extraction: ExtractionResponse = extractionResponseSchema.parse(block.input);
        const classification: ClassifyResponse = classifyResponseSchema.parse({
          documentType: extraction.documentType || 'GENERIC',
          confidence: 0.7,
          reasoning: 'Derived from batched extraction (no separate classify pass).',
        });

        await this.finish(documentId, extraction, classification);
        succeeded += 1;
      } catch (err) {
        errored += 1;
        await this.release(
          documentId,
          `batch result unusable: ${err instanceof Error ? err.message : err}`
        );
      }
    }

    // Anything the batch never reported on must not be left stranded.
    const stranded = await prisma.document.findMany({
      where: { extractionBatchId: batchId, processingStatus: 'BATCHED' as DocumentStatus },
      select: { id: true },
    });
    for (const doc of stranded) {
      if (!seen.has(doc.id)) await this.release(doc.id, 'no result returned in batch');
    }

    await prisma.extractionBatch.update({
      where: { id: batchId },
      data: {
        status: 'ENDED',
        succeededCount: succeeded,
        erroredCount: errored,
        endedAt: new Date(),
      },
    });
    // eslint-disable-next-line no-console
    console.log(`[batch] ${batchId} ended — ${succeeded} succeeded, ${errored} released`);
  },

  /** Hand a document back to the synchronous queue. */
  async release(documentId: string, reason: string): Promise<void> {
    await prisma.document.updateMany({
      where: { id: documentId },
      data: {
        processingStatus: 'PENDING' as DocumentStatus,
        extractionBatchId: null,
        lastError: reason,
      },
    });
    // eslint-disable-next-line no-console
    console.warn(`[batch] released ${documentId} to live queue: ${reason}`);
  },

  /**
   * Run a batched extraction through the rest of the normal pipeline.
   *
   * The document is re-fetched and re-parsed here rather than cached from
   * submission time — a batch can take 24 hours, and holding parsed page text
   * for a thousand documents across that window is not a trade worth making.
   */
  async finish(
    documentId: string,
    extraction: ExtractionResponse,
    classification: ClassifyResponse
  ): Promise<void> {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) return;

    await prisma.document.updateMany({
      where: { id: documentId, processingStatus: 'BATCHED' as DocumentStatus },
      data: { processingStatus: 'PROCESSING' as DocumentStatus },
    });

    try {
      const bytes = await s3Service.getObjectBytes(document.s3Key);
      const etag = await s3Service.getObjectETag(document.s3Key);
      const pipeline = await extractionService.runPipeline({
        filename: document.name,
        mimeType: document.mimeType,
        bytes,
        projectId: document.projectId,
        priority: document.priority as 'P0' | 'P1' | 'P2' | 'P3',
        documentId,
        sourceETag: etag,
        precomputed: { extraction, classification },
      });
      // Same filtering the live path applies — otherwise a batched document
      // scores differently from the identical document extracted inline.
      extractionService.dropAbsentMarkers(pipeline, document.name);

      await extractionService.persistResult(
        documentId,
        pipeline,
        etag ?? '',
        document.extractionModel ?? 'batch'
      );
      await prisma.document.update({
        where: { id: documentId },
        data: { extractionBatchId: null },
      });

      // Library filing, entity-graph rebuild and verification. Without these a
      // batched document lands COMPLETE but never reaches the library, so it is
      // invisible to chat, the deal map and the workstream tree.
      await extractionService.afterPersist(
        document.projectId,
        documentId,
        document.name,
        pipeline
      );
    } catch (err) {
      await extractionService.handleError(documentId, err);
    }
  },

  /** Start the submit + poll loop. */
  startWorker(): void {
    if (!isBatchingEnabled()) return;
    const tick = () => {
      void this.maybeSubmit().catch((err) =>
        // eslint-disable-next-line no-console
        console.error('[batch] submit tick failed:', err instanceof Error ? err.message : err)
      );
      void this.poll().catch((err) =>
        // eslint-disable-next-line no-console
        console.error('[batch] poll tick failed:', err instanceof Error ? err.message : err)
      );
    };
    setInterval(tick, POLL_MS).unref?.();
    tick(); // also the restart-recovery pass for stranded BATCHED documents
    // eslint-disable-next-line no-console
    console.log(
      `✓ Extraction batching enabled (min backlog=${MIN_BACKLOG}, max/batch=${MAX_PER_BATCH}, poll=${POLL_MS}ms)`
    );
  },
};
