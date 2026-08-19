/**
 * Page-window splitting for documents too large to extract in one call.
 *
 * The binding constraint on a 300-page contract is **output**, not input: a
 * 300-page PDF sits comfortably inside a 1M-token context and under Claude's
 * 600-page document limit, but emitting every CUAD clause, entity, and
 * relationship from it overruns `max_tokens` and truncates the tool call
 * mid-JSON. Windowing bounds the output per call.
 *
 * Windows overlap. A clause that straddles a boundary would otherwise be seen
 * only in fragments by both neighbours and reported correctly by neither; the
 * overlap guarantees at least one window sees it whole. Duplicates introduced
 * by the overlap are removed deterministically at merge time, which is a much
 * easier problem than recovering a clause that was never extracted.
 */

import { PDFDocument } from 'pdf-lib';

export interface PageWindow {
  /** 0-based ordinal of this window in the document. */
  index: number;
  /** 1-based, inclusive. */
  startPage: number;
  /** 1-based, inclusive. */
  endPage: number;
  /** Pages this window shares with its predecessor (0 for the first). */
  overlapWithPrevious: number;
}

export interface WindowPlanOptions {
  /** Target pages per window. */
  windowPages: number;
  /** Pages of overlap between adjacent windows. */
  overlapPages: number;
}

/**
 * Lay out the windows for a document of `totalPages`.
 *
 * A trailing remainder no larger than the overlap is folded into the previous
 * window rather than becoming its own call: a window made entirely of pages a
 * neighbour already read costs a full request and can contribute nothing new.
 */
export const planWindows = (
  totalPages: number,
  options: WindowPlanOptions
): PageWindow[] => {
  const windowPages = Math.max(1, Math.floor(options.windowPages));
  // Overlap must leave forward progress, or the plan never terminates.
  const overlapPages = Math.max(
    0,
    Math.min(Math.floor(options.overlapPages), windowPages - 1)
  );

  if (totalPages <= 0) return [];
  if (totalPages <= windowPages) {
    return [{ index: 0, startPage: 1, endPage: totalPages, overlapWithPrevious: 0 }];
  }

  const windows: PageWindow[] = [];
  let start = 1;

  while (start <= totalPages) {
    let end = Math.min(start + windowPages - 1, totalPages);

    // Fold a tail that is pure overlap into this window.
    if (totalPages - end <= overlapPages) end = totalPages;

    windows.push({
      index: windows.length,
      startPage: start,
      endPage: end,
      overlapWithPrevious: windows.length === 0 ? 0 : overlapPages,
    });

    if (end >= totalPages) break;
    start = end - overlapPages + 1;
  }

  return windows;
};

/**
 * Extract `startPage`..`endPage` (1-based, inclusive) into a standalone PDF.
 *
 * `ignoreEncryption` matters in practice: VDR exports are frequently
 * permissions-encrypted (printing/copying restricted) with no password, which
 * pdf-lib refuses by default even though the content is fully readable.
 */
export const slicePdf = async (
  bytes: Buffer,
  startPage: number,
  endPage: number
): Promise<Buffer> => {
  const source = await PDFDocument.load(bytes, {
    updateMetadata: false,
    ignoreEncryption: true,
  });

  const total = source.getPageCount();
  const from = Math.max(1, startPage);
  const to = Math.min(total, endPage);
  if (from > to) {
    throw new Error(
      `slicePdf: empty range ${startPage}-${endPage} for a ${total}-page document`
    );
  }

  const out = await PDFDocument.create();
  const indices: number[] = [];
  for (let p = from; p <= to; p += 1) indices.push(p - 1);

  const copied = await out.copyPages(source, indices);
  for (const page of copied) out.addPage(page);

  return Buffer.from(await out.save());
};

/**
 * Map a page number reported *within* a window back to the source document.
 *
 * Each window is a fresh PDF whose pages are numbered from 1, so the model
 * necessarily reports window-relative pages. We correct that here rather than
 * telling the model its true offset: a deterministic addition cannot drift,
 * whereas a model asked to add 147 to every citation sometimes will not — and
 * every downstream consumer (the citation validator, the fact sheet, the UI
 * deep-link) treats these numbers as ground truth.
 */
export const toAbsolutePage = (
  windowRelativePage: number | null | undefined,
  window: PageWindow
): number | null => {
  if (windowRelativePage === null || windowRelativePage === undefined) return null;
  if (!Number.isFinite(windowRelativePage)) return null;
  const absolute = window.startPage + Math.max(1, windowRelativePage) - 1;
  // Clamp: a model that hallucinates page 60 of a 40-page window must not
  // produce a citation pointing past the window's own range.
  return Math.min(absolute, window.endPage);
};

/**
 * Slice already-parsed page text into a window, re-emitting `=== Page N ===`
 * markers with the document's **absolute** page numbers.
 *
 * This is the preferred path whenever the source PDF has a usable text layer.
 * The same pages cost roughly a quarter of what they cost as a base64 document
 * block (which ships every page as a rasterised image *and* its text), and the
 * page limits on document blocks stop applying entirely.
 *
 * Because the markers carry absolute numbers, the model's citations need no
 * offsetting on this path — what it reports is already document-truth. That is
 * strictly safer than the PDF path, where correctness depends on us adding the
 * window offset back afterwards.
 */
export const sliceTextPages = (pages: string[], window: PageWindow): string => {
  const out: string[] = [];
  for (let p = window.startPage; p <= Math.min(window.endPage, pages.length); p += 1) {
    out.push(`=== Page ${p} ===\n${pages[p - 1] ?? ''}`);
  }
  return out.join('\n\n');
};
