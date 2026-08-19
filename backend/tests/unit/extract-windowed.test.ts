/**
 * Windowed extraction orchestration, with the model mocked.
 *
 * Anthropic credits are exhausted, so this is the only end-to-end exercise
 * available for the fan-out → merge → consolidate path. It covers the parts
 * that are ours rather than the model's: which windows get built, whether page
 * provenance survives the round trip, and what happens when a window fails.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ExtractionResponse } from '../../src/integrations/claude/schema';

const extractDocument = vi.fn();
const consolidateExtraction = vi.fn();

vi.mock('../../src/integrations/claude/extract', () => ({
  extractDocument: (...args: unknown[]) => extractDocument(...args),
}));
vi.mock('../../src/integrations/claude/consolidate', async () => {
  const actual = await vi.importActual<
    typeof import('../../src/integrations/claude/consolidate')
  >('../../src/integrations/claude/consolidate');
  return {
    ...actual,
    consolidateExtraction: (...args: unknown[]) => consolidateExtraction(...args),
  };
});

// vi.mock is hoisted above imports, so a plain import already sees the mocks.
import { extractDocumentWindowed } from '../../src/integrations/claude/extract-windowed';

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

const pages = (n: number) =>
  Array.from({ length: n }, (_, i) => `Page ${i + 1} body text, long enough to matter.`);

const opts = {
  filename: 'big-spa.pdf',
  documentType: 'SPA' as const,
  extractOptions: { playbook: null, companyPlaybookMarkdown: null },
  windowPages: 40,
  overlapPages: 3,
  skipConsolidation: true,
};

beforeEach(() => {
  extractDocument.mockReset();
  consolidateExtraction.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('extractDocumentWindowed — fan-out', () => {
  it('splits a 300-page document into overlapping windows', async () => {
    extractDocument.mockResolvedValue(base());
    const result = await extractDocumentWindowed({
      ...opts,
      source: { kind: 'text', pages: pages(300) },
    });
    expect(extractDocument).toHaveBeenCalledTimes(result.stats.windowsPlanned);
    expect(result.stats.windowsPlanned).toBeGreaterThan(1);
  });

  it('sends page-marked text with ABSOLUTE markers and does not renumber', async () => {
    extractDocument.mockResolvedValue(base());
    await extractDocumentWindowed({ ...opts, source: { kind: 'text', pages: pages(100) } });

    const [input, options] = extractDocument.mock.calls[1];
    expect(input.kind).toBe('text');
    expect(input.pageMarked).toBe(true);
    // Second window starts at page 38 — the marker must say 38, not 1.
    expect(input.text).toContain('=== Page 38 ===');
    expect(options.windowContext.absolutePages).toBe(true);
  });

  it('tells the sliced-PDF path to renumber from 1, since we offset it back', async () => {
    extractDocument.mockResolvedValue(base());
    // A real PDF is needed for pdf-lib to slice; build one.
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    for (let i = 0; i < 100; i += 1) doc.addPage();
    const bytes = Buffer.from(await doc.save());

    await extractDocumentWindowed({
      ...opts,
      source: { kind: 'pdf', bytes, pageCount: 100 },
    });

    const [input, options] = extractDocument.mock.calls[0];
    expect(input.kind).toBe('pdf');
    expect(options.windowContext.absolutePages).toBe(false);
  });

  it('restores absolute pages from a window-relative PDF read', async () => {
    const { PDFDocument } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    for (let i = 0; i < 100; i += 1) doc.addPage();
    const bytes = Buffer.from(await doc.save());

    // Every window reports "page 5" of itself.
    extractDocument.mockResolvedValue(
      base({
        clauses: [
          {
            clauseType: 'INDEMNIFICATION',
            title: null,
            content: 'Unique content for window offset check number',
            pageNumber: 5,
            riskLevel: 'LOW',
            confidence: 0.9,
          },
        ],
      })
    );

    const { extraction } = await extractDocumentWindowed({
      ...opts,
      source: { kind: 'pdf', bytes, pageCount: 100 },
    });
    // Identical content dedupes to one clause, at the earliest absolute page:
    // window 0 starts at page 1, so relative page 5 is absolute page 5.
    expect(extraction.clauses[0].pageNumber).toBe(5);
  });
});

describe('extractDocumentWindowed — failure handling', () => {
  it('salvages a failed window by halving it instead of failing the document', async () => {
    // Window 2 (pages 38-77) fails once; both of its halves then succeed.
    let call = 0;
    extractDocument.mockImplementation(() => {
      call += 1;
      if (call === 2) return Promise.reject(new Error('output truncated'));
      return Promise.resolve(base());
    });

    const { failedRanges, stats } = await extractDocumentWindowed({
      ...opts,
      source: { kind: 'text', pages: pages(300) },
    });
    expect(failedRanges).toHaveLength(0);
    expect(stats.windowsFailed).toBe(0);
    // 8 planned + 2 salvage halves.
    expect(extractDocument).toHaveBeenCalledTimes(stats.windowsPlanned + 2);
  });

  it('fails the document when salvage also fails, rather than emitting silent gaps', async () => {
    // Pages 38-77 fail on the first pass AND on both halves.
    extractDocument.mockImplementation((input: { text?: string }) => {
      // Page 58 sits inside window 38-77 and inside BOTH of its salvage halves
      // (38-60 and 55-77), but outside its neighbours — so exactly one planned
      // window fails and salvage cannot rescue it.
      const text = input.text ?? '';
      return text.includes('=== Page 58 ===')
        ? Promise.reject(new Error('window blew up'))
        : Promise.resolve(base());
    });

    await expect(
      extractDocumentWindowed({ ...opts, source: { kind: 'text', pages: pages(300) } })
    ).rejects.toThrow(/lost pages/);
  });

  it('marks a partial read as INCOMPLETE and names the missing pages', async () => {
    extractDocument.mockImplementation((input: { text?: string }) => {
      // Page 58 sits inside window 38-77 and inside BOTH of its salvage halves
      // (38-60 and 55-77), but outside its neighbours — so exactly one planned
      // window fails and salvage cannot rescue it.
      const text = input.text ?? '';
      return text.includes('=== Page 58 ===')
        ? Promise.reject(new Error('window blew up'))
        : Promise.resolve(base());
    });

    const { extraction, failedRanges, stats } = await extractDocumentWindowed({
      ...opts,
      source: { kind: 'text', pages: pages(300) },
      allowPartial: true,
    });

    expect(failedRanges).toHaveLength(1);
    expect(stats.windowsFailed).toBe(1);
    expect(extraction.confidenceReason).toContain('INCOMPLETE');
    expect(extraction.confidenceReason).toContain('pp.38-77');
    expect(extraction.confidenceScore).toBeLessThanOrEqual(50);
  });

  it('treats one salvaged half as a gap, not a success', async () => {
    // Only the SECOND half of the failed window recovers. Half a range is still
    // a hole, and recording it as covered is the exact failure this prevents.
    let call = 0;
    extractDocument.mockImplementation(() => {
      call += 1;
      if (call === 2) return Promise.reject(new Error('output truncated'));
      // First salvage half (call 9) also fails; second (call 10) succeeds.
      if (call === 9) return Promise.reject(new Error('still too dense'));
      return Promise.resolve(base());
    });

    const { failedRanges } = await extractDocumentWindowed({
      ...opts,
      source: { kind: 'text', pages: pages(300) },
      allowPartial: true,
    });
    expect(failedRanges).toEqual([{ startPage: 38, endPage: 77 }]);
  });

  it('throws when every window fails', async () => {
    extractDocument.mockRejectedValue(new Error('all dead'));
    await expect(
      extractDocumentWindowed({
        ...opts,
        source: { kind: 'text', pages: pages(300) },
        allowPartial: true,
      })
    ).rejects.toThrow(/every window failed/);
  });
});

describe('extractDocumentWindowed — consolidation', () => {
  it('applies the document-level verdict over the deterministic merge', async () => {
    extractDocument.mockResolvedValue(base({ riskScore: 3, riskLevel: 'LOW' }));
    consolidateExtraction.mockResolvedValue({
      riskScore: 9,
      riskLevel: 'HIGH',
      riskSummary: 'Change of control is fatal.',
      confidenceScore: 88,
      confidenceReason: 'Complete read.',
      parties: ['Acme'],
      effectiveDate: null,
      governingLaw: 'Delaware',
      currency: null,
      dealValue: null,
      crossWindowFindings: [
        { note: 'Cap in §9.3 undermined by carve-out in §12.1.', severity: 'HIGH', clauseTypes: ['CAP_ON_LIABILITY'], pageNumbers: [93, 121] },
      ],
    });

    const { extraction, stats } = await extractDocumentWindowed({
      ...opts,
      skipConsolidation: false,
      source: { kind: 'text', pages: pages(300) },
    });

    expect(stats.consolidated).toBe(true);
    expect(extraction.riskScore).toBe(9);
    expect(extraction.governingLaw).toBe('Delaware');
    // Cross-window findings must reach the summary, not die in the response.
    expect(extraction.riskSummary).toContain('§9.3');
    expect(extraction.riskSummary).toContain('pp. 93, 121');
  });

  it('survives a consolidation failure by keeping the deterministic merge', async () => {
    extractDocument.mockResolvedValue(base({ riskScore: 6, riskLevel: 'MEDIUM' }));
    consolidateExtraction.mockRejectedValue(new Error('consolidation died'));

    const { extraction, stats } = await extractDocumentWindowed({
      ...opts,
      skipConsolidation: false,
      source: { kind: 'text', pages: pages(300) },
    });

    expect(stats.consolidated).toBe(false);
    expect(extraction.riskScore).toBe(6);
  });

  it('does not let consolidation launder a partial read into confidence', async () => {
    extractDocument.mockImplementation((input: { text?: string }) => {
      // Page 58 sits inside window 38-77 and inside BOTH of its salvage halves
      // (38-60 and 55-77), but outside its neighbours — so exactly one planned
      // window fails and salvage cannot rescue it.
      const text = input.text ?? '';
      return text.includes('=== Page 58 ===')
        ? Promise.reject(new Error('window blew up'))
        : Promise.resolve(base());
    });
    consolidateExtraction.mockResolvedValue({
      riskScore: 5, riskLevel: 'MEDIUM', riskSummary: '', confidenceScore: 95,
      confidenceReason: 'Looks complete to me.', parties: [], effectiveDate: null,
      governingLaw: null, currency: null, dealValue: null, crossWindowFindings: [],
    });

    const { extraction } = await extractDocumentWindowed({
      ...opts,
      skipConsolidation: false,
      allowPartial: true,
      source: { kind: 'text', pages: pages(300) },
    });

    expect(extraction.confidenceScore).toBeLessThanOrEqual(50);
    expect(extraction.confidenceReason).toContain('INCOMPLETE');
  });

  it('skips consolidation for a single-window document', async () => {
    extractDocument.mockResolvedValue(base());
    await extractDocumentWindowed({
      ...opts,
      skipConsolidation: false,
      source: { kind: 'text', pages: pages(30) },
    });
    expect(consolidateExtraction).not.toHaveBeenCalled();
  });
});
