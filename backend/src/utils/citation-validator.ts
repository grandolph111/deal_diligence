/**
 * Citation regex validator.
 *
 * Deterministic pre-check before the LLM verify pass. For each clause Claude
 * extracted, fuzzy-match the quoted content against the source PDF text.
 * Flags are reported as CitationIssues and fed into the document's
 * verificationIssues pool.
 */

import diffMatchPatch from 'diff-match-patch';
import type { ExtractionResponse } from '../integrations/claude/schema';

// diff-match-patch is a default-exported class in its new ESM build but a
// { diff_match_patch } named constructor on the legacy CJS build. Handle both.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DMP: any =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (diffMatchPatch as any).diff_match_patch ?? diffMatchPatch;
const dmp = new DMP();

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D]/g, "'") // smart quotes
    .replace(/[\u2013\u2014]/g, '-') // en/em dash
    .replace(/\s+/g, ' ')
    .trim();

export interface CitationIssue {
  type: 'HALLUCINATED_QUOTE' | 'WRONG_PAGE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  clauseType: string;
  quote: string;
  citedPage: number | null;
  actualPage?: number | null;
  similarity: number;
  description: string;
}

export const extractPdfPages = async (
  bytes: Buffer
): Promise<{ pages: string[]; fullText: string }> => {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: new Uint8Array(bytes) });
  try {
    const result = await parser.getText();
    const pages = (result.pages ?? []).map((p) =>
      (p.text ?? '').trim()
    );
    const fullText = result.text ?? pages.join('\n');
    return { pages, fullText };
  } finally {
    await parser.destroy().catch(() => undefined);
  }
};

/**
 * Fuzzy similarity 0-1 between needle and haystack. Uses diff-match-patch
 * match_main which returns the best match position or -1, plus we measure
 * similarity by Levenshtein distance against the best-matching window.
 */
const similarity = (needle: string, haystack: string): number => {
  const n = normalize(needle);
  const h = normalize(haystack);
  if (!n || !h) return 0;
  if (h.includes(n)) return 1;

  // Bound needle length for diff_levenshtein perf
  const probe = n.length > 200 ? n.slice(0, 200) : n;
  const position = dmp.match_main(h, probe, 0);
  if (position === -1) return 0;

  const window = h.slice(position, position + probe.length);
  const distance = dmp.diff_levenshtein(dmp.diff_main(probe, window));
  return Math.max(0, 1 - distance / probe.length);
};

const THRESHOLD_FLAG = 0.85; // below this → flag as mismatch
const THRESHOLD_HALLUCINATED = 0.5; // below this → CRITICAL hallucination

export const validateCitations = (
  extraction: ExtractionResponse,
  pages: string[]
): CitationIssue[] => {
  const issues: CitationIssue[] = [];
  const fullText = pages.join(' ');

  for (const clause of extraction.clauses ?? []) {
    if (!clause.content) continue;
    const quote = clause.content;

    // Check the cited page first
    const cited = clause.pageNumber;
    let citedSim = 0;
    if (cited != null && cited >= 1 && cited <= pages.length) {
      citedSim = similarity(quote, pages[cited - 1]);
    }

    if (citedSim >= THRESHOLD_FLAG) continue; // good match on cited page

    // Search the rest of the document for a better match
    let bestPage: number | null = null;
    let bestSim = 0;
    for (let i = 0; i < pages.length; i++) {
      if (i + 1 === cited) continue;
      const s = similarity(quote, pages[i]);
      if (s > bestSim) {
        bestSim = s;
        bestPage = i + 1;
      }
    }

    const globalBest = Math.max(citedSim, bestSim, similarity(quote, fullText));

    if (globalBest < THRESHOLD_HALLUCINATED) {
      issues.push({
        type: 'HALLUCINATED_QUOTE',
        severity: 'HIGH',
        clauseType: clause.clauseType,
        quote: quote.slice(0, 200),
        citedPage: cited ?? null,
        similarity: globalBest,
        description: `Quote does not appear anywhere in the document (best similarity ${(globalBest * 100).toFixed(0)}%).`,
      });
    } else if (bestSim > citedSim && bestSim >= THRESHOLD_FLAG) {
      issues.push({
        type: 'WRONG_PAGE',
        severity: 'MEDIUM',
        clauseType: clause.clauseType,
        quote: quote.slice(0, 200),
        citedPage: cited ?? null,
        actualPage: bestPage,
        similarity: bestSim,
        description: `Quote appears on page ${bestPage}, not cited page ${cited}.`,
      });
    } else {
      issues.push({
        type: 'HALLUCINATED_QUOTE',
        severity: 'MEDIUM',
        clauseType: clause.clauseType,
        quote: quote.slice(0, 200),
        citedPage: cited ?? null,
        similarity: globalBest,
        description: `Quote only loosely matches source (best similarity ${(globalBest * 100).toFixed(0)}%).`,
      });
    }
  }

  return issues;
};
