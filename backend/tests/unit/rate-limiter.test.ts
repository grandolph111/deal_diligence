/**
 * Token-aware admission control.
 *
 * The extraction queue caps concurrent *documents*, which cannot bound token
 * draw: eight NDAs and eight 300-page SPAs are the same number of documents and
 * roughly a hundred times apart in tokens. These tests pin the properties that
 * make the token bucket a real bound rather than a decoration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  acquire,
  pauseAll,
  syncFromHeaders,
  estimateInputTokens,
  rateLimiterStats,
  __resetRateLimiter,
} from '../../src/integrations/claude/rate-limiter';

beforeEach(() => {
  __resetRateLimiter();
});

describe('acquire', () => {
  it('admits a call that fits and debits the bucket', async () => {
    const before = rateLimiterStats().inputTokens;
    const r = await acquire({ inputTokens: 50_000, expectedOutputTokens: 4_000, label: 'test' });
    expect(rateLimiterStats().inputTokens).toBeLessThanOrEqual(before - 50_000 + 1);
    r.settle({ inputTokens: 50_000, outputTokens: 1_000 });
  });

  it('refunds the unused output reservation on settle', async () => {
    // max_tokens is a ceiling, not a spend. Reserving it without refunding the
    // difference would throttle on hypothetical output and collapse throughput.
    const r = await acquire({ inputTokens: 1_000, expectedOutputTokens: 32_000, label: 'test' });
    const reserved = rateLimiterStats().outputTokens;
    r.settle({ inputTokens: 1_000, outputTokens: 500 });
    expect(rateLimiterStats().outputTokens).toBeGreaterThan(reserved);
  });

  it('is idempotent — a double settle does not refund twice', async () => {
    const r = await acquire({ inputTokens: 1_000, expectedOutputTokens: 20_000, label: 'test' });
    r.settle({ inputTokens: 1_000, outputTokens: 0 });
    const after = rateLimiterStats().outputTokens;
    r.settle({ inputTokens: 1_000, outputTokens: 0 });
    expect(rateLimiterStats().outputTokens).toBe(after);
  });

  it('queues a call that does not fit instead of admitting it', async () => {
    const budget = rateLimiterStats().budgets.itpm;
    const first = await acquire({ inputTokens: budget, expectedOutputTokens: 1_000, label: 'big' });

    let admitted = false;
    void acquire({ inputTokens: budget, expectedOutputTokens: 1_000, label: 'second' }).then(() => {
      admitted = true;
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(admitted).toBe(false);
    first.settle({ inputTokens: 0, outputTokens: 0 });
  });

  it('serves waiters FIFO so a large job is not starved by small ones', async () => {
    const budget = rateLimiterStats().budgets.itpm;
    // Drain the bucket so everything queues behind the head.
    const hold = await acquire({ inputTokens: budget, expectedOutputTokens: 1_000, label: 'hold' });

    const order: string[] = [];
    const big = acquire({ inputTokens: budget, expectedOutputTokens: 1_000, label: 'big' })
      .then((r) => { order.push('big'); r.settle({ inputTokens: 0, outputTokens: 0 }); });
    const small = acquire({ inputTokens: 100, expectedOutputTokens: 100, label: 'small' })
      .then((r) => { order.push('small'); r.settle({ inputTokens: 0, outputTokens: 0 }); });

    // Refund the drain; the queued head ('big') must go first even though
    // 'small' would fit immediately.
    hold.settle({ inputTokens: 0, outputTokens: 0 });
    await Promise.all([big, small]);
    expect(order).toEqual(['big', 'small']);
  });

  it('admits an over-budget call at capacity rather than deadlocking', async () => {
    const budget = rateLimiterStats().budgets.itpm;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await acquire({
      inputTokens: budget * 10,
      expectedOutputTokens: 1_000,
      label: 'oversized',
    });
    expect(warn).toHaveBeenCalled();
    r.settle({ inputTokens: 0, outputTokens: 0 });
    warn.mockRestore();
  });
});

describe('pauseAll', () => {
  it('drains the buckets so every caller backs off, not just the one that 429d', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    pauseAll(5_000, 'test 429');
    const stats = rateLimiterStats();
    expect(stats.inputTokens).toBe(0);
    expect(stats.outputTokens).toBe(0);
    expect(stats.pausedForMs).toBeGreaterThan(0);
    warn.mockRestore();
  });

  it('does not shorten an existing longer pause', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    pauseAll(60_000, 'long');
    const long = rateLimiterStats().pausedForMs;
    pauseAll(1_000, 'short');
    expect(rateLimiterStats().pausedForMs).toBeGreaterThan(long - 1_000);
    warn.mockRestore();
  });
});

describe('syncFromHeaders', () => {
  it('ratchets down to the server’s reported headroom', () => {
    syncFromHeaders({ 'anthropic-ratelimit-input-tokens-remaining': '1000' });
    expect(rateLimiterStats().inputTokens).toBe(1_000);
  });

  it('never ratchets up past our own configured budget', () => {
    // The server's number covers the whole org; our bucket is a self-imposed
    // slice. A generous server remaining is not licence to exceed it.
    const budget = rateLimiterStats().budgets.itpm;
    syncFromHeaders({ 'anthropic-ratelimit-input-tokens-remaining': String(budget * 100) });
    expect(rateLimiterStats().inputTokens).toBeLessThanOrEqual(budget);
  });

  it('tolerates missing or malformed headers', () => {
    const before = rateLimiterStats().inputTokens;
    syncFromHeaders(undefined);
    syncFromHeaders({});
    syncFromHeaders({ 'anthropic-ratelimit-input-tokens-remaining': 'not-a-number' });
    expect(rateLimiterStats().inputTokens).toBe(before);
  });

  it('reads Headers-style objects as well as plain ones', () => {
    syncFromHeaders(new Headers({ 'anthropic-ratelimit-input-tokens-remaining': '2500' }));
    expect(rateLimiterStats().inputTokens).toBe(2_500);
  });
});

describe('estimateInputTokens', () => {
  it('prices a PDF page far above the same page as text', () => {
    // A document block ships every page as a rasterised image AND its text.
    const asPdf = estimateInputTokens({ pdfPages: 40 });
    const asText = estimateInputTokens({ textChars: 40 * 2_500 });
    expect(asPdf).toBeGreaterThan(asText);
  });

  it('errs high — under-estimating causes 429s, over-estimating costs a little throughput', () => {
    expect(estimateInputTokens({ pdfPages: 1 })).toBeGreaterThanOrEqual(1_500);
  });

  it('returns zero for an empty payload', () => {
    expect(estimateInputTokens({})).toBe(0);
  });
});
