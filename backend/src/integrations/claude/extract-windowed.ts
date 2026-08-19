/**
 * Windowed extraction for documents too large to read in one call.
 *
 * Flow: plan windows → extract each independently → merge deterministically →
 * consolidate the document-level judgment with one cheap model pass.
 *
 * The input is a `WindowSource`, not a document record or an S3 key, so this
 * module stays independent of however the caller prepared the bytes. Two source
 * shapes, and the difference between them matters:
 *
 *   - `text` — page-marked text from a PDF with a usable text layer. Roughly a
 *     quarter the input cost of the same pages as a document block, and the
 *     markers carry absolute page numbers, so citations need no correction.
 *     This is the path most documents should take.
 *   - `pdf` — sliced PDF pages, for scanned documents with no text layer. Costs
 *     more and reports window-relative pages that we offset back afterwards,
 *     but it is the only way to read a document the parser cannot.
 */

import { extractDocument, type ExtractOptions } from './extract';
import { consolidateExtraction, applyConsolidation } from './consolidate';
import { mergeWindowExtractions, type WindowExtraction, type MergeStats } from './merge-extraction';
import { planWindows, slicePdf, sliceTextPages, type PageWindow } from '../../utils/pdf-window';
import { resolveExtractionAnchors } from '../../utils/anchor-resolver';
import { config } from '../../config';
import type { ExtractionResponse, DocumentType } from './schema';

export type WindowSource =
  | { kind: 'text'; pages: string[] }
  | { kind: 'pdf'; bytes: Buffer; pageCount: number };

export interface WindowedExtractOptions {
  filename: string;
  documentType: DocumentType;
  source: WindowSource;
  /** Passed through to each window's extraction call. */
  extractOptions: Omit<ExtractOptions, 'documentType' | 'windowContext' | 'pageCount'>;
  windowPages: number;
  overlapPages: number;
  /** How many windows of the SAME document may be in flight. */
  concurrency?: number;
  /**
   * Allow the document to complete with some windows missing.
   *
   * Defaults to false, and that default is deliberate: in diligence, a fact
   * sheet that silently omits forty pages of a contract is more dangerous than
   * no fact sheet at all, because nothing downstream can tell the difference
   * between "no indemnity cap in this agreement" and "the pages containing it
   * failed to extract". Failing loudly puts the document back in the retry
   * queue where a human can see it.
   */
  allowPartial?: boolean;
  /** Skip the consolidation model pass (deterministic merge only). */
  skipConsolidation?: boolean;
}

export interface WindowedExtractResult {
  extraction: ExtractionResponse;
  stats: MergeStats & {
    windowsPlanned: number;
    windowsFailed: number;
    consolidated: boolean;
  };
  /** Page ranges that failed, when `allowPartial` let the document through. */
  failedRanges: Array<{ startPage: number; endPage: number }>;
}

const totalPagesOf = (source: WindowSource): number =>
  source.kind === 'text' ? source.pages.length : source.pageCount;

/** Bounded-concurrency map that preserves input order in the output. */
const mapWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<Array<{ ok: true; value: R } | { ok: false; error: unknown }>> => {
  const results = new Array<{ ok: true; value: R } | { ok: false; error: unknown }>(
    items.length
  );
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await fn(items[i], i) };
      } catch (error) {
        results[i] = { ok: false, error };
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker)
  );
  return results;
};

/** Below this, halving cannot meaningfully reduce the output any further. */
const MIN_SALVAGE_PAGES = 6;

/**
 * Split a failed window into two overlapping halves.
 *
 * The halves keep the same overlap as the original plan so a clause sitting on
 * the new interior boundary is still seen whole by one of them — the split is
 * introducing a boundary that did not exist in the plan, and it must not become
 * a new place for clauses to fall through.
 */
const splitInHalf = (window: PageWindow, overlapPages: number): PageWindow[] => {
  const mid = Math.floor((window.startPage + window.endPage) / 2);
  return [
    { ...window, endPage: Math.min(mid + overlapPages, window.endPage) },
    {
      ...window,
      startPage: Math.max(mid - overlapPages + 1, window.startPage),
      overlapWithPrevious: overlapPages,
    },
  ];
};

const extractWindow = async (
  window: PageWindow,
  args: WindowedExtractOptions,
  totalWindows: number
): Promise<WindowExtraction> => {
  const windowContext = {
    index: window.index,
    total: totalWindows,
    startPage: window.startPage,
    endPage: window.endPage,
  };
  const pageCount = window.endPage - window.startPage + 1;

  if (args.source.kind === 'text') {
    const text = sliceTextPages(args.source.pages, window);
    const anchorMode = config.claude.anchorQuoting;
    const extraction = await extractDocument(
      { kind: 'text', text, filename: args.filename, pageMarked: true },
      {
        ...args.extractOptions,
        documentType: args.documentType,
        // Markers already carry absolute pages, so the model is NOT told to
        // renumber from 1 — only that it is looking at part of a larger whole.
        windowContext: { ...windowContext, absolutePages: true },
        pageCount,
        anchorMode,
      }
    );
    if (anchorMode) {
      // Resolve BEFORE the merge. The merge dedupes overlapping clauses on
      // their quoted text, so it has to run against real content — an unresolved
      // clause set would collapse to one empty-string key and lose everything.
      // Resolving against the full page array (not just this window's slice)
      // also lets a clause running past the window's last page still resolve.
      resolveExtractionAnchors(extraction, args.source.pages);
    }
    return { window, extraction, pagesAreAbsolute: true };
  }

  const bytes = await slicePdf(args.source.bytes, window.startPage, window.endPage);
  const extraction = await extractDocument(
    { kind: 'pdf', bytes, filename: args.filename },
    {
      ...args.extractOptions,
      documentType: args.documentType,
      windowContext: { ...windowContext, absolutePages: false },
      pageCount,
    }
  );
  return { window, extraction, pagesAreAbsolute: false };
};

export const extractDocumentWindowed = async (
  args: WindowedExtractOptions
): Promise<WindowedExtractResult> => {
  const totalPages = totalPagesOf(args.source);
  const windows = planWindows(totalPages, {
    windowPages: args.windowPages,
    overlapPages: args.overlapPages,
  });

  if (windows.length === 0) {
    throw new Error(`extractDocumentWindowed: ${args.filename} has no pages to read`);
  }

  // eslint-disable-next-line no-console
  console.log(
    `[extract-windowed] ${args.filename} → ${totalPages}p as ${windows.length} ` +
      `window(s) of ${args.windowPages}p (overlap ${args.overlapPages}p, ` +
      `source=${args.source.kind})`
  );

  const settled = await mapWithConcurrency(
    windows,
    args.concurrency ?? 3,
    (window) => extractWindow(window, args, windows.length)
  );

  const succeeded: WindowExtraction[] = [];
  const firstPassFailures: PageWindow[] = [];

  settled.forEach((result, i) => {
    if (result.ok) {
      succeeded.push(result.value);
      return;
    }
    const w = windows[i];
    firstPassFailures.push(w);
    // eslint-disable-next-line no-console
    console.error(
      `[extract-windowed] ${args.filename} pages ${w.startPage}-${w.endPage} failed:`,
      result.error instanceof Error ? result.error.message : result.error
    );
  });

  // Salvage pass. `runToolUse` has already retried transient failures five
  // times, so a window that reached here failed for a reason repeating it will
  // not fix — overwhelmingly, a page range dense enough that its clause list
  // overran `max_tokens` and truncated the tool call mid-JSON. Halving the range
  // halves the output, which is the one remedy that actually addresses that.
  //
  // This is what keeps a single dense window from failing an entire 300-page
  // document, so it runs before the all-or-nothing decision below.
  const failedRanges: Array<{ startPage: number; endPage: number }> = [];

  if (firstPassFailures.length > 0) {
    const salvageable = firstPassFailures.filter(
      (w) => w.endPage - w.startPage + 1 >= MIN_SALVAGE_PAGES
    );
    failedRanges.push(
      ...firstPassFailures
        .filter((w) => w.endPage - w.startPage + 1 < MIN_SALVAGE_PAGES)
        .map((w) => ({ startPage: w.startPage, endPage: w.endPage }))
    );

    if (salvageable.length > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[extract-windowed] ${args.filename} → salvaging ${salvageable.length} ` +
          `failed window(s) by halving`
      );
    }

    const halves = salvageable.flatMap((w) => splitInHalf(w, args.overlapPages));
    const retried = await mapWithConcurrency(halves, args.concurrency ?? 3, (half) =>
      extractWindow(half, args, windows.length)
    );

    // A half only rescues its parent if BOTH halves land. One half of a range is
    // still a gap, and a gap recorded as a success is the failure mode this
    // whole design exists to prevent.
    salvageable.forEach((parent, i) => {
      const left = retried[i * 2];
      const right = retried[i * 2 + 1];
      if (left?.ok && right?.ok) {
        succeeded.push(left.value, right.value);
        // eslint-disable-next-line no-console
        console.log(
          `[extract-windowed] ${args.filename} → salvaged pages ` +
            `${parent.startPage}-${parent.endPage} as two halves`
        );
        return;
      }
      failedRanges.push({ startPage: parent.startPage, endPage: parent.endPage });
    });
  }

  if (failedRanges.length > 0 && !args.allowPartial) {
    const ranges = failedRanges.map((r) => `${r.startPage}-${r.endPage}`).join(', ');
    throw new Error(
      `Windowed extraction of ${args.filename} lost pages ${ranges} ` +
        `(${failedRanges.length}/${windows.length} windows). Failing the document ` +
        `rather than emitting a fact sheet with silent gaps.`
    );
  }

  if (succeeded.length === 0) {
    throw new Error(`Windowed extraction of ${args.filename}: every window failed`);
  }

  const { extraction: merged, stats } = mergeWindowExtractions(succeeded, totalPages);

  if (failedRanges.length > 0) {
    // Make the gap impossible to miss downstream: a reader of this fact sheet
    // must know which pages were never read.
    const ranges = failedRanges.map((r) => `pp.${r.startPage}-${r.endPage}`).join(', ');
    merged.confidenceScore = Math.min(merged.confidenceScore, 50);
    merged.confidenceReason =
      `INCOMPLETE — ${failedRanges.length} of ${windows.length} page windows failed ` +
      `to extract (${ranges}). Clauses in those pages are absent from this fact ` +
      `sheet. ${merged.confidenceReason}`.trim();
  }

  let extraction = merged;
  let consolidated = false;

  if (!args.skipConsolidation && succeeded.length > 1) {
    try {
      const verdict = await consolidateExtraction({
        filename: args.filename,
        documentType: args.documentType,
        merged,
        windowCount: succeeded.length,
        totalPages,
      });
      extraction = applyConsolidation(merged, verdict);
      consolidated = true;

      // Cross-window findings are the whole point of consolidation — surface
      // them in the risk summary rather than letting them die in the response.
      if (verdict.crossWindowFindings.length > 0) {
        const notes = verdict.crossWindowFindings
          .map(
            (f) =>
              `- [${f.severity}] ${f.note}` +
              (f.pageNumbers.length ? ` (pp. ${f.pageNumbers.join(', ')})` : '')
          )
          .join('\n');
        extraction.riskSummary =
          `${extraction.riskSummary}\n\n**Cross-document findings**\n${notes}`.trim();
      }

      // A partial read must not be laundered into confidence by the
      // consolidator, which never saw that pages were missing.
      if (failedRanges.length > 0) {
        extraction.confidenceScore = Math.min(extraction.confidenceScore, 50);
        extraction.confidenceReason = merged.confidenceReason;
      }
    } catch (err) {
      // Consolidation is judgment, not data. Losing it degrades the risk score
      // to the deterministic merge, which is a worse answer but still a valid
      // one — not a reason to discard a document we successfully read.
      // eslint-disable-next-line no-console
      console.error(
        `[extract-windowed] ${args.filename} consolidation failed; falling back to ` +
          `deterministic merge:`,
        err instanceof Error ? err.message : err
      );
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `[extract-windowed] ${args.filename} → merged ${stats.clausesBeforeMerge}→` +
      `${stats.clausesAfterMerge} clauses, ${stats.entitiesBeforeMerge}→` +
      `${stats.entitiesAfterMerge} entities; consolidated=${consolidated}`
  );

  return {
    extraction,
    stats: {
      ...stats,
      windowsPlanned: windows.length,
      windowsFailed: failedRanges.length,
      consolidated,
    },
    failedRanges,
  };
};
