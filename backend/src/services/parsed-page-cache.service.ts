/**
 * S3-backed cache of a document's parsed page text.
 *
 * Parsing was being thrown away. `prepareSource` extracts per-page text on
 * every run, and every later run — the verification sweep, a re-extraction, a
 * batch result landing hours after submission — re-downloads the PDF and parses
 * it again from scratch. The `Document.extractedText` column that was meant to
 * hold this is dead: zero of the documents in the database populate it and no
 * code reads it.
 *
 * That waste is now a correctness problem, not just a cost one. Anchored
 * clauses store character offsets into the page text, and the property that
 * makes them worth storing — `page.slice(start, end) === content` — can only be
 * checked against the same parse that produced them. Without a cache, verifying
 * one clause means re-fetching and re-parsing an entire contract.
 *
 * Stored in S3 rather than Postgres deliberately: this is derived data, it is
 * large (~50 KB/document, so ~500 MB for a ten-thousand-document VDR), and it
 * is read whole rather than queried. Postgres would only earn it if we wanted
 * full-text search, which is a different feature.
 */

import { s3Service } from './s3.service';

/** Bump when the parse output shape or the parser changes materially. */
const CACHE_VERSION = 1;

export interface CachedParse {
  version: number;
  /**
   * ETag of the SOURCE object at parse time. A document re-uploaded under the
   * same key would otherwise serve page text belonging to the previous file —
   * silently, and with offsets that point into the wrong document.
   */
  sourceETag: string | null;
  pages: string[];
  pageCount: number | null;
}

export const parsedPagesKey = (documentId: string): string =>
  `parsed/${documentId}.json`;

/**
 * Read cached pages, or null on any miss.
 *
 * Every failure mode — absent, unreadable, wrong version, stale ETag — returns
 * null and lets the caller parse. A cache that can fail a request is worse than
 * no cache; this one can only fail to help.
 */
export const readParsedPages = async (
  documentId: string,
  sourceETag: string | null
): Promise<CachedParse | null> => {
  try {
    const raw = await s3Service.getObjectText(parsedPagesKey(documentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedParse;

    if (parsed.version !== CACHE_VERSION) return null;
    if (!Array.isArray(parsed.pages)) return null;
    // Only treat the ETag as a mismatch when we have both sides to compare.
    // A missing ETag (mock S3, or a provider that withholds it) should degrade
    // to "use the cache", not to "never cache anything".
    if (sourceETag && parsed.sourceETag && parsed.sourceETag !== sourceETag) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

/** Write the cache. Best-effort: a failure here must never fail an extraction. */
export const writeParsedPages = async (
  documentId: string,
  sourceETag: string | null,
  pages: string[],
  pageCount: number | null
): Promise<void> => {
  // Nothing to cache for a scan — an empty parse is cheap to redo and caching
  // it would mask a later parser improvement that could read the document.
  if (pages.length === 0) return;
  try {
    const payload: CachedParse = {
      version: CACHE_VERSION,
      sourceETag,
      pages,
      pageCount,
    };
    await s3Service.putObjectText(
      parsedPagesKey(documentId),
      JSON.stringify(payload),
      'application/json'
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[parsed-cache] failed to cache ${documentId}:`,
      err instanceof Error ? err.message : err
    );
  }
};

/** Drop a document's cached parse (re-upload, or a deleted document). */
export const deleteParsedPages = async (documentId: string): Promise<void> => {
  try {
    await s3Service.deleteObject(parsedPagesKey(documentId));
  } catch {
    // Nothing to do — an orphaned cache entry is harmless and ETag-guarded.
  }
};
