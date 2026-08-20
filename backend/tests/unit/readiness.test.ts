/**
 * AI readiness states.
 *
 * The distinction that matters is between "not ready yet, wait" and "not ready
 * and waiting will not help". A permissions problem or a deal where every
 * document failed must never render as a progress spinner, because the spinner
 * never ends and the user has no way to learn why.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const groupBy = vi.fn();
const nodeCount = vi.fn();
const nodeFindMany = vi.fn();
const resolveProjectScope = vi.fn();

vi.mock('../../src/config/database', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => findUnique(...a) },
    document: { groupBy: (...a: unknown[]) => groupBy(...a) },
    libraryNode: {
      count: (...a: unknown[]) => nodeCount(...a),
      findMany: (...a: unknown[]) => nodeFindMany(...a),
    },
  },
}));
vi.mock('../../src/services/scope.service', () => ({
  resolveProjectScope: (...a: unknown[]) => resolveProjectScope(...a),
}));

import { readinessService } from '../../src/modules/projects/readiness.service';

const statuses = (m: Record<string, number>) =>
  Object.entries(m).map(([processingStatus, n]) => ({
    processingStatus,
    _count: { _all: n },
  }));

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue({ id: 'u1', platformRole: 'USER', companyId: 'c1' });
  resolveProjectScope.mockResolvedValue({ isFullAccess: true, allowedFolderIds: [] });
  nodeCount.mockResolvedValue(0);
  nodeFindMany.mockResolvedValue([]);
});

const read = () => readinessService.getProjectReadiness('p1', 'u1');

describe('readiness states', () => {
  it('EMPTY when the deal has no documents', async () => {
    groupBy.mockResolvedValue([]);
    const r = await read();
    expect(r.state).toBe('EMPTY');
    expect(r.ready).toBe(false);
    expect(r.message).toContain('Upload documents');
  });

  it('PROCESSING while the first documents are still being read', async () => {
    groupBy.mockResolvedValue(statuses({ PROCESSING: 2, PENDING: 38 }));
    const r = await read();
    expect(r.state).toBe('PROCESSING');
    expect(r.ready).toBe(false);
    expect(r.total).toBe(40);
  });

  it('PARTIAL once some are done but ingestion is still running', async () => {
    groupBy.mockResolvedValue(statuses({ COMPLETE: 12, PENDING: 28 }));
    const r = await read();
    expect(r.state).toBe('PARTIAL');
    expect(r.ready).toBe(true);
    expect(r.partial).toBe(true);
    // The user must be told answers are incomplete, not just that it works.
    expect(r.message).toContain('12 of 40');
  });

  it('READY when everything has been processed', async () => {
    groupBy.mockResolvedValue(statuses({ COMPLETE: 100 }));
    const r = await read();
    expect(r.state).toBe('READY');
    expect(r.partial).toBe(false);
  });

  it('counts batched documents as pending, not as missing', async () => {
    // A document sitting in an Anthropic batch is queued from the user's point
    // of view; the queue it sits in is our problem, not theirs.
    groupBy.mockResolvedValue(statuses({ COMPLETE: 5, BATCHED: 95 }));
    const r = await read();
    expect(r.total).toBe(100);
    expect(r.pending).toBe(95);
    expect(r.state).toBe('PARTIAL');
  });

  it('FAILED — not PROCESSING — when every document errored', async () => {
    // Rendering this as a spinner would leave the user waiting forever on a
    // deal that has already finished failing.
    groupBy.mockResolvedValue(statuses({ FAILED: 7 }));
    const r = await read();
    expect(r.state).toBe('FAILED');
    expect(r.ready).toBe(false);
    expect(r.message).toContain('failed');
  });

  it('still reports PROCESSING when some failed but others are in flight', async () => {
    groupBy.mockResolvedValue(statuses({ FAILED: 3, PENDING: 10 }));
    const r = await read();
    expect(r.state).toBe('PROCESSING');
  });

  it('NO_ACCESS for a member with no workstream grants', async () => {
    resolveProjectScope.mockResolvedValue({
      isFullAccess: false,
      allowedFolderIds: [],
      allowedWorkstreamIds: [],
    });
    const r = await read();
    expect(r.state).toBe('NO_ACCESS');
    expect(r.message).toContain('Customer Admin');
    // Must not have queried documents at all — there is nothing in scope.
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('reports ingest progress deal-wide but keeps evidence scoped', async () => {
    resolveProjectScope.mockResolvedValue({
      isFullAccess: false,
      allowedFolderIds: [],
      allowedWorkstreamIds: ['04-intellectual-property'],
    });
    groupBy.mockResolvedValue(statuses({ COMPLETE: 2, PROCESSING: 3 }));

    const r = await read();

    expect(r.state).not.toBe('NO_ACCESS');
    // Documents acquire evidence only AFTER extraction succeeds, so scoping the
    // status counts by workstream would make processing/pending/failed
    // structurally zero — PARTIAL and PROCESSING become unreachable and a
    // mid-ingest deal reports itself finished.
    expect(r.processing).toBe(3);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { projectId: 'p1' } })
    );
    // Evidence volume describes content, so it stays scoped.
    expect(nodeCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workstreamId: { in: ['04-intellectual-property'] },
        }),
      })
    );
  });
});
