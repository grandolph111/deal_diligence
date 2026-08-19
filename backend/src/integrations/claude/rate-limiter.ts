/**
 * Global, token-aware admission control for every Claude call.
 *
 * The extraction queue caps *documents* in flight (EXTRACTION_CONCURRENCY), but
 * documents are not fungible: eight NDAs draw ~40k input tokens, eight 300-page
 * SPAs draw ~5M. A doc-count cap therefore cannot keep us inside Anthropic's
 * per-minute input-token budget (ITPM) — it is the wrong unit.
 *
 * This module meters the real unit. Callers `acquire()` an estimated token cost
 * before sending and `settle()` the actual cost afterwards, so the bucket tracks
 * truth rather than the estimate. Three properties matter:
 *
 *   - **FIFO admission** — waiters are served head-of-line, so a 600k-token
 *     window job is never starved by a stream of small ones.
 *   - **Shared backoff** — a 429 on any call pauses *every* caller
 *     (`pauseAll`). Otherwise the other 7 in-flight jobs keep hammering a
 *     bucket we already know is empty and we never recover.
 *   - **Server reconciliation** — `anthropic-ratelimit-*` response headers are
 *     authoritative; when the server says we have less headroom than we think,
 *     we take the server's number. This is what lets us throttle *before* a 429
 *     rather than after.
 *
 * Scope: one Node process. Multi-instance deployments need a shared bucket
 * (Redis) — see `syncFromHeaders`, which is the seam where that would plug in,
 * since header truth is already global across instances.
 */

const num = (v: string | undefined, fallback: number): number => {
  const n = parseInt(v || '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/**
 * Budgets default to a conservative slice of a Tier-2-ish account. Set these
 * from your actual org limits (Console → Rate limits) minus headroom for any
 * other traffic sharing the key.
 */
const INPUT_TOKENS_PER_MIN = num(process.env.CLAUDE_ITPM_BUDGET, 400_000);
const OUTPUT_TOKENS_PER_MIN = num(process.env.CLAUDE_OTPM_BUDGET, 80_000);
const REQUESTS_PER_MIN = num(process.env.CLAUDE_RPM_BUDGET, 50);

/** Below this, waiting is pointless overhead — let trivial calls through. */
const MIN_METERED_TOKENS = 1_000;

interface Bucket {
  capacity: number;
  available: number;
  /** Tokens (or requests) refilled per ms. */
  refillPerMs: number;
  lastRefillAt: number;
}

const makeBucket = (capacity: number): Bucket => ({
  capacity,
  available: capacity,
  refillPerMs: capacity / 60_000,
  lastRefillAt: Date.now(),
});

const inputTokens = makeBucket(INPUT_TOKENS_PER_MIN);
const outputTokens = makeBucket(OUTPUT_TOKENS_PER_MIN);
const requests = makeBucket(REQUESTS_PER_MIN);

const refill = (b: Bucket, now: number): void => {
  const elapsed = now - b.lastRefillAt;
  if (elapsed <= 0) return;
  b.available = Math.min(b.capacity, b.available + elapsed * b.refillPerMs);
  b.lastRefillAt = now;
};

/** ms until `b` can supply `need`, given its refill rate. */
const waitFor = (b: Bucket, need: number, now: number): number => {
  refill(b, now);
  if (b.available >= need) return 0;
  return Math.ceil((need - b.available) / b.refillPerMs);
};

interface Waiter {
  inTokens: number;
  outTokens: number;
  resolve: () => void;
  label: string;
  enqueuedAt: number;
}

const waiters: Waiter[] = [];
let pumpTimer: NodeJS.Timeout | null = null;
let pauseUntil = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Serve waiters head-of-line. Strictly FIFO: if the head cannot be admitted we
 * stop and re-arm rather than skipping ahead, which is what guarantees large
 * jobs eventually run instead of being perpetually overtaken.
 */
const pump = (): void => {
  if (pumpTimer) {
    clearTimeout(pumpTimer);
    pumpTimer = null;
  }

  while (waiters.length > 0) {
    const now = Date.now();

    if (now < pauseUntil) {
      schedule(pauseUntil - now);
      return;
    }

    const head = waiters[0];
    const delay = Math.max(
      waitFor(inputTokens, head.inTokens, now),
      waitFor(outputTokens, head.outTokens, now),
      waitFor(requests, 1, now)
    );

    if (delay > 0) {
      schedule(delay);
      return;
    }

    waiters.shift();
    inputTokens.available -= head.inTokens;
    outputTokens.available -= head.outTokens;
    requests.available -= 1;

    const waitedMs = now - head.enqueuedAt;
    if (waitedMs > 2_000) {
      // eslint-disable-next-line no-console
      console.log(
        `[rate-limit] ${head.label} admitted after ${Math.round(waitedMs / 1000)}s ` +
          `(est ${head.inTokens} in / ${head.outTokens} out; ${waiters.length} still queued)`
      );
    }
    head.resolve();
  }
};

const schedule = (delayMs: number): void => {
  if (pumpTimer) return;
  pumpTimer = setTimeout(() => {
    pumpTimer = null;
    pump();
  }, Math.min(Math.max(delayMs, 25), 30_000));
  pumpTimer.unref?.();
};

export interface AcquireRequest {
  /** Estimated input tokens for this call (see estimateInputTokens). */
  inputTokens: number;
  /**
   * Expected output tokens — a FORECAST, not the ceiling.
   *
   * Reserving `max_tokens` here would be a serious throughput bug. `max_tokens`
   * is a safety ceiling set well above realistic output (32k against a measured
   * ~15k for a 40-page window); reserving it means three concurrent windows
   * demand 98k against an 80k budget and the limiter throttles itself to two,
   * silently capping the concurrency the operator configured. Forecast instead
   * and let `settle` correct — under-reserving costs at worst a 429, which
   * `pauseAll` already handles, while over-reserving costs throughput on every
   * single call.
   */
  expectedOutputTokens: number;
  /** For logs. */
  label: string;
}

export interface Reservation {
  /**
   * Reconcile the reservation against what the call actually cost. Always call
   * this (in a `finally`), or the bucket drifts pessimistic and throughput
   * collapses over time.
   */
  settle(actual?: { inputTokens?: number; outputTokens?: number }): void;
}

/**
 * Block until this call fits inside the per-minute budget.
 *
 * A single request larger than the whole per-minute budget would deadlock, so
 * it is clamped to the capacity and warned about — the correct fix is a bigger
 * budget or a smaller window, not an unbounded wait.
 */
export const acquire = async (req: AcquireRequest): Promise<Reservation> => {
  const clamp = (need: number, b: Bucket, kind: string): number => {
    if (need <= b.capacity) return need;
    // eslint-disable-next-line no-console
    console.warn(
      `[rate-limit] ${req.label} needs ${need} ${kind} tokens but the per-minute ` +
        `budget is only ${b.capacity}. Admitting at capacity — expect 429s. ` +
        `Raise the budget env var or reduce the window size.`
    );
    return b.capacity;
  };

  const inTok = clamp(Math.max(req.inputTokens, 0), inputTokens, 'input');
  const outTok = clamp(Math.max(req.expectedOutputTokens, 0), outputTokens, 'output');

  if (inTok < MIN_METERED_TOKENS && outTok < MIN_METERED_TOKENS && waiters.length === 0) {
    // Trivial call and nothing queued — still consume a request slot.
    refill(requests, Date.now());
    requests.available = Math.max(0, requests.available - 1);
    return { settle: () => undefined };
  }

  await new Promise<void>((resolve) => {
    waiters.push({
      inTokens: inTok,
      outTokens: outTok,
      resolve,
      label: req.label,
      enqueuedAt: Date.now(),
    });
    pump();
  });

  let settled = false;
  return {
    settle(actual) {
      if (settled) return;
      settled = true;
      // Refund the difference between reserved and actual. `max_tokens` is a
      // ceiling and real outputs are usually far below it, so this refund is
      // what keeps the output bucket from throttling on hypothetical spend.
      const actualIn = actual?.inputTokens ?? inTok;
      const actualOut = actual?.outputTokens ?? outTok;
      inputTokens.available = Math.min(
        inputTokens.capacity,
        inputTokens.available + (inTok - actualIn)
      );
      outputTokens.available = Math.min(
        outputTokens.capacity,
        outputTokens.available + (outTok - actualOut)
      );
      pump();
    },
  };
};

/**
 * Pause *all* Claude traffic. Called on a 429/529: the bucket we modelled is
 * evidently wrong, so every caller must back off together, not just the one
 * that happened to draw the error.
 */
export const pauseAll = (ms: number, reason: string): void => {
  const until = Date.now() + ms;
  if (until <= pauseUntil) return;
  pauseUntil = until;
  // Drain the modelled buckets too — the server just told us they are empty.
  inputTokens.available = 0;
  outputTokens.available = 0;
  requests.available = 0;
  const now = Date.now();
  inputTokens.lastRefillAt = now;
  outputTokens.lastRefillAt = now;
  requests.lastRefillAt = now;
  // eslint-disable-next-line no-console
  console.warn(
    `[rate-limit] global pause ${Math.round(ms / 1000)}s — ${reason} ` +
      `(${waiters.length} call(s) queued)`
  );
  schedule(ms);
};

/**
 * Take the server's word for remaining headroom. Anthropic returns
 * `anthropic-ratelimit-{input,output}-tokens-remaining` and `-reset` on every
 * response; trusting them lets us slow down before a 429 instead of after, and
 * corrects for traffic on the same key from outside this process.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const syncFromHeaders = (headers: any): void => {
  if (!headers) return;
  const read = (name: string): number | null => {
    const raw = headers.get?.(name) ?? headers[name];
    if (raw === undefined || raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const apply = (b: Bucket, remaining: number | null) => {
    if (remaining === null) return;
    // Only ever ratchet *down*. The server's number covers the whole org; our
    // bucket is a self-imposed slice of it, so a large server remaining does
    // not license us to exceed our own configured budget.
    if (remaining < b.available) {
      b.available = Math.max(0, remaining);
      b.lastRefillAt = Date.now();
    }
  };

  apply(inputTokens, read('anthropic-ratelimit-input-tokens-remaining'));
  apply(outputTokens, read('anthropic-ratelimit-output-tokens-remaining'));
  apply(requests, read('anthropic-ratelimit-requests-remaining'));
};

/**
 * Estimate input tokens before sending. Deliberately errs high — under-
 * estimating causes 429s, over-estimating only costs a little throughput.
 *
 * A PDF page costs both a rasterised image and its text layer, which lands
 * around 1.5k-3k tokens/page; 2.5k is a safe planning number.
 */
export const TOKENS_PER_PDF_PAGE = num(process.env.CLAUDE_TOKENS_PER_PDF_PAGE, 2_500);

export const estimateInputTokens = (args: {
  pdfPages?: number;
  textChars?: number;
  systemPromptChars?: number;
}): number => {
  const pdf = (args.pdfPages ?? 0) * TOKENS_PER_PDF_PAGE;
  // ~3.5 chars/token for English prose; contracts run denser, so use 3.
  const text = Math.ceil((args.textChars ?? 0) / 3);
  const system = Math.ceil((args.systemPromptChars ?? 0) / 3);
  return pdf + text + system;
};

/**
 * Forecast extraction output from page count.
 *
 * Decomposed from a measured 7-page CUAD contract: one pass produced 4,508
 * output tokens, and splitting the same document three ways produced 9,204.
 * Solving the two gives a fixed per-call cost of roughly 2,350 tokens (the
 * document-level scalars, entities, and summary every call re-emits) plus about
 * 310 tokens per page of clauses. Suppressing the per-window narrative attacks
 * the fixed term, which is why window prompts are told to leave the prose empty.
 *
 * Used only for admission control, so being 30% off is harmless — `settle`
 * reconciles against actual usage the moment the call returns.
 */
const EXTRACTION_FIXED_OUTPUT = 2_400;
const EXTRACTION_OUTPUT_PER_PAGE = 320;
/** Locator (~45 tokens/clause) vs full quote (~220). Conservative at 4x. */
const ANCHOR_OUTPUT_DIVISOR = 4;

export const estimateExtractionOutputTokens = (args: {
  pages?: number | null;
  /** Hard ceiling — the forecast is never allowed above it. */
  maxTokens: number;
  /** Windows omit the document-level narrative, so they skip most fixed cost. */
  isWindow?: boolean;
  /** Anchors replace ~220 tokens of quote per clause with ~45. */
  anchorMode?: boolean;
}): number => {
  const fixed = args.isWindow ? EXTRACTION_FIXED_OUTPUT / 3 : EXTRACTION_FIXED_OUTPUT;
  const pages = args.pages ?? 20;
  const perPage = args.anchorMode
    ? EXTRACTION_OUTPUT_PER_PAGE / ANCHOR_OUTPUT_DIVISOR
    : EXTRACTION_OUTPUT_PER_PAGE;
  const forecast = Math.ceil(fixed + pages * perPage);
  return Math.min(forecast, args.maxTokens);
};

export const rateLimiterStats = () => ({
  inputTokens: Math.round(inputTokens.available),
  outputTokens: Math.round(outputTokens.available),
  requests: Math.round(requests.available),
  queued: waiters.length,
  pausedForMs: Math.max(0, pauseUntil - Date.now()),
  budgets: {
    itpm: INPUT_TOKENS_PER_MIN,
    otpm: OUTPUT_TOKENS_PER_MIN,
    rpm: REQUESTS_PER_MIN,
  },
});

/** Test seam — reset buckets to full and drop any pause. */
export const __resetRateLimiter = (): void => {
  const now = Date.now();
  for (const b of [inputTokens, outputTokens, requests]) {
    b.available = b.capacity;
    b.lastRefillAt = now;
  }
  pauseUntil = 0;
  waiters.length = 0;
  if (pumpTimer) {
    clearTimeout(pumpTimer);
    pumpTimer = null;
  }
};

export const __sleep = sleep;
