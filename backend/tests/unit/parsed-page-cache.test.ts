/**
 * S3 parse cache.
 *
 * The cache's only job is to be safe. A stale hit would serve one document's
 * page text for another's offsets — every anchored clause would point into the
 * wrong contract while looking perfectly well-formed. So every ambiguous case
 * must miss, and no failure here may ever propagate to the caller.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getObjectText = vi.fn();
const putObjectText = vi.fn();
const deleteObject = vi.fn();

vi.mock('../../src/services/s3.service', () => ({
  s3Service: {
    getObjectText: (...a: unknown[]) => getObjectText(...a),
    putObjectText: (...a: unknown[]) => putObjectText(...a),
    deleteObject: (...a: unknown[]) => deleteObject(...a),
  },
}));

import {
  readParsedPages,
  writeParsedPages,
  deleteParsedPages,
  parsedPagesKey,
} from '../../src/services/parsed-page-cache.service';

const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ version: 1, sourceETag: 'etag-a', pages: ['p1', 'p2'], pageCount: 2, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('readParsedPages', () => {
  it('returns the cached pages on a matching ETag', async () => {
    getObjectText.mockResolvedValue(payload());
    const r = await readParsedPages('doc-1', 'etag-a');
    expect(r?.pages).toEqual(['p1', 'p2']);
    expect(getObjectText).toHaveBeenCalledWith(parsedPagesKey('doc-1'));
  });

  it('misses when the source has been re-uploaded under the same key', async () => {
    // The dangerous case: same document id, different file. Serving the old
    // text would make every stored character offset point into a stale parse.
    getObjectText.mockResolvedValue(payload({ sourceETag: 'etag-OLD' }));
    expect(await readParsedPages('doc-1', 'etag-NEW')).toBeNull();
  });

  it('misses on a version bump so a parser change is not masked', async () => {
    getObjectText.mockResolvedValue(payload({ version: 0 }));
    expect(await readParsedPages('doc-1', 'etag-a')).toBeNull();
  });

  it('misses rather than throwing on unreadable or corrupt cache data', async () => {
    getObjectText.mockResolvedValue('{not json');
    expect(await readParsedPages('doc-1', 'etag-a')).toBeNull();

    getObjectText.mockRejectedValue(new Error('S3 down'));
    expect(await readParsedPages('doc-1', 'etag-a')).toBeNull();
  });

  it('still hits when no ETag is available on either side', async () => {
    // Mock S3 and some providers withhold ETags. That should degrade to "use
    // the cache", not to "never cache anything".
    getObjectText.mockResolvedValue(payload({ sourceETag: null }));
    const r = await readParsedPages('doc-1', null);
    expect(r?.pages).toHaveLength(2);
  });
});

describe('writeParsedPages', () => {
  it('writes the parse keyed to the source ETag', async () => {
    await writeParsedPages('doc-1', 'etag-a', ['a', 'b'], 2);
    const [key, body] = putObjectText.mock.calls[0];
    expect(key).toBe(parsedPagesKey('doc-1'));
    expect(JSON.parse(body as string)).toMatchObject({ sourceETag: 'etag-a', pageCount: 2 });
  });

  it('does not cache an empty parse', async () => {
    // A scan parses to nothing. Caching that would freeze the document out of
    // any future parser improvement that could actually read it.
    await writeParsedPages('doc-1', 'etag-a', [], 0);
    expect(putObjectText).not.toHaveBeenCalled();
  });

  it('swallows a write failure — caching must never fail an extraction', async () => {
    putObjectText.mockRejectedValue(new Error('S3 down'));
    await expect(writeParsedPages('doc-1', 'etag-a', ['a'], 1)).resolves.toBeUndefined();
  });
});

describe('deleteParsedPages', () => {
  it('removes the derived copy when the document is deleted', async () => {
    await deleteParsedPages('doc-1');
    expect(deleteObject).toHaveBeenCalledWith(parsedPagesKey('doc-1'));
  });

  it('tolerates a missing object', async () => {
    deleteObject.mockRejectedValue(new Error('NoSuchKey'));
    await expect(deleteParsedPages('doc-1')).resolves.toBeUndefined();
  });
});
