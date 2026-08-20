/**
 * The checklist ToC that the Data Room navigates.
 *
 * The property that matters is that a document is counted under EVERY
 * workstream it supplies evidence to. Documents map many-to-many onto the
 * checklist (~8 workstreams per document on real deals), so per-workstream
 * counts deliberately sum to more than the document total. A test that asserted
 * they summed to the total would be encoding the folder model we moved away
 * from.
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

import { libraryService } from '../../src/modules/library/library.service';

const USER = { id: 'u1', platformRole: 'MEMBER', companyId: 'c1' } as never;
const FULL = { isFullAccess: true, allowedFolderIds: [], allowedWorkstreamIds: [] };

/** One CHECKLIST_ITEM row. */
const item = (itemId: string, workstreamId: string, status = 'OPEN') => ({
  itemId,
  workstreamId,
  title: itemId,
  status,
});

/** One evidence row (PROVISION/RISK/OBLIGATION). */
const ev = (itemId: string, workstreamId: string, sourceDocumentId: string) => ({
  itemId,
  workstreamId,
  sourceDocumentId,
});

/**
 * getToc issues three queries in a fixed order: checklist items, evidence,
 * documents. Drive them by call order.
 */
function mockData(opts: {
  items: ReturnType<typeof item>[];
  evidence: ReturnType<typeof ev>[];
  docs: string[];
}) {
  nodeFindMany.mockReset();
  nodeFindMany
    .mockResolvedValueOnce(opts.items) // CHECKLIST_ITEM
    .mockResolvedValueOnce(opts.evidence); // evidence types
  documentFindMany.mockResolvedValue(opts.docs.map((id) => ({ id })));
}

describe('libraryService.getToc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveProjectScope.mockResolvedValue(FULL);
  });

  it('counts a document under every workstream it has evidence in', async () => {
    mockData({
      items: [
        item('coc-assignment-triggers', '01-corporate-org'),
        item('indemnification', '05-liability-risk'),
        item('ip-ownership-assignment', '04-intellectual-property'),
      ],
      // One document, evidence in all three workstreams.
      evidence: [
        ev('coc-assignment-triggers', '01-corporate-org', 'doc1'),
        ev('indemnification', '05-liability-risk', 'doc1'),
        ev('ip-ownership-assignment', '04-intellectual-property', 'doc1'),
      ],
      docs: ['doc1'],
    });

    const toc = await libraryService.getToc('p1', USER);
    const byId = Object.fromEntries(toc.workstreams.map((w) => [w.id, w]));

    expect(byId['01-corporate-org'].documentCount).toBe(1);
    expect(byId['05-liability-risk'].documentCount).toBe(1);
    expect(byId['04-intellectual-property'].documentCount).toBe(1);

    // The whole point: counts sum past the document total, they do not partition it.
    const summed = toc.workstreams.reduce((n, w) => n + w.documentCount, 0);
    expect(summed).toBe(3);
    expect(toc.totals.documents).toBe(1);
  });

  it('counts distinct documents, not evidence rows', async () => {
    mockData({
      items: [item('indemnification', '05-liability-risk')],
      // Same document contributing four provisions to one item.
      evidence: [
        ev('indemnification', '05-liability-risk', 'doc1'),
        ev('indemnification', '05-liability-risk', 'doc1'),
        ev('indemnification', '05-liability-risk', 'doc1'),
        ev('indemnification', '05-liability-risk', 'doc2'),
      ],
      docs: ['doc1', 'doc2'],
    });

    const toc = await libraryService.getToc('p1', USER);
    const ws = toc.workstreams.find((w) => w.id === '05-liability-risk')!;

    expect(ws.documentCount).toBe(2); // distinct docs
    expect(ws.evidenceCount).toBe(4); // raw provisions
    expect(ws.items[0].documentCount).toBe(2);
    expect(ws.items[0].evidenceCount).toBe(4);
  });

  it('puts documents with no evidence in the unfiled bucket', async () => {
    mockData({
      items: [item('indemnification', '05-liability-risk')],
      evidence: [ev('indemnification', '05-liability-risk', 'doc1')],
      docs: ['doc1', 'failed-doc', 'still-processing'],
    });

    const toc = await libraryService.getToc('p1', USER);

    // The two documents extraction never produced anything for must remain
    // reachable — a tree keyed on evidence would otherwise drop them silently.
    expect(toc.unfiled.documentCount).toBe(2);
    expect(toc.totals.documents).toBe(3);
  });

  it('keeps an item with no evidence visible as an open question', async () => {
    mockData({
      items: [
        item('indemnification', '05-liability-risk', 'COVERED'),
        item('insurance', '05-liability-risk', 'OPEN'),
      ],
      evidence: [ev('indemnification', '05-liability-risk', 'doc1')],
      docs: ['doc1'],
    });

    const toc = await libraryService.getToc('p1', USER);
    const ws = toc.workstreams.find((w) => w.id === '05-liability-risk')!;
    const insurance = ws.items.find((i) => i.itemId === 'insurance')!;

    // An unanswered diligence question is the most important thing on the page.
    expect(insurance.documentCount).toBe(0);
    expect(insurance.status).toBe('OPEN');
  });

  it('hides the internal triage workstream until something lands there', async () => {
    mockData({
      items: [item('indemnification', '05-liability-risk'), item('to-triage', '99-to-triage')],
      evidence: [ev('indemnification', '05-liability-risk', 'doc1')],
      docs: ['doc1'],
    });

    const toc = await libraryService.getToc('p1', USER);
    expect(toc.workstreams.map((w) => w.id)).not.toContain('99-to-triage');
  });

  it('surfaces triage once evidence lands in it', async () => {
    mockData({
      items: [item('to-triage', '99-to-triage')],
      evidence: [ev('to-triage', '99-to-triage', 'doc1')],
      docs: ['doc1'],
    });

    const toc = await libraryService.getToc('p1', USER);
    expect(toc.workstreams.map((w) => w.id)).toContain('99-to-triage');
  });

  describe('restricted callers', () => {
    beforeEach(() => {
      resolveProjectScope.mockResolvedValue({
        isFullAccess: false,
        allowedFolderIds: [],
        allowedWorkstreamIds: ['04-intellectual-property'],
      });
    });

    it('lists only granted workstreams, so the tree cannot offer a 403', async () => {
      // allowedDocIds runs its own query first, then getToc's three.
      nodeFindMany.mockReset();
      nodeFindMany
        .mockResolvedValueOnce([{ sourceDocumentId: 'ip-doc' }]) // allowedDocIds
        .mockResolvedValueOnce([
          item('ip-ownership-assignment', '04-intellectual-property'),
          item('indemnification', '05-liability-risk'),
        ])
        .mockResolvedValueOnce([
          ev('ip-ownership-assignment', '04-intellectual-property', 'ip-doc'),
          ev('indemnification', '05-liability-risk', 'other-doc'),
        ]);
      documentFindMany.mockResolvedValue([{ id: 'ip-doc' }, { id: 'other-doc' }]);

      const toc = await libraryService.getToc('p1', USER);

      // The documents API refuses a workstream outside the grant, so the tree
      // must not render one as a navigable branch.
      expect(toc.workstreams.map((w) => w.id)).toEqual(['04-intellectual-property']);
      expect(toc.workstreams[0].documentCount).toBe(1);
      expect(toc.totals.documents).toBe(1);
    });

    it('never reports unfiled documents to a restricted caller', async () => {
      nodeFindMany.mockReset();
      nodeFindMany
        .mockResolvedValueOnce([{ sourceDocumentId: 'ip-doc' }])
        .mockResolvedValueOnce([item('ip-ownership-assignment', '04-intellectual-property')])
        .mockResolvedValueOnce([ev('ip-ownership-assignment', '04-intellectual-property', 'ip-doc')]);
      documentFindMany.mockResolvedValue([{ id: 'ip-doc' }, { id: 'unextracted' }]);

      const toc = await libraryService.getToc('p1', USER);

      // An unextracted document belongs to no workstream, so no grant reaches it.
      expect(toc.unfiled.documentCount).toBe(0);
    });
  });
});
