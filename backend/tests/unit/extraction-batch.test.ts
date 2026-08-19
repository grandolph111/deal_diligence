/**
 * Bulk batch extraction — gate and safety invariants.
 *
 * The gate matters because batching is strictly worse than the live path below
 * scale: same tokens, but results in hours instead of seconds. The safety
 * invariants matter more — a document parked in BATCHED is invisible to the
 * synchronous queue, so any path that fails to release one strands it forever.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryRawUnsafe = vi.fn();
const updateMany = vi.fn();
const findMany = vi.fn();
const batchCreate = vi.fn();
const docUpdate = vi.fn();

vi.mock('../../src/config/database', () => ({
  prisma: {
    $queryRawUnsafe: (...a: unknown[]) => queryRawUnsafe(...a),
    document: {
      updateMany: (...a: unknown[]) => updateMany(...a),
      findMany: (...a: unknown[]) => findMany(...a),
      update: (...a: unknown[]) => docUpdate(...a),
      findUnique: vi.fn().mockResolvedValue(null),
    },
    extractionBatch: {
      create: (...a: unknown[]) => batchCreate(...a),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
  },
}));

const messagesBatchesCreate = vi.fn();
vi.mock('../../src/integrations/claude/client', () => ({
  getClaudeClient: () => ({
    messages: { batches: { create: (...a: unknown[]) => messagesBatchesCreate(...a) } },
  }),
  isMock: () => false,
  getModelId: () => 'claude-sonnet-4-6',
}));

const getObjectBytes = vi.fn();
vi.mock('../../src/services/s3.service', () => ({
  s3Service: {
    getObjectBytes: (...a: unknown[]) => getObjectBytes(...a),
    getObjectETag: vi.fn().mockResolvedValue('etag'),
  },
}));

vi.mock('../../src/services/playbook.service', () => ({
  playbookService: {
    get: vi.fn().mockResolvedValue(null),
    getCompanyMarkdown: vi.fn().mockResolvedValue(null),
  },
}));

process.env.CLAUDE_BATCH_ENABLED = 'true';

const { extractionBatchService, pendingBulkCount } = await import(
  '../../src/services/extraction-batch.service'
);

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('the scale gate', () => {
  it('does nothing when the bulk backlog is small', async () => {
    queryRawUnsafe.mockResolvedValueOnce([{ count: 10n }]);
    const id = await extractionBatchService.maybeSubmit();
    expect(id).toBeNull();
    // Crucially, nothing was claimed — no document was moved to BATCHED.
    expect(queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(messagesBatchesCreate).not.toHaveBeenCalled();
  });

  it('does nothing when batching is disabled, however large the backlog', async () => {
    process.env.CLAUDE_BATCH_ENABLED = 'false';
    vi.resetModules();
    const mod = await import('../../src/services/extraction-batch.service');
    expect(await mod.extractionBatchService.maybeSubmit()).toBeNull();
    process.env.CLAUDE_BATCH_ENABLED = 'true';
  });

  it('counts only pending bulk work, not the whole queue', async () => {
    queryRawUnsafe.mockResolvedValueOnce([{ count: 4_200n }]);
    expect(await pendingBulkCount()).toBe(4_200);
    const sql = String(queryRawUnsafe.mock.calls[0][0]);
    expect(sql).toContain("'PENDING'");
    expect(sql).toContain("'P2', 'P3'");
    expect(sql).toContain("'FULL'");
  });
});

describe('never strand a document', () => {
  it('releases documents back to the live queue when submission fails', async () => {
    queryRawUnsafe
      .mockResolvedValueOnce([{ count: 500n }])
      .mockResolvedValueOnce([{ id: 'doc-1' }]);
    getObjectBytes.mockResolvedValue(Buffer.from('x'));
    messagesBatchesCreate.mockRejectedValue(new Error('API down'));

    // prepareRequest needs a document; stub the module-level lookup.
    const { prisma } = await import('../../src/config/database');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (prisma.document.findUnique as any) = vi.fn().mockResolvedValue({
      id: 'doc-1',
      name: 'bulk.pdf',
      mimeType: 'text/plain',
      projectId: 'p1',
      priority: 'P3',
      s3Key: 'k',
    });

    const id = await extractionBatchService.maybeSubmit();
    expect(id).toBeNull();
    // The claimed document must be back to PENDING, not left in BATCHED.
    const released = updateMany.mock.calls.find(
      (c) => c[0]?.data?.processingStatus === 'PENDING'
    );
    expect(released).toBeTruthy();
  });

  it('releases a document whose batch result errored', async () => {
    await extractionBatchService.release('doc-9', 'batch result errored');
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          processingStatus: 'PENDING',
          extractionBatchId: null,
        }),
      })
    );
  });

  it('releases documents the batch never reported a result for', async () => {
    // A result stream that silently omits a document is the subtle case: no
    // error is raised anywhere, and the document would sit in BATCHED forever.
    findMany.mockResolvedValue([{ id: 'doc-missing' }]);
    const client = {
      messages: {
        batches: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          results: async () => [] as any[],
        },
      },
    };
    await extractionBatchService.applyResults('msgbatch_1', client);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'doc-missing' }),
        data: expect.objectContaining({ processingStatus: 'PENDING' }),
      })
    );
  });
});
