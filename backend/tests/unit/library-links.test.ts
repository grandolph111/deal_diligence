/**
 * Backlinks, peer comparison, and filed notes.
 *
 * The invariant that matters most here is that a NOTE is not evidence. A note
 * is something a person wrote; letting it count toward a checklist item's
 * coverage would let the deal mark a diligence question answered on the
 * strength of our own conclusion rather than a document.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const nodeFindMany = vi.fn();
const nodeCreate = vi.fn();
const edgeFindMany = vi.fn();
const edgeCreateMany = vi.fn();
const documentFindMany = vi.fn();
const documentFindFirst = vi.fn();
const resolveProjectScope = vi.fn();

vi.mock('../../src/config/database', () => ({
  prisma: {
    libraryNode: {
      findMany: (...a: unknown[]) => nodeFindMany(...a),
      create: (...a: unknown[]) => nodeCreate(...a),
    },
    libraryEdge: {
      findMany: (...a: unknown[]) => edgeFindMany(...a),
      createMany: (...a: unknown[]) => edgeCreateMany(...a),
    },
    document: {
      findMany: (...a: unknown[]) => documentFindMany(...a),
      findFirst: (...a: unknown[]) => documentFindFirst(...a),
    },
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

import { libraryService, EVIDENCE_TYPES } from '../../src/modules/library/library.service';

const USER = { id: 'u1', platformRole: 'MEMBER', companyId: 'c1' } as never;
const FULL = { isFullAccess: true, allowedFolderIds: [], allowedWorkstreamIds: [] };

beforeEach(() => {
  vi.clearAllMocks();
  resolveProjectScope.mockResolvedValue(FULL);
  edgeFindMany.mockResolvedValue([]);
  edgeCreateMany.mockResolvedValue({ count: 0 });
  documentFindMany.mockResolvedValue([]);
});

describe('NOTE is not evidence', () => {
  it('excludes NOTE from the evidence types that drive coverage', () => {
    // getToc, document counts and scope resolution all key off this list. If
    // NOTE ever joins it, a written conclusion starts closing out diligence
    // questions that no document answers.
    expect([...EVIDENCE_TYPES]).toEqual(['PROVISION', 'RISK', 'OBLIGATION']);
    expect([...EVIDENCE_TYPES]).not.toContain('NOTE');
  });
});

describe('libraryService.createNote', () => {
  const ok = { id: 'n1', itemId: 'indemnification', workstreamId: '05-liability-risk', slug: 's' };

  it('rejects an unknown checklist item rather than filing it anywhere', async () => {
    await expect(
      libraryService.createNote('p1', USER, {
        title: 'T',
        content: 'C',
        itemIds: ['not-a-real-item'],
      })
    ).rejects.toThrow(/Unknown checklist item/);
    expect(nodeCreate).not.toHaveBeenCalled();
  });

  it('requires a title and content', async () => {
    await expect(
      libraryService.createNote('p1', USER, { title: '  ', content: 'C' })
    ).rejects.toThrow(/title/i);
    await expect(
      libraryService.createNote('p1', USER, { title: 'T', content: '  ' })
    ).rejects.toThrow(/content/i);
  });

  it('files an unmapped answer to triage instead of discarding it', async () => {
    nodeCreate.mockResolvedValue({ ...ok, itemId: 'unmapped-provisions', workstreamId: '99-to-triage' });
    nodeFindMany.mockResolvedValue([]);

    await libraryService.createNote('p1', USER, { title: 'Stray thought', content: 'C' });

    const arg = nodeCreate.mock.calls[0][0];
    expect(arg.data.type).toBe('NOTE');
    expect(arg.data.itemId).toBe('unmapped-provisions');
    expect(arg.data.workstreamId).toBe('99-to-triage');
  });

  it('links the note to every item it answers, not just the first', async () => {
    nodeCreate.mockResolvedValue(ok);
    // checklist item node lookup
    nodeFindMany.mockResolvedValueOnce([{ id: 'item-a' }, { id: 'item-b' }]);

    await libraryService.createNote('p1', USER, {
      title: 'T',
      content: 'C',
      itemIds: ['indemnification', 'liability-caps'],
    });

    const edges = edgeCreateMany.mock.calls[0][0].data;
    expect(edges.filter((e: { edgeType: string }) => e.edgeType === 'EVIDENCES')).toHaveLength(2);
  });

  it('refuses to file into a workstream the caller was not granted', async () => {
    resolveProjectScope.mockResolvedValue({
      isFullAccess: false,
      allowedFolderIds: [],
      allowedWorkstreamIds: ['04-intellectual-property'],
    });
    nodeFindMany.mockResolvedValue([]);

    await expect(
      libraryService.createNote('p1', USER, {
        title: 'T',
        content: 'C',
        // indemnification lives in 05-liability-risk, which is not granted.
        itemIds: ['indemnification'],
      })
    ).rejects.toThrow(/do not have access/i);
  });
});

describe('libraryService.compareClause', () => {
  const prov = (id: string, doc: string, riskLevel: string | null) => ({
    id,
    title: `finding ${id}`,
    content: 'quote',
    riskLevel,
    confidence: 80,
    pageNumber: 1,
    itemId: 'indemnification',
    sourceDocumentId: doc,
  });

  it('orders worst-risk first — the outlier is the point of looking', async () => {
    nodeFindMany.mockResolvedValue([
      prov('a', 'd1', 'LOW'),
      prov('b', 'd2', 'HIGH'),
      prov('c', 'd3', 'MEDIUM'),
    ]);
    documentFindMany.mockResolvedValue([
      { id: 'd1', name: 'One' },
      { id: 'd2', name: 'Two' },
      { id: 'd3', name: 'Three' },
    ]);

    const cmp = await libraryService.compareClause('p1', 'INDEMNIFICATION', USER);

    expect(cmp.provisions.map((p) => p.riskLevel)).toEqual(['HIGH', 'MEDIUM', 'LOW']);
    expect(cmp.stats).toEqual({
      total: 3,
      documents: 3,
      byRisk: { HIGH: 1, MEDIUM: 1, LOW: 1, UNSCORED: 0 },
    });
  });

  it('hides clauses from documents outside the callerScope', async () => {
    resolveProjectScope.mockResolvedValue({
      isFullAccess: false,
      allowedFolderIds: [],
      allowedWorkstreamIds: ['05-liability-risk'],
    });
    // allowedDocIds query, then the provision query.
    nodeFindMany
      .mockResolvedValueOnce([{ sourceDocumentId: 'd1' }])
      .mockResolvedValueOnce([prov('a', 'd1', 'HIGH'), prov('b', 'secret-doc', 'HIGH')]);
    documentFindMany.mockResolvedValue([{ id: 'd1', name: 'One' }]);

    const cmp = await libraryService.compareClause('p1', 'INDEMNIFICATION', USER);

    expect(cmp.provisions).toHaveLength(1);
    expect(cmp.provisions[0].documentId).toBe('d1');
  });
});

describe('libraryService.getDocumentBacklinks', () => {
  it('refuses a document outside the caller scope', async () => {
    resolveProjectScope.mockResolvedValue({
      isFullAccess: false,
      allowedFolderIds: [],
      allowedWorkstreamIds: ['04-intellectual-property'],
    });
    nodeFindMany.mockResolvedValueOnce([{ sourceDocumentId: 'visible-doc' }]);

    await expect(
      libraryService.getDocumentBacklinks('p1', 'hidden-doc', USER)
    ).rejects.toThrow(/do not have access/i);
  });
});
