/**
 * Document placement: the workstream tree the Data Room navigates.
 *
 * The property that matters is that placement PARTITIONS the deal. A document
 * supplies evidence to ~8 workstreams, and an earlier version counted it under
 * every one — the counts then summed to several times the document total and
 * the same contract appeared everywhere. Each document now sits in exactly one
 * workstream: the one it contributes the most evidence to.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const nodeFindMany = vi.fn();
const documentFindMany = vi.fn();
const resolveProjectScope = vi.fn();

vi.mock('../../src/config/database', () => ({
  prisma: {
    libraryNode: { findMany: (...a: unknown[]) => nodeFindMany(...a) },
    libraryEdge: { findMany: vi.fn() },
    document: { findMany: (...a: unknown[]) => documentFindMany(...a) },
    project: { findUnique: vi.fn() },
  },
}));
vi.mock('../../src/services/scope.service', () => ({
  resolveProjectScope: (...a: unknown[]) => resolveProjectScope(...a),
}));
vi.mock('../../src/services/playbook.service', () => ({ playbookService: {} }));
vi.mock('../../src/services/library-writer.service', () => ({
  computeItemStatus: vi.fn(),
  highPriorityClauseTypesFor: vi.fn(() => []),
}));

import {
  libraryService,
  primaryWorkstreamByDocument,
} from '../../src/modules/library/library.service';

const USER = { id: 'u1', platformRole: 'MEMBER', companyId: 'c1' } as never;
const FULL = { isFullAccess: true, allowedFolderIds: [], allowedWorkstreamIds: [] };

/** One evidence row. */
const ev = (workstreamId: string, sourceDocumentId: string, riskLevel: string | null = null) => ({
  workstreamId,
  sourceDocumentId,
  riskLevel,
});

beforeEach(() => {
  vi.clearAllMocks();
  resolveProjectScope.mockResolvedValue(FULL);
});

describe('primaryWorkstreamByDocument', () => {
  it('places a document where it contributes the most evidence', async () => {
    nodeFindMany.mockResolvedValue([
      ev('01-corporate-org', 'doc1'),
      ev('05-liability-risk', 'doc1'),
      ev('05-liability-risk', 'doc1'),
      ev('05-liability-risk', 'doc1'),
      ev('04-intellectual-property', 'doc1'),
    ]);

    const placement = await primaryWorkstreamByDocument('p1', null, null);

    expect(placement.get('doc1')).toBe('05-liability-risk');
    // One document, one home — not one entry per workstream it touches.
    expect(placement.size).toBe(1);
  });

  it('breaks an evidence tie on high-risk density', async () => {
    nodeFindMany.mockResolvedValue([
      ev('01-corporate-org', 'doc1'),
      ev('01-corporate-org', 'doc1'),
      ev('05-liability-risk', 'doc1', 'HIGH'),
      ev('05-liability-risk', 'doc1'),
    ]);

    const placement = await primaryWorkstreamByDocument('p1', null, null);

    // Equal counts, but the workstream carrying the high-risk clause is the
    // more useful home for a document a reviewer is trying to find.
    expect(placement.get('doc1')).toBe('05-liability-risk');
  });

  it('places a restricted caller’s documents inside a granted workstream', async () => {
    nodeFindMany.mockResolvedValue([
      ev('05-liability-risk', 'doc1'),
      ev('05-liability-risk', 'doc1'),
      ev('04-intellectual-property', 'doc1'),
    ]);

    const placement = await primaryWorkstreamByDocument(
      'p1',
      null,
      new Set(['04-intellectual-property'])
    );

    // Liability wins on volume but is not granted; the document must still land
    // somewhere the caller can actually navigate to.
    expect(placement.get('doc1')).toBe('04-intellectual-property');
  });

  it('omits a document with no evidence at all', async () => {
    nodeFindMany.mockResolvedValue([ev('05-liability-risk', 'doc1')]);
    const placement = await primaryWorkstreamByDocument('p1', null, null);
    expect(placement.has('never-extracted')).toBe(false);
  });
});

describe('libraryService.getToc', () => {
  it('partitions the deal — counts sum to the placed total, never past it', async () => {
    nodeFindMany.mockResolvedValue([
      ev('03-commercial-contracts', 'doc1'),
      ev('03-commercial-contracts', 'doc1'),
      ev('05-liability-risk', 'doc1'),
      ev('05-liability-risk', 'doc2'),
      ev('05-liability-risk', 'doc2'),
      ev('03-commercial-contracts', 'doc3'),
    ]);
    documentFindMany.mockResolvedValue([{ id: 'doc1' }, { id: 'doc2' }, { id: 'doc3' }]);

    const toc = await libraryService.getToc('p1', USER);
    const summed = toc.workstreams.reduce((n, w) => n + w.documentCount, 0);

    expect(summed).toBe(3);
    expect(toc.totals.placed).toBe(3);
    expect(toc.totals.documents).toBe(3);

    const byId = Object.fromEntries(toc.workstreams.map((w) => [w.id, w.documentCount]));
    expect(byId['03-commercial-contracts']).toBe(2);
    expect(byId['05-liability-risk']).toBe(1);
  });

  it('counts documents with no evidence as unfiled rather than dropping them', async () => {
    nodeFindMany.mockResolvedValue([ev('05-liability-risk', 'doc1')]);
    documentFindMany.mockResolvedValue([
      { id: 'doc1' },
      { id: 'failed-doc' },
      { id: 'still-processing' },
    ]);

    const toc = await libraryService.getToc('p1', USER);

    // A tree keyed on evidence would lose these entirely, which is how failed
    // extractions stayed invisible before the bucket existed.
    expect(toc.unfiled.documentCount).toBe(2);
    expect(toc.totals.documents).toBe(3);
    expect(toc.totals.placed).toBe(1);
  });

  it('lists only granted workstreams, so the tree cannot offer a 403', async () => {
    resolveProjectScope.mockResolvedValue({
      isFullAccess: false,
      allowedFolderIds: [],
      allowedWorkstreamIds: ['04-intellectual-property'],
    });
    // allowedDocIds runs first, then placement.
    nodeFindMany
      .mockResolvedValueOnce([{ sourceDocumentId: 'ip-doc' }])
      .mockResolvedValueOnce([ev('04-intellectual-property', 'ip-doc')]);
    documentFindMany.mockResolvedValue([{ id: 'ip-doc' }, { id: 'other-doc' }]);

    const toc = await libraryService.getToc('p1', USER);

    expect(toc.workstreams.map((w) => w.id)).toEqual(['04-intellectual-property']);
    expect(toc.workstreams[0].documentCount).toBe(1);
    // Unfiled is a full-access notion — no grant can reach a document that
    // belongs to no workstream.
    expect(toc.unfiled.documentCount).toBe(0);
  });

  it('hides the internal triage workstream until something lands there', async () => {
    nodeFindMany.mockResolvedValue([ev('05-liability-risk', 'doc1')]);
    documentFindMany.mockResolvedValue([{ id: 'doc1' }]);

    const toc = await libraryService.getToc('p1', USER);
    expect(toc.workstreams.map((w) => w.id)).not.toContain('99-to-triage');
  });
});
