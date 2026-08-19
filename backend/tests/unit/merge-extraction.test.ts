/**
 * Deterministic merge of per-window extractions.
 *
 * Two failure modes are silent and expensive, so both are pinned here:
 *   - page offsetting applied on the wrong path (or not at all) corrupts every
 *     citation in a long document while the fact sheet still looks plausible,
 *   - failing to collapse the overlap duplicates every boundary clause, which
 *     inflates the risk picture with phantom findings.
 */

import { describe, it, expect } from 'vitest';
import {
  mergeWindowExtractions,
  type WindowExtraction,
} from '../../src/integrations/claude/merge-extraction';
import type { ExtractionResponse } from '../../src/integrations/claude/schema';

const win = (index: number, startPage: number, endPage: number) => ({
  index,
  startPage,
  endPage,
  overlapWithPrevious: index === 0 ? 0 : 3,
});

const base = (over: Partial<ExtractionResponse> = {}): ExtractionResponse => ({
  factSheet: '',
  documentType: 'SPA',
  riskScore: 3,
  riskLevel: 'LOW',
  riskSummary: '',
  confidenceScore: 90,
  confidenceReason: '',
  parties: [],
  effectiveDate: null,
  governingLaw: null,
  currency: null,
  dealValue: null,
  pageCount: null,
  language: null,
  region: null,
  entities: [],
  clauses: [],
  relationships: [],
  ...over,
});

const clause = (over: Partial<ExtractionResponse['clauses'][number]> = {}) => ({
  clauseType: 'GOVERNING_LAW',
  title: null,
  content: 'This Agreement shall be governed by the laws of the State of Delaware.',
  pageNumber: 1,
  riskLevel: 'LOW' as const,
  confidence: 0.9,
  ...over,
});

describe('mergeWindowExtractions — page provenance', () => {
  it('offsets window-relative pages onto the source document', () => {
    const results: WindowExtraction[] = [
      {
        window: win(1, 121, 160),
        pagesAreAbsolute: false,
        extraction: base({ clauses: [clause({ pageNumber: 5 })] }),
      },
    ];
    const { extraction } = mergeWindowExtractions(results, 300);
    // Page 5 of the window starting at 121 is document page 125.
    expect(extraction.clauses[0].pageNumber).toBe(125);
  });

  it('leaves already-absolute pages untouched on the page-marked text path', () => {
    const results: WindowExtraction[] = [
      {
        window: win(1, 121, 160),
        pagesAreAbsolute: true,
        extraction: base({ clauses: [clause({ pageNumber: 125 })] }),
      },
    ];
    const { extraction } = mergeWindowExtractions(results, 300);
    // Must NOT become 245 — double-offsetting is the corruption we guard.
    expect(extraction.clauses[0].pageNumber).toBe(125);
  });
});

describe('mergeWindowExtractions — overlap dedupe', () => {
  it('collapses a clause reported identically by two overlapping windows', () => {
    const results: WindowExtraction[] = [
      {
        window: win(0, 1, 40),
        pagesAreAbsolute: true,
        extraction: base({ clauses: [clause({ pageNumber: 38 })] }),
      },
      {
        window: win(1, 38, 77),
        pagesAreAbsolute: true,
        extraction: base({ clauses: [clause({ pageNumber: 38 })] }),
      },
    ];
    const { extraction, stats } = mergeWindowExtractions(results, 120);
    expect(stats.clausesBeforeMerge).toBe(2);
    expect(extraction.clauses).toHaveLength(1);
  });

  it('folds a boundary-truncated quote into the window that saw it whole', () => {
    const whole =
      'The Seller shall indemnify the Buyer against all losses arising from any breach of the representations set out in Article IV, subject to the cap in Section 9.3.';
    const truncated = 'The Seller shall indemnify the Buyer against all losses arising from any breach of the repres';

    const results: WindowExtraction[] = [
      {
        window: win(0, 1, 40),
        pagesAreAbsolute: true,
        extraction: base({
          clauses: [clause({ clauseType: 'INDEMNIFICATION', content: truncated, pageNumber: 40 })],
        }),
      },
      {
        window: win(1, 38, 77),
        pagesAreAbsolute: true,
        extraction: base({
          clauses: [clause({ clauseType: 'INDEMNIFICATION', content: whole, pageNumber: 40 })],
        }),
      },
    ];
    const { extraction } = mergeWindowExtractions(results, 120);
    expect(extraction.clauses).toHaveLength(1);
    expect(extraction.clauses[0].content).toBe(whole);
  });

  it('keeps genuinely distinct clauses of the same type', () => {
    const results: WindowExtraction[] = [
      {
        window: win(0, 1, 40),
        pagesAreAbsolute: true,
        extraction: base({
          clauses: [
            clause({ clauseType: 'TERMINATION', content: 'Either party may terminate on 30 days notice for convenience.', pageNumber: 12 }),
            clause({ clauseType: 'TERMINATION', content: 'The Buyer may terminate immediately upon a material adverse change.', pageNumber: 13 }),
          ],
        }),
      },
    ];
    const { extraction } = mergeWindowExtractions(results, 120);
    expect(extraction.clauses).toHaveLength(2);
  });

  it('takes the most severe risk and highest confidence across duplicates', () => {
    const results: WindowExtraction[] = [
      {
        window: win(0, 1, 40),
        pagesAreAbsolute: true,
        extraction: base({ clauses: [clause({ riskLevel: 'LOW', confidence: 0.6, pageNumber: 39 })] }),
      },
      {
        window: win(1, 38, 77),
        pagesAreAbsolute: true,
        extraction: base({ clauses: [clause({ riskLevel: 'HIGH', confidence: 0.95, pageNumber: 39 })] }),
      },
    ];
    const { extraction } = mergeWindowExtractions(results, 120);
    expect(extraction.clauses[0].riskLevel).toBe('HIGH');
    expect(extraction.clauses[0].confidence).toBe(0.95);
  });
});

describe('mergeWindowExtractions — entities and relationships', () => {
  it('dedupes entities case-insensitively and keeps the earliest mention', () => {
    const entity = (text: string, pageNumber: number) => ({
      type: 'ORGANIZATION',
      text,
      normalizedText: null,
      pageNumber,
      confidence: 0.9,
    });
    const results: WindowExtraction[] = [
      { window: win(0, 1, 40), pagesAreAbsolute: true, extraction: base({ entities: [entity('Acme Holdings LLC', 12)] }) },
      { window: win(1, 38, 77), pagesAreAbsolute: true, extraction: base({ entities: [entity('ACME HOLDINGS LLC', 55)] }) },
    ];
    const { extraction } = mergeWindowExtractions(results, 120);
    expect(extraction.entities).toHaveLength(1);
    expect(extraction.entities[0].pageNumber).toBe(12);
  });

  it('unions parties across windows, first spelling wins', () => {
    const results: WindowExtraction[] = [
      { window: win(0, 1, 40), pagesAreAbsolute: true, extraction: base({ parties: ['Acme Holdings LLC'] }) },
      { window: win(1, 38, 77), pagesAreAbsolute: true, extraction: base({ parties: ['ACME HOLDINGS LLC', 'Beta Corp'] }) },
    ];
    const { extraction } = mergeWindowExtractions(results, 120);
    expect(extraction.parties).toEqual(['Acme Holdings LLC', 'Beta Corp']);
  });
});

describe('mergeWindowExtractions — document-level scalars', () => {
  it('resolves disagreement by majority vote, not by first-seen', () => {
    const results: WindowExtraction[] = [
      { window: win(0, 1, 40), pagesAreAbsolute: true, extraction: base({ governingLaw: 'New York' }) },
      { window: win(1, 38, 77), pagesAreAbsolute: true, extraction: base({ governingLaw: 'Delaware' }) },
      { window: win(2, 75, 114), pagesAreAbsolute: true, extraction: base({ governingLaw: 'Delaware' }) },
    ];
    const { extraction } = mergeWindowExtractions(results, 120);
    expect(extraction.governingLaw).toBe('Delaware');
  });

  it('ignores windows that saw nothing rather than voting null', () => {
    const results: WindowExtraction[] = [
      { window: win(0, 1, 40), pagesAreAbsolute: true, extraction: base({ governingLaw: null }) },
      { window: win(1, 38, 77), pagesAreAbsolute: true, extraction: base({ governingLaw: null }) },
      { window: win(2, 75, 114), pagesAreAbsolute: true, extraction: base({ governingLaw: 'Delaware' }) },
    ];
    const { extraction } = mergeWindowExtractions(results, 120);
    expect(extraction.governingLaw).toBe('Delaware');
  });

  it('takes the worst risk and the weakest confidence as a deterministic floor', () => {
    const results: WindowExtraction[] = [
      { window: win(0, 1, 40), pagesAreAbsolute: true, extraction: base({ riskScore: 2, riskLevel: 'LOW', confidenceScore: 95 }) },
      { window: win(1, 38, 77), pagesAreAbsolute: true, extraction: base({ riskScore: 8, riskLevel: 'HIGH', confidenceScore: 70 }) },
    ];
    const { extraction } = mergeWindowExtractions(results, 120);
    expect(extraction.riskScore).toBe(8);
    expect(extraction.riskLevel).toBe('HIGH');
    expect(extraction.confidenceScore).toBe(70);
  });

  it('records the true document page count, not a window count', () => {
    const results: WindowExtraction[] = [
      { window: win(0, 1, 40), pagesAreAbsolute: true, extraction: base({ pageCount: 40 }) },
    ];
    const { extraction } = mergeWindowExtractions(results, 300);
    expect(extraction.pageCount).toBe(300);
  });

  it('throws rather than silently returning an empty document', () => {
    expect(() => mergeWindowExtractions([], 300)).toThrow();
  });
});
