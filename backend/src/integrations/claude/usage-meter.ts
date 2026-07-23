/**
 * Token-usage + spend meter.
 *
 * Every runToolUse call feeds its reported usage here; the meter accumulates by
 * model and prices it, so any caller (eval harness, a per-deal spend counter,
 * a dashboard) can read exact spend for a window of work. Process-global —
 * call reset() to start a fresh measurement window.
 */

import type { ToolUseUsage } from './tool-use';

interface ModelPrice {
  inPerM: number;
  outPerM: number;
}

// $/1M tokens. Matched by substring so model-version bumps don't need edits.
const priceFor = (model: string): ModelPrice => {
  const m = model.toLowerCase();
  if (m.includes('opus')) return { inPerM: 5, outPerM: 25 };
  if (m.includes('haiku')) return { inPerM: 1, outPerM: 5 };
  if (m.includes('sonnet')) return { inPerM: 3, outPerM: 15 };
  return { inPerM: 3, outPerM: 15 }; // default to sonnet-tier
};

// Cache multipliers relative to base input rate.
const CACHE_READ_MULT = 0.1;
const CACHE_WRITE_MULT = 1.25;

interface ModelTally {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
}

const empty = (): ModelTally => ({
  calls: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
});

const tallies = new Map<string, ModelTally>();

export const usageMeter = {
  record(model: string, usage: ToolUseUsage): void {
    const t = tallies.get(model) ?? empty();
    const inTok = usage.inputTokens ?? 0;
    const outTok = usage.outputTokens ?? 0;
    const cacheRead = usage.cacheReadInputTokens ?? 0;
    const cacheWrite = usage.cacheCreationInputTokens ?? 0;
    const p = priceFor(model);
    const cost =
      (inTok * p.inPerM +
        outTok * p.outPerM +
        cacheRead * p.inPerM * CACHE_READ_MULT +
        cacheWrite * p.inPerM * CACHE_WRITE_MULT) /
      1_000_000;

    t.calls += 1;
    t.inputTokens += inTok;
    t.outputTokens += outTok;
    t.cacheReadTokens += cacheRead;
    t.cacheWriteTokens += cacheWrite;
    t.costUsd += cost;
    tallies.set(model, t);
  },

  reset(): void {
    tallies.clear();
  },

  snapshot(): { byModel: Record<string, ModelTally>; totalUsd: number; totalCalls: number } {
    const byModel: Record<string, ModelTally> = {};
    let totalUsd = 0;
    let totalCalls = 0;
    for (const [model, t] of tallies) {
      byModel[model] = { ...t };
      totalUsd += t.costUsd;
      totalCalls += t.calls;
    }
    return { byModel, totalUsd, totalCalls };
  },
};
