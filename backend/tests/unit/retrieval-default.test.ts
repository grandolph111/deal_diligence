/**
 * Default retrieval path.
 *
 * Two properties. Checklist navigation must be preferred over whole-document
 * stuffing, because the retrieval unit is what decides whether a deal of a few
 * thousand documents is answerable at all. And the fallback must be *bounded*:
 * an unbounded sweep is the scaling cliff, and a silently truncated one is
 * worse than a bounded one that says so.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const findMany = vi.fn();
const getObjectText = vi.fn();
const tocSearch = vi.fn();

vi.mock('../../src/config/database', () => ({
  prisma: { document: { findMany: (...a: unknown[]) => findMany(...a) } },
}));
vi.mock('../../src/services/s3.service', () => ({
  s3Service: { getObjectText: (...a: unknown[]) => getObjectText(...a) },
}));
vi.mock('../../src/integrations/retrieval/libraryTocRetriever', () => ({
  libraryTocRetriever: { search: (...a: unknown[]) => tocSearch(...a) },
}));

import {
  defaultRetriever,
  stuffRetriever,
} from '../../src/integrations/retrieval';

const docs = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `doc-${i}`,
    name: `doc-${i}.pdf`,
    extractionS3Key: `k-${i}`,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  getObjectText.mockResolvedValue('# Fact sheet');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('defaultRetriever', () => {
  it('prefers checklist navigation when the library has evidence', async () => {
    tocSearch.mockResolvedValue([
      { documentId: 'd1', documentName: 'a.pdf', factSheetMarkdown: '#' },
    ]);
    const out = await defaultRetriever.search('change of control', { projectId: 'p' });
    expect(out).toHaveLength(1);
    // The expensive whole-document sweep must not have run at all.
    expect(findMany).not.toHaveBeenCalled();
  });

  it('falls back to stuffing when the project has no library evidence', async () => {
    // Covers deals ingested before the library existed, and the window between
    // upload and the first reconciliation pass.
    tocSearch.mockResolvedValue([]);
    findMany.mockResolvedValue(docs(3));
    const out = await defaultRetriever.search('anything', { projectId: 'p' });
    expect(out).toHaveLength(3);
  });
});

describe('stuffRetriever bounds', () => {
  it('caps an unscoped sweep and says so rather than truncating silently', async () => {
    findMany.mockResolvedValue(docs(900));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = await stuffRetriever.search(null, { projectId: 'p' });
    expect(out.length).toBeLessThanOrEqual(12);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('truncated'));
  });

  it('honours an explicit document pin in full', async () => {
    // The caller already chose the scope; capping it would drop documents the
    // user deliberately attached.
    findMany.mockResolvedValue(docs(30));
    const out = await stuffRetriever.search(null, {
      projectId: 'p',
      documentIds: docs(30).map((d) => d.id),
    });
    expect(out).toHaveLength(30);
  });
});
