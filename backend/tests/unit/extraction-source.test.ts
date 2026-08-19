/**
 * Source preparation + verification gating.
 *
 * These guard the two behaviours that moved extraction from ~136s to ~85s:
 *   - PDFs with a text layer are sent to Claude as parsed text (~4x cheaper
 *     input) while scans keep the native PDF path,
 *   - verification is gated to material/low-confidence documents and runs off
 *     the critical path.
 * Both are silent failure modes if they regress: a scan misrouted to the text
 * path still "works", it just extracts almost nothing.
 */

import { describe, it, expect } from 'vitest';
import {
  hasUsableTextLayer,
  withPageMarkers,
  shouldVerify,
} from '../../src/services/extraction.service';

const page = (chars: number) => 'a'.repeat(chars);

describe('hasUsableTextLayer', () => {
  it('accepts a normal contract text layer', () => {
    expect(hasUsableTextLayer([page(3000), page(2800), page(3100)])).toBe(true);
  });

  it('rejects a scanned PDF that parses to stray characters', () => {
    // What an image-only PDF actually yields: a few glyphs of page furniture.
    expect(hasUsableTextLayer([page(12), page(3), page(0), page(8)])).toBe(false);
  });

  it('rejects an empty parse', () => {
    expect(hasUsableTextLayer([])).toBe(false);
  });

  it('rejects a long document whose pages are nearly all blank', () => {
    // Total chars clears the floor, but the per-page average must also hold —
    // otherwise a 200-page scan with one text page would route to text mode.
    const pages = [page(600), ...Array.from({ length: 200 }, () => page(2))];
    expect(hasUsableTextLayer(pages)).toBe(false);
  });

  it('accepts a short document that is genuinely text', () => {
    expect(hasUsableTextLayer([page(700), page(500)])).toBe(true);
  });
});

describe('withPageMarkers', () => {
  it('numbers pages from 1 so cited page numbers match the source', () => {
    const marked = withPageMarkers(['first', 'second', 'third']);
    expect(marked).toContain('=== Page 1 ===\nfirst');
    expect(marked).toContain('=== Page 3 ===\nthird');
    expect(marked).not.toContain('=== Page 0 ===');
  });

  it('preserves empty pages so later pages keep their real numbers', () => {
    const marked = withPageMarkers(['a', '', 'c']);
    expect(marked).toContain('=== Page 3 ===\nc');
  });
});

describe('shouldVerify', () => {
  const base = { isPdf: true, confidenceScore: 90 };

  it('verifies material documents', () => {
    expect(shouldVerify({ ...base, priority: 'P0' })).toBe(true);
    expect(shouldVerify({ ...base, priority: 'P1' })).toBe(true);
  });

  it('skips routine documents the model was confident about', () => {
    expect(shouldVerify({ ...base, priority: 'P2' })).toBe(false);
    expect(shouldVerify({ ...base, priority: 'P3' })).toBe(false);
  });

  it('verifies any document the model flagged as low confidence', () => {
    expect(shouldVerify({ ...base, priority: 'P3', confidenceScore: 55 })).toBe(true);
  });

  it('treats a missing confidence score as confident, not as low', () => {
    expect(shouldVerify({ isPdf: true, priority: 'P2', confidenceScore: null })).toBe(false);
  });

  it('never verifies non-PDFs — the verifier is page-text based', () => {
    expect(shouldVerify({ isPdf: false, priority: 'P0', confidenceScore: 10 })).toBe(false);
  });
});
