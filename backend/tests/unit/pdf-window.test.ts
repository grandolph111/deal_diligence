/**
 * Page-window planning and slicing.
 *
 * The invariant that matters most is **total page coverage**: a window plan
 * that skips pages produces a fact sheet with silent gaps, which in diligence
 * is worse than a failed extraction — nothing downstream can distinguish "this
 * contract has no indemnity cap" from "the pages holding it were never read".
 */

import { describe, it, expect } from 'vitest';
import {
  planWindows,
  toAbsolutePage,
  sliceTextPages,
} from '../../src/utils/pdf-window';

const opts = { windowPages: 40, overlapPages: 3 };

/** Every page 1..total appears in at least one window. */
const coveredPages = (windows: ReturnType<typeof planWindows>): Set<number> => {
  const seen = new Set<number>();
  for (const w of windows) {
    for (let p = w.startPage; p <= w.endPage; p += 1) seen.add(p);
  }
  return seen;
};

describe('planWindows', () => {
  it('returns a single window when the document fits', () => {
    expect(planWindows(40, opts)).toEqual([
      { index: 0, startPage: 1, endPage: 40, overlapWithPrevious: 0 },
    ]);
  });

  it('covers every page of a 300-page document with no gaps', () => {
    const windows = planWindows(300, opts);
    const covered = coveredPages(windows);
    expect(covered.size).toBe(300);
    for (let p = 1; p <= 300; p += 1) expect(covered.has(p)).toBe(true);
  });

  it('never leaves a page uncovered for any document size', () => {
    for (let total = 1; total <= 250; total += 1) {
      const windows = planWindows(total, opts);
      const covered = coveredPages(windows);
      expect(covered.size, `total=${total}`).toBe(total);
      expect(windows[windows.length - 1].endPage, `total=${total}`).toBe(total);
    }
  });

  it('overlaps adjacent windows so boundary clauses survive', () => {
    const windows = planWindows(300, opts);
    for (let i = 1; i < windows.length; i += 1) {
      const prev = windows[i - 1];
      const cur = windows[i];
      // The first `overlapPages` of this window were already in the last one.
      expect(cur.startPage).toBeLessThanOrEqual(prev.endPage);
      const shared = prev.endPage - cur.startPage + 1;
      expect(shared).toBeGreaterThanOrEqual(opts.overlapPages);
    }
  });

  it('folds a pure-overlap tail into the previous window', () => {
    // 42 pages at width 40 / overlap 3 would leave a 2-page tail that is
    // entirely inside its predecessor's overlap — a wasted API call.
    const windows = planWindows(42, opts);
    expect(windows).toHaveLength(1);
    expect(windows[0].endPage).toBe(42);
  });

  it('terminates when overlap is >= window width instead of looping forever', () => {
    const windows = planWindows(100, { windowPages: 5, overlapPages: 9 });
    expect(windows.length).toBeGreaterThan(0);
    expect(windows.length).toBeLessThan(200);
    expect(coveredPages(windows).size).toBe(100);
  });

  it('returns nothing for an empty document', () => {
    expect(planWindows(0, opts)).toEqual([]);
  });
});

describe('toAbsolutePage', () => {
  const window = { index: 3, startPage: 121, endPage: 160, overlapWithPrevious: 3 };

  it('offsets a window-relative page onto the source document', () => {
    expect(toAbsolutePage(1, window)).toBe(121);
    expect(toAbsolutePage(40, window)).toBe(160);
  });

  it('clamps a hallucinated page to the window it came from', () => {
    // A model reporting page 90 of a 40-page window must not produce a citation
    // pointing past the range it was actually shown.
    expect(toAbsolutePage(90, window)).toBe(160);
  });

  it('passes null through rather than inventing page 1', () => {
    expect(toAbsolutePage(null, window)).toBeNull();
    expect(toAbsolutePage(undefined, window)).toBeNull();
  });
});

describe('sliceTextPages', () => {
  const pages = ['alpha', 'bravo', 'charlie', 'delta', 'echo'];

  it('emits absolute page markers, not window-relative ones', () => {
    const text = sliceTextPages(pages, {
      index: 1,
      startPage: 3,
      endPage: 5,
      overlapWithPrevious: 1,
    });
    expect(text).toContain('=== Page 3 ===');
    expect(text).toContain('=== Page 5 ===');
    expect(text).not.toContain('=== Page 1 ===');
    expect(text).toContain('charlie');
    expect(text).not.toContain('alpha');
  });

  it('stops at the end of the available pages', () => {
    const text = sliceTextPages(pages, {
      index: 0,
      startPage: 4,
      endPage: 99,
      overlapWithPrevious: 0,
    });
    expect(text).toContain('=== Page 5 ===');
    expect(text).not.toContain('=== Page 6 ===');
  });
});
