/**
 * Anchor → verbatim span resolution.
 *
 * The property that matters is that a resolved span is byte-identical to the
 * source. That is what makes hallucinated quotes structurally impossible rather
 * than merely detectable, so every test here asserts against the original page
 * text, not against a normalized form.
 */

import { describe, it, expect } from 'vitest';
import { resolveAnchor, resolveExtractionAnchors } from '../../src/utils/anchor-resolver';

const CLAUSE =
  'The Seller shall indemnify, defend and hold harmless the Buyer from and against any and all Losses arising out of any breach of the representations and warranties set forth in Article IV, subject to the limitations in Section 9.3.';

const pages = [
  'RECITALS\n\nWHEREAS the parties wish to effect the Transaction on the terms below.',
  `ARTICLE IX\n\n9.1 Indemnification. ${CLAUSE}\n\n9.2 Notice. Any claim shall be made in writing.`,
  'ARTICLE X\n\n10.1 Governing Law. This Agreement shall be governed by the laws of the State of Delaware.',
];

describe('resolveAnchor', () => {
  it('recovers the exact span, byte-identical to the source', () => {
    const r = resolveAnchor(pages, {
      startAnchor: 'The Seller shall indemnify, defend',
      endAnchor: 'the limitations in Section 9.3.',
      citedPage: 2,
    });
    expect(r).not.toBeNull();
    expect(r!.text).toBe(CLAUSE);
    expect(pages[1]).toContain(r!.text);
    expect(r!.pageNumber).toBe(2);
  });

  it('matches through whitespace and smart-quote noise in the text layer', () => {
    // PDF text layers routinely break lines mid-clause and use curly quotes.
    const noisy = [
      'ARTICLE IX\n\n9.1 Indemnification. The Seller shall\nindemnify,   defend and hold\nharmless the Buyer from “Losses” as defined.',
    ];
    const r = resolveAnchor(noisy, {
      startAnchor: 'The Seller shall indemnify, defend',
      endAnchor: 'from "Losses" as defined.',
      citedPage: 1,
    });
    expect(r).not.toBeNull();
    // Original characters preserved — line breaks and curly quotes intact.
    expect(r!.text).toContain('\n');
    expect(r!.text).toContain('“Losses”');
    expect(noisy[0]).toContain(r!.text);
  });

  it('corrects a wrong cited page instead of losing the clause', () => {
    const r = resolveAnchor(pages, {
      startAnchor: 'The Seller shall indemnify',
      endAnchor: 'Section 9.3.',
      citedPage: 1, // model cited the wrong page
    });
    expect(r).not.toBeNull();
    expect(r!.pageNumber).toBe(2);
    expect(r!.pageCorrected).toBe(true);
  });

  it('resolves a clause that runs across a page break', () => {
    const split = [
      'ARTICLE IX\n\n9.1 Indemnification. The Seller shall indemnify, defend and hold harmless the Buyer',
      'from and against any and all Losses arising out of any breach, subject to Section 9.3.',
    ];
    const r = resolveAnchor(split, {
      startAnchor: 'The Seller shall indemnify, defend',
      endAnchor: 'subject to Section 9.3.',
      citedPage: 1,
    });
    expect(r).not.toBeNull();
    expect(r!.method).toBe('page-spanning');
    expect(r!.text).toContain('hold harmless the Buyer');
    expect(r!.text).toContain('subject to Section 9.3.');
    expect(r!.pageNumber).toBe(1);
  });

  it('returns null when the anchor is not in the document at all', () => {
    // This is the hallucination case. Reporting nothing is the honest answer;
    // returning a plausible span from elsewhere would be the failure mode the
    // whole design exists to remove.
    const r = resolveAnchor(pages, {
      startAnchor: 'The Purchaser grants an exclusive perpetual license',
      endAnchor: 'in all territories worldwide.',
      citedPage: 2,
    });
    expect(r).toBeNull();
  });

  it('falls back to the start anchor when the end anchor is missing', () => {
    const r = resolveAnchor(pages, {
      startAnchor: 'The Seller shall indemnify, defend and hold harmless',
      endAnchor: 'this phrase does not appear anywhere in the contract',
      citedPage: 2,
    });
    expect(r).not.toBeNull();
    expect(r!.method).toBe('start-only');
    expect(pages[1]).toContain(r!.text);
  });

  it('refuses anchors too short to locate anything', () => {
    expect(resolveAnchor(pages, { startAnchor: 'The', citedPage: 2 })).toBeNull();
    expect(resolveAnchor(pages, { startAnchor: '', citedPage: 2 })).toBeNull();
  });

  it('returns null when there is no text layer to resolve against', () => {
    // Scans keep the verbatim-quote contract; anchoring cannot apply.
    expect(resolveAnchor([], { startAnchor: 'The Seller shall indemnify' })).toBeNull();
  });

  it('caps a runaway span rather than emitting unrelated contract text', () => {
    const long = ['START OF CLAUSE ' + 'filler text here. '.repeat(2_000) + 'END MARKER HERE.'];
    const r = resolveAnchor(long, {
      startAnchor: 'START OF CLAUSE filler text',
      endAnchor: 'END MARKER HERE.',
      citedPage: 1,
    });
    expect(r).not.toBeNull();
    expect(r!.text.length).toBeLessThanOrEqual(6_000);
  });

  it('finds a clause anywhere in the document when the cited page is far off', () => {
    const r = resolveAnchor(pages, {
      startAnchor: 'This Agreement shall be governed by the laws',
      endAnchor: 'the State of Delaware.',
      citedPage: 99,
    });
    expect(r).not.toBeNull();
    expect(r!.pageNumber).toBe(3);
    expect(r!.text).toContain('State of Delaware');
  });
});

describe('resolveExtractionAnchors', () => {
  const clause = (over: Record<string, unknown> = {}) => ({
    clauseType: 'INDEMNIFICATION',
    content: '',
    startAnchor: 'The Seller shall indemnify, defend',
    endAnchor: 'the limitations in Section 9.3.',
    pageNumber: 2,
    confidence: 0.9,
    ...over,
  });

  const extraction = (clauses: ReturnType<typeof clause>[]) => ({
    clauses,
    confidenceScore: 90,
    confidenceReason: 'Baseline.',
  });

  it('fills content from the source and corrects the page', () => {
    const e = extraction([clause({ pageNumber: 1 })]);
    const { stats } = resolveExtractionAnchors(e, pages);
    expect(stats.resolved).toBe(1);
    expect(stats.pagesCorrected).toBe(1);
    expect(e.clauses[0].content).toBe(CLAUSE);
    expect(e.clauses[0].pageNumber).toBe(2);
  });

  it('keeps the model’s own quote when an anchor will not resolve', () => {
    // The prompt offers this escape hatch for clauses the model cannot anchor.
    const e = extraction([
      clause({
        startAnchor: 'Wording that appears nowhere in this contract at all',
        endAnchor: 'nor does this',
        content: 'A quote the model wrote out instead.',
      }),
    ]);
    const { stats } = resolveExtractionAnchors(e, pages);
    expect(stats.fellBackToQuote).toBe(1);
    expect(stats.resolved).toBe(0);
    expect(e.clauses).toHaveLength(1);
  });

  it('drops a clause with neither a resolvable anchor nor a quote', () => {
    // The model asserted a clause it cannot point to anywhere in the document.
    const e = extraction([
      clause({ startAnchor: 'Entirely fabricated provision language here', content: '' }),
    ]);
    const { stats } = resolveExtractionAnchors(e, pages);
    expect(stats.dropped).toBe(1);
    expect(e.clauses).toHaveLength(0);
    expect(e.confidenceReason).toContain('dropped');
  });

  it('collapses confidence when a large share of clauses are unanchorable', () => {
    const good = clause();
    const bad = () => clause({ startAnchor: 'Nonexistent provision text here', content: '' });
    const e = extraction([good, bad(), bad(), bad()]);
    resolveExtractionAnchors(e, pages);
    // 3 of 4 dropped — the result must not still look confident.
    expect(e.confidenceScore).toBeLessThanOrEqual(60);
  });

  it('lowers confidence on a partial start-only resolution', () => {
    const e = extraction([
      clause({ endAnchor: 'text that is not in the document anywhere', confidence: 0.95 }),
    ]);
    resolveExtractionAnchors(e, pages);
    expect(e.clauses[0].confidence).toBeLessThanOrEqual(0.75);
  });

  it('is a no-op without a text layer, leaving verbatim quotes untouched', () => {
    // Scans keep the old contract; nothing may be dropped for lack of anchors.
    const e = extraction([clause({ content: 'A verbatim quote from a scan.' })]);
    const { stats } = resolveExtractionAnchors(e, []);
    expect(stats.dropped).toBe(0);
    expect(e.clauses).toHaveLength(1);
    expect(e.clauses[0].content).toBe('A verbatim quote from a scan.');
  });
});

describe('anchor distinctiveness', () => {
  // A generic anchor is the dangerous failure: the span it resolves to is
  // genuinely verbatim, on a real page, and belongs to the wrong clause.
  const repeated = [
    'Notwithstanding the foregoing, the Buyer may inspect the premises on notice.',
    'Notwithstanding the foregoing, the Seller retains all pre-Closing liabilities.',
  ];

  it('counts every place a generic anchor matches', () => {
    const r = resolveAnchor(repeated, {
      startAnchor: 'Notwithstanding the foregoing,',
      endAnchor: 'on notice.',
      citedPage: 1,
    });
    expect(r).not.toBeNull();
    expect(r!.occurrences).toBeGreaterThan(1);
  });

  it('prefers the occurrence on the cited page', () => {
    const r = resolveAnchor(repeated, {
      startAnchor: 'Notwithstanding the foregoing,',
      endAnchor: 'pre-Closing liabilities.',
      citedPage: 2,
    });
    expect(r).not.toBeNull();
    expect(r!.pageNumber).toBe(2);
    expect(r!.text).toContain('Seller retains');
  });

  it('reports a distinctive anchor as unambiguous', () => {
    const r = resolveAnchor(pages, {
      startAnchor: 'The Seller shall indemnify, defend',
      endAnchor: 'the limitations in Section 9.3.',
      citedPage: 2,
    });
    expect(r!.occurrences).toBe(1);
  });

  it('discounts confidence hard when the anchor was ambiguous', () => {
    // Halving confidence is the point: an ambiguous span passes every
    // downstream grounding check while potentially being the wrong clause, so
    // the discount is the only signal reviewers get.
    const e = {
      clauses: [
        {
          clauseType: 'MISC',
          content: '',
          startAnchor: 'Notwithstanding the foregoing,',
          endAnchor: 'on notice.',
          pageNumber: 1,
          confidence: 0.95,
        },
      ],
      confidenceScore: 90,
      confidenceReason: '',
    };
    const { stats } = resolveExtractionAnchors(e, repeated);
    expect(stats.ambiguousAnchors).toBe(1);
    expect(e.clauses[0].confidence).toBeLessThanOrEqual(0.5);
  });
});

describe('offsets for re-verification', () => {
  it('returns page-relative offsets that re-slice to the same text', () => {
    // This is the property that makes a clause mechanically re-checkable:
    // slice the page at the stored offsets and you must get `content` back.
    const r = resolveAnchor(pages, {
      startAnchor: 'The Seller shall indemnify, defend',
      endAnchor: 'the limitations in Section 9.3.',
      citedPage: 2,
    });
    expect(r).not.toBeNull();
    const page = pages[r!.pageNumber - 1];
    expect(page.slice(r!.startOffset, r!.endOffset)).toBe(r!.text);
  });

  it('carries offsets onto the clause so they can be persisted', () => {
    const e = {
      clauses: [
        {
          clauseType: 'INDEMNIFICATION',
          content: '',
          startAnchor: 'The Seller shall indemnify, defend',
          endAnchor: 'the limitations in Section 9.3.',
          pageNumber: 2,
          confidence: 0.9,
        },
      ],
      confidenceScore: 90,
      confidenceReason: '',
    };
    resolveExtractionAnchors(e, pages);
    const c = e.clauses[0] as { startOffset?: number; endOffset?: number; content: string };
    expect(typeof c.startOffset).toBe('number');
    expect(pages[1].slice(c.startOffset, c.endOffset)).toBe(c.content);
  });
});
