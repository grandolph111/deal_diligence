/**
 * Regression tests for the deterministic citation validator.
 *
 * These lock in the behaviour after the "Pattern too long for this browser"
 * fix — a latent crash where any quote > 32 chars that wasn't an exact substring
 * threw inside diff-match-patch and was silently swallowed upstream, so the
 * validator reported nothing on exactly the cases it exists to catch.
 *
 * Pure + offline: no DB, no Claude. Runs on every `npm test`.
 */

import { describe, it, expect } from 'vitest';
import { validateCitations } from '../../src/utils/citation-validator';
import type { ExtractionResponse } from '../../src/integrations/claude/schema';

const pages = [
  `SHARE PURCHASE AGREEMENT. This Agreement is made between Acme Corporation ("Seller") and Beta Holdings LLC ("Buyer"). The aggregate purchase price shall be Fifty Million Dollars ($50,000,000), payable at Closing.`,
  `INDEMNIFICATION. The Seller shall indemnify and hold harmless the Buyer from any losses arising out of a breach of the representations, provided that the Seller's aggregate liability shall not exceed fifteen percent (15%) of the Purchase Price, and claims must survive for eighteen (18) months following the Closing Date.`,
  `GOVERNING LAW. This Agreement shall be governed by the laws of the State of Delaware. CHANGE OF CONTROL. Any transfer of more than fifty percent (50%) of the equity shall constitute a change of control requiring prior written consent.`,
];

const clause = (clauseType: string, content: string, pageNumber: number | null) => ({
  clauseType,
  content,
  pageNumber,
  title: null,
  riskLevel: null as null,
  confidence: 0.9,
});

const run = (...clauses: ReturnType<typeof clause>[]) =>
  validateCitations({ clauses } as unknown as ExtractionResponse, pages);

describe('validateCitations', () => {
  it('passes an exact verbatim quote on the correct page', () => {
    const issues = run(
      clause('PRICE', 'The aggregate purchase price shall be Fifty Million Dollars ($50,000,000), payable at Closing.', 1)
    );
    expect(issues).toHaveLength(0);
  });

  it('flags a verbatim quote cited on the wrong page and locates the real page', () => {
    const issues = run(
      clause('INDEMN', "the Seller's aggregate liability shall not exceed fifteen percent (15%) of the Purchase Price", 1)
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('WRONG_PAGE');
    expect(issues[0].actualPage).toBe(2);
  });

  it('flags a fabricated quote as HALLUCINATED_QUOTE', () => {
    const issues = run(
      clause('TERM', 'Either party may terminate this Agreement upon 90 days notice without cause or penalty.', 2)
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('HALLUCINATED_QUOTE');
    expect(issues[0].similarity).toBeLessThan(0.5);
  });

  it('tolerates a minor OCR typo (does not flag)', () => {
    const issues = run(
      clause('PRICE', 'The aggregate purchase price shall be Fifity Million Dollars ($50,000,000), payable at Closing.', 1)
    );
    expect(issues).toHaveLength(0);
  });

  it('tolerates whitespace / smart-quote normalization differences', () => {
    const issues = run(
      clause('CTRL', 'Any transfer of more than fifty percent (50%)  of the equity shall constitute a change of control', 3)
    );
    expect(issues).toHaveLength(0);
  });

  it('flags a paraphrase (not a verbatim quote) for downstream review', () => {
    const issues = run(
      clause('INDEMN', 'The seller must cover the buyer for losses, but its total exposure is capped at 15% of the price for 18 months.', 2)
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe('HALLUCINATED_QUOTE');
  });

  it('REGRESSION: does not throw on a long, non-substring quote (bitap 32-char limit)', () => {
    // The original bug: any quote > 32 chars not found as an exact substring threw
    // "Pattern too long for this browser" inside match_main. Must never throw.
    expect(() =>
      run(clause('X', 'This is a long clause quote that exceeds thirty two characters and is not present verbatim anywhere.', 1))
    ).not.toThrow();
  });

  it('does not throw on an out-of-range cited page', () => {
    expect(() => run(clause('X', 'governed by the laws of the State of Delaware', 99))).not.toThrow();
  });

  it('skips clauses with empty content', () => {
    const issues = run(clause('EMPTY', '', 1));
    expect(issues).toHaveLength(0);
  });
});
