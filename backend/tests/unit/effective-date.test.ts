/**
 * effectiveDate parsing.
 *
 * This is the guard for the failure that actually destroyed documents: the
 * extraction schema types `effectiveDate` as a bare string, so the model
 * sometimes returns prose. Handing that to `new Date()` produced Invalid Date,
 * Prisma rejected the whole update, and the error path re-ran the ENTIRE
 * extraction four times before giving up — discarding a fact sheet, risk score
 * and summary that had all already succeeded. Four documents in the CUAD deal
 * died this way, at four Sonnet extractions each.
 *
 * The rule: a date we cannot read is worth nothing, the extraction around it is
 * worth a lot. Never let the field take the document down with it.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/config/database', () => ({ prisma: {} }));
vi.mock('../../src/services/s3.service', () => ({ s3Service: {} }));
vi.mock('../../src/services/parsed-page-cache.service', () => ({
  deleteParsedPages: vi.fn(),
  getParsedPages: vi.fn(),
  putParsedPages: vi.fn(),
}));
vi.mock('../../src/services/reconciliation.service', () => ({ reconciliationService: {} }));
vi.mock('../../src/services/library-writer.service', () => ({ libraryWriterService: {} }));
vi.mock('../../src/services/triage.service', () => ({ triageService: {} }));
vi.mock('../../src/services/statistical-anomaly.service', () => ({}));
vi.mock('../../src/services/entity-blocking.service', () => ({}));
vi.mock('../../src/integrations/claude', () => ({
  extractDocument: vi.fn(),
  classifyDocument: vi.fn(),
  verifyExtraction: vi.fn(),
}));

import { parseEffectiveDate } from '../../src/services/extraction.service';

describe('parseEffectiveDate', () => {
  it('parses a real date', () => {
    const d = parseEffectiveDate('2019-03-26');
    expect(d).toBeInstanceOf(Date);
    expect(d?.toISOString().slice(0, 10)).toBe('2019-03-26');
  });

  it('returns null for prose instead of throwing or yielding Invalid Date', () => {
    // These are the shapes the model actually emits when a contract has no
    // clean execution date.
    for (const raw of [
      'upon execution',
      'see §2.1',
      'the Effective Date',
      'TBD',
      'not stated',
    ]) {
      const d = parseEffectiveDate(raw);
      expect(d, `expected null for ${JSON.stringify(raw)}`).toBeNull();
    }
  });

  it('never returns an Invalid Date — the value Prisma rejects', () => {
    const d = parseEffectiveDate('nonsense that is not a date');
    // The specific failure: `new Date("...")` is an object, passes a null check,
    // and only blows up at the database boundary.
    expect(d === null || !Number.isNaN(d.getTime())).toBe(true);
  });

  it('treats null / undefined / empty as absent', () => {
    expect(parseEffectiveDate(null)).toBeNull();
    expect(parseEffectiveDate(undefined)).toBeNull();
    expect(parseEffectiveDate('')).toBeNull();
  });

  it('rejects implausible years that parse but cannot be contract dates', () => {
    expect(parseEffectiveDate('0001-01-01')).toBeNull();
    expect(parseEffectiveDate('+275760-09-13')).toBeNull();
  });
});
