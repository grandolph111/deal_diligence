/**
 * Anchor → verbatim span resolution.
 *
 * Extraction latency is almost entirely output-bound: the same contract sent as
 * a 22k-token PDF and as 5k tokens of text took identical wall clock, because
 * what the model spends its time on is *writing*. And the bulk of what it
 * writes is quoted contract text — the model retyping a document we already
 * hold in memory, at roughly 200 output tokens per clause.
 *
 * Anchoring removes that. The model emits only a locator — the opening and
 * closing few words of the clause — and this module recovers the exact span
 * from the parsed page text. Around 45 output tokens per clause instead of 220.
 *
 * The accuracy consequence is the more interesting half: a resolved span is
 * verbatim *by construction*, because it is sliced out of our own text rather
 * than transcribed by a model. A hallucinated quote stops being something to
 * detect after the fact and becomes structurally impossible — the anchor either
 * resolves against the document or it is reported as unresolved.
 *
 * Requires a text layer, so this is the same gate as the page-marked text path:
 * a scan with no extractable text keeps the verbatim-quote contract.
 */

import diffMatchPatch from 'diff-match-patch';

// diff-match-patch is a default-exported class in its ESM build but a
// { diff_match_patch } named constructor on the legacy CJS build. Handle both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DMP: any =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (diffMatchPatch as any).diff_match_patch ?? diffMatchPatch;
const dmp = new DMP();
dmp.Match_Distance = 1_000_000;
dmp.Match_Threshold = 0.4;

/** bitap is a 32-bit algorithm; patterns longer than this throw. */
const BITAP_MAX = 28;

/** Pages searched either side of the cited page before giving up. */
const DEFAULT_SEARCH_RADIUS = 2;

/** Stop counting duplicate anchor hits past this — ambiguous is ambiguous. */
const MAX_TRACKED_OCCURRENCES = 8;

/** A clause longer than this means the end anchor matched the wrong place. */
const MAX_SPAN_CHARS = 6_000;

/**
 * Normalize for matching while retaining a map back to original offsets.
 *
 * Matching has to be whitespace- and punctuation-insensitive (PDF text layers
 * are full of stray line breaks and smart quotes), but the *output* must be the
 * original characters — otherwise "verbatim" is a lie and the quote will not
 * match the PDF a reviewer opens. The index map is what lets us match on the
 * normalized form and slice from the original.
 */
const normalizeWithMap = (s: string): { norm: string; map: number[] } => {
  const out: string[] = [];
  const map: number[] = [];
  let lastWasSpace = true; // leading whitespace is dropped

  for (let i = 0; i < s.length; i += 1) {
    let ch = s[i];
    if (/\s/.test(ch)) {
      if (lastWasSpace) continue;
      out.push(' ');
      map.push(i);
      lastWasSpace = true;
      continue;
    }
    lastWasSpace = false;
    if ('‘’'.includes(ch)) ch = "'";
    else if ('“”'.includes(ch)) ch = '"';
    else if ('–—'.includes(ch)) ch = '-';
    out.push(ch.toLowerCase());
    map.push(i);
  }

  // Drop a single trailing space so offsets stay tight.
  while (out.length > 0 && out[out.length - 1] === ' ') {
    out.pop();
    map.pop();
  }
  return { norm: out.join(''), map };
};

const normalizeAnchor = (s: string): string => normalizeWithMap(s).norm;

/**
 * Every exact occurrence of `anchor` in `haystack` at or after `from`.
 *
 * Enumerating rather than taking the first hit is what makes anchor ambiguity
 * detectable. An anchor like "Notwithstanding the foregoing" appears all over a
 * contract; resolving it to whichever copy comes first yields a quote that is
 * genuinely verbatim, cites a real page, passes every downstream check — and
 * belongs to a different clause. That failure is invisible unless we count.
 */
const findAllExact = (haystack: string, anchor: string, from = 0): number[] => {
  if (!anchor) return [];
  const hits: number[] = [];
  let i = haystack.indexOf(anchor, from);
  while (i !== -1 && hits.length <= MAX_TRACKED_OCCURRENCES) {
    hits.push(i);
    i = haystack.indexOf(anchor, i + 1);
  }
  return hits;
};

/** Locate `anchor` in `haystack` at or after `from`; -1 if absent. */
const findAnchor = (haystack: string, anchor: string, from = 0): number => {
  if (!anchor) return -1;
  // Exact match first — far more reliable than bitap when the text is clean.
  const exact = haystack.indexOf(anchor, from);
  if (exact !== -1) return exact;
  // Fall back to fuzzy on a bitap-legal prefix.
  const pattern = anchor.slice(0, BITAP_MAX);
  const pos = dmp.match_main(haystack, pattern, from);
  return pos === -1 || pos < from ? -1 : pos;
};

export type AnchorMethod =
  | 'exact-page'
  | 'nearby-page'
  | 'page-spanning'
  | 'start-only';

export interface ResolvedAnchor {
  /** The verbatim span, sliced from the source text. */
  text: string;
  /** Page the span STARTS on — corrected if the model cited the wrong one. */
  pageNumber: number;
  /** How it was found, for observability and for downstream confidence. */
  method: AnchorMethod;
  /** True when the model's cited page was wrong and we relocated the clause. */
  pageCorrected: boolean;
  /**
   * How many places in the searched window the start anchor matched. 1 is
   * healthy. More means the anchor was not distinctive, we picked the
   * occurrence nearest the cited page, and the span may belong to a different
   * clause — so the caller should discount it rather than trust it.
   */
  occurrences: number;
  /** Character offsets of the span WITHIN its starting page. */
  startOffset: number;
  endOffset: number;
}

export interface AnchorRequest {
  startAnchor: string;
  endAnchor?: string | null;
  citedPage?: number | null;
  searchRadius?: number;
}

/**
 * Resolve one anchor pair against the document's pages.
 *
 * Search order is cited page → outward by radius. A clause that begins near a
 * page break routinely has its end on the following page, so the search window
 * spans forward from wherever the start anchor lands rather than stopping at a
 * page boundary.
 *
 * Returns null when the start anchor cannot be found at all — which is the
 * honest answer, and strictly better than emitting a plausible-looking span
 * from the wrong part of the contract.
 */
export const resolveAnchor = (
  pages: string[],
  req: AnchorRequest
): ResolvedAnchor | null => {
  if (pages.length === 0) return null;
  const startNorm = normalizeAnchor(req.startAnchor ?? '');
  if (startNorm.length < 6) return null; // too short to locate anything

  const endNorm = normalizeAnchor(req.endAnchor ?? '');
  const radius = req.searchRadius ?? DEFAULT_SEARCH_RADIUS;

  // Candidate start pages, cited first then outward.
  const cited = req.citedPage && req.citedPage >= 1 ? req.citedPage : 1;
  const candidates: number[] = [];
  const push = (p: number) => {
    if (p >= 1 && p <= pages.length && !candidates.includes(p)) candidates.push(p);
  };
  push(cited);
  for (let d = 1; d <= radius; d += 1) {
    push(cited - d);
    push(cited + d);
  }
  // Last resort: scan the whole document rather than lose the clause.
  for (let p = 1; p <= pages.length; p += 1) push(p);

  for (const startPage of candidates) {
    // Search a window forward from the start page so a clause running over a
    // page break still resolves. Three pages covers any realistic clause.
    const lastPage = Math.min(pages.length, startPage + 2);
    const parts: string[] = [];
    const pageStartOffsets: number[] = [];
    let cursor = 0;
    for (let p = startPage; p <= lastPage; p += 1) {
      pageStartOffsets.push(cursor);
      const body = pages[p - 1] ?? '';
      parts.push(body);
      cursor += body.length + 1; // +1 for the joining newline
    }
    const windowText = parts.join('\n');
    const { norm, map } = normalizeWithMap(windowText);

    // Prefer an exact occurrence on the cited page itself; a fuzzy match is the
    // fallback when the text layer is too noisy for a literal hit.
    const exactHits = findAllExact(norm, startNorm);
    const firstPageLengthForSelection = (pages[startPage - 1] ?? '').length;
    const onCitedPage = exactHits.filter((h) => map[h] <= firstPageLengthForSelection);
    const startPos =
      onCitedPage.length > 0
        ? onCitedPage[0]
        : exactHits.length > 0
          ? exactHits[0]
          : findAnchor(norm, startNorm);
    if (startPos === -1) continue;
    const occurrences = Math.max(exactHits.length, 1);

    // The start anchor must actually be on THIS page, not spilled in from a
    // later one — otherwise every page would "match" its successors.
    const startOrig = map[startPos];
    const firstPageLength = (pages[startPage - 1] ?? '').length;
    if (startOrig > firstPageLength) continue;

    let endNormPos = -1;
    if (endNorm.length >= 6) {
      endNormPos = findAnchor(norm, endNorm, startPos);
    }

    let spanEndNorm: number;
    let method: AnchorMethod;
    if (endNormPos === -1) {
      // No usable end anchor. Take the start anchor's own span rather than
      // guessing an extent — a short true quote beats a long invented one.
      spanEndNorm = startPos + startNorm.length;
      method = 'start-only';
    } else {
      spanEndNorm = endNormPos + endNorm.length;
      method = 'exact-page';
    }

    const startIdx = map[startPos];
    const endIdx = map[Math.min(spanEndNorm, map.length) - 1] ?? startIdx;
    let text = windowText.slice(startIdx, endIdx + 1).trim();

    if (text.length > MAX_SPAN_CHARS) {
      // The end anchor matched somewhere implausible. Keep the opening rather
      // than emitting six thousand characters of unrelated contract.
      text = text.slice(0, MAX_SPAN_CHARS).trim();
      method = 'start-only';
    }
    if (text.length === 0) continue;

    // Which page did the span actually start on?
    let resolvedPage = startPage;
    for (let i = pageStartOffsets.length - 1; i >= 0; i -= 1) {
      if (startIdx >= pageStartOffsets[i]) {
        resolvedPage = startPage + i;
        break;
      }
    }

    const spansPages = endIdx >= firstPageLength && method !== 'start-only';
    const pageCorrected = resolvedPage !== cited;

    const pageBase = pageStartOffsets[resolvedPage - startPage] ?? 0;
    return {
      text,
      pageNumber: resolvedPage,
      method: spansPages
        ? 'page-spanning'
        : pageCorrected
          ? 'nearby-page'
          : method,
      pageCorrected,
      occurrences,
      startOffset: Math.max(0, startIdx - pageBase),
      endOffset: Math.max(0, endIdx + 1 - pageBase),
    };
  }

  return null;
};

/* ------------------------------------------------------------------ */
/* Extraction-level resolution                                         */
/* ------------------------------------------------------------------ */

export interface AnchorResolutionStats {
  total: number;
  resolved: number;
  /** Clauses that fell back to the model's own verbatim quote. */
  fellBackToQuote: number;
  /** Clauses with neither a resolvable anchor nor a quote — dropped. */
  dropped: number;
  /** Clauses whose cited page was wrong and got corrected. */
  pagesCorrected: number;
  /**
   * Clauses whose start anchor matched in more than one place. The span was
   * still resolved (nearest the cited page) but may belong to a different
   * clause. A non-trivial count here means the model is not picking
   * distinctive anchors, which is the failure mode anchoring most needs
   * watching for — the output looks perfectly well-formed when it happens.
   */
  ambiguousAnchors: number;
}

export interface ResolvedExtraction<T> {
  extraction: T;
  stats: AnchorResolutionStats;
}

interface AnchoredClause {
  clauseType: string;
  content: string;
  startAnchor?: string;
  endAnchor?: string;
  pageNumber?: number | null;
  confidence: number;
  /** Character offsets of the resolved span within its page, when anchored. */
  startOffset?: number | null;
  endOffset?: number | null;
  [key: string]: unknown;
}

/**
 * Fill in `content` for every anchored clause by locating it in the page text.
 *
 * Three outcomes per clause, in order of preference:
 *   1. The anchor resolves — `content` becomes a span sliced from the source,
 *      and `pageNumber` is corrected to wherever the span actually starts.
 *   2. The anchor fails but the model wrote a quote anyway (the escape hatch
 *      the prompt offers for clauses it could not anchor) — keep the quote and
 *      let the existing citation validator judge it, exactly as before.
 *   3. Neither — the clause is DROPPED.
 *
 * Dropping is the right call and worth being explicit about. A clause with no
 * resolvable anchor and no quote is one the model asserted exists but cannot
 * point to anywhere in the document. Under the old contract that was an
 * unverifiable quote for a human to chase; here it is simply absent, which is
 * the same information without the false precision. The count is reported so a
 * high drop rate surfaces as a signal rather than as silent recall loss.
 */
export const resolveExtractionAnchors = <
  T extends { clauses: AnchoredClause[]; confidenceReason: string; confidenceScore: number },
>(
  extraction: T,
  pages: string[]
): ResolvedExtraction<T> => {
  const stats: AnchorResolutionStats = {
    total: extraction.clauses.length,
    resolved: 0,
    fellBackToQuote: 0,
    dropped: 0,
    pagesCorrected: 0,
    ambiguousAnchors: 0,
  };

  if (pages.length === 0 || extraction.clauses.length === 0) {
    return { extraction, stats };
  }

  const kept: AnchoredClause[] = [];

  for (const clause of extraction.clauses) {
    const hasAnchor = (clause.startAnchor ?? '').trim().length > 0;

    if (hasAnchor) {
      const resolved = resolveAnchor(pages, {
        startAnchor: clause.startAnchor as string,
        endAnchor: clause.endAnchor ?? null,
        citedPage: clause.pageNumber ?? null,
      });
      if (resolved) {
        stats.resolved += 1;
        if (resolved.pageCorrected) stats.pagesCorrected += 1;
        if (resolved.occurrences > 1) stats.ambiguousAnchors += 1;

        // Two independent reasons to discount a resolved span, so take the
        // worse of them. A start-only resolution recovered less than the whole
        // clause; an ambiguous anchor may have recovered the wrong clause
        // entirely, which is the more serious of the two.
        let confidence = clause.confidence;
        if (resolved.method === 'start-only') confidence = Math.min(confidence, 0.75);
        if (resolved.occurrences > 1) confidence = Math.min(confidence, 0.5);

        kept.push({
          ...clause,
          content: resolved.text,
          pageNumber: resolved.pageNumber,
          startOffset: resolved.startOffset,
          endOffset: resolved.endOffset,
          confidence,
        });
        continue;
      }
    }

    if ((clause.content ?? '').trim().length > 0) {
      stats.fellBackToQuote += 1;
      kept.push(clause);
      continue;
    }

    stats.dropped += 1;
  }

  extraction.clauses = kept;

  if (stats.dropped > 0) {
    const pct = Math.round((stats.dropped / Math.max(stats.total, 1)) * 100);
    extraction.confidenceReason =
      `${stats.dropped} of ${stats.total} clauses (${pct}%) had no resolvable anchor ` +
      `and no quote, and were dropped. ${extraction.confidenceReason}`.trim();
    // A few unanchorable clauses is normal; a lot means the anchor contract is
    // not working for this document and the result should not look confident.
    if (pct >= 25) {
      extraction.confidenceScore = Math.min(extraction.confidenceScore, 60);
    }
  }

  return { extraction, stats };
};
