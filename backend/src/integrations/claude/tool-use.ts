/**
 * Shared helpers for Claude tool-use calls. Every runner (extract, verify,
 * classify, deal-brief, risk-report, chat, reconcile, anomaly) forces the
 * model into a single named tool call whose input is the validated response.
 *
 * This replaces JSON-in-text parsing: Claude cannot emit extra prose, tokens
 * match the Zod schema by construction, and schema drift surfaces as Zod
 * validation errors at a single clear boundary.
 *
 * Two cross-cutting concerns live here because every caller needs them:
 *
 *   1. **Admission control** — each call reserves its estimated token cost from
 *      a process-wide budget (`rate-limiter.ts`) before sending. Capping
 *      concurrent *documents* cannot bound token draw; capping tokens can.
 *   2. **Streaming for large outputs** — the SDK requires streaming above
 *      ~16k `max_tokens` or the request dies on an HTTP timeout. Extraction of
 *      a dense contract routinely exceeds that, so we stream by default when
 *      the ceiling is high and collect the final message.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { usageMeter } from './usage-meter';
import { acquire, pauseAll, syncFromHeaders } from './rate-limiter';
import type Anthropic from '@anthropic-ai/sdk';
import type AnthropicBedrock from '@anthropic-ai/bedrock-sdk';

type ClaudeClient = Anthropic | AnthropicBedrock;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ContentBlock = any;

export interface ToolUseUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface ToolUseCall<T> {
  /** The validated tool-call input. */
  input: T;
  /** Thinking content, if extended thinking was enabled. */
  thinking?: string;
  /** Raw content blocks, for debugging. */
  content: ContentBlock[];
  /** Token usage reported by the Anthropic API for this call. */
  usage?: ToolUseUsage;
  /** The stop_reason reported by the Anthropic API (`end_turn`, `tool_use`, `max_tokens`, …). */
  stopReason?: string;
  /** Wall-clock duration of the API call in ms. */
  durationMs: number;
}

// Use z.ZodTypeAny to avoid TS2589 from deep instantiation of Zod's generic.
// The caller narrows T via the explicit generic at the call site.
export interface RunToolUseOptions<T> {
  client: ClaudeClient;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  messages: ContentBlock[];
  toolName: string;
  toolDescription: string;
  toolSchema: z.ZodTypeAny;
  thinkingBudget?: number;
  /**
   * Estimated input tokens, for admission control. Callers that know their
   * payload size (page count, character count) should pass it — see
   * `estimateInputTokens`. Omitted means "small", which is fine for chat-sized
   * calls and wrong for a 40-page PDF window.
   */
  estimatedInputTokens?: number;
  /**
   * Forecast output tokens for admission control. Defaults to half of
   * `maxTokens` — see AcquireRequest.expectedOutputTokens for why reserving the
   * full ceiling would throttle concurrency below what the operator configured.
   */
  expectedOutputTokens?: number;
  /**
   * Force streaming on/off. Default: stream when `maxTokens` exceeds the
   * non-streaming safe ceiling.
   */
  stream?: boolean;
}

/**
 * Thrown when a call is still rate-limited after exhausting retries. Callers
 * that batch work (reconciliation) catch this to shrink the batch rather than
 * treating it as a hard failure.
 */
export class RateLimitExceededAfterRetryError extends Error {
  constructor(message: string, public readonly waitedMs: number) {
    super(message);
    this.name = 'RateLimitExceededAfterRetryError';
  }
}

/** Above this `max_tokens`, the SDK wants streaming to avoid HTTP timeouts. */
const NON_STREAMING_MAX_TOKENS = 16_384;

const MAX_ATTEMPTS = Math.max(
  1,
  parseInt(process.env.CLAUDE_MAX_ATTEMPTS || '5', 10)
);
const DEFAULT_RETRY_AFTER_MS = 60_000;
const MAX_RETRY_AFTER_MS = 120_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const statusOf = (err: any): number | undefined =>
  err?.status ?? err?.response?.status;

const isRateLimit = (err: unknown): boolean => statusOf(err) === 429;

/** 529 overloaded, 5xx, and bare connection errors are all worth retrying. */
const isRetryable = (err: unknown): boolean => {
  const status = statusOf(err);
  if (status === undefined) {
    // No HTTP status → connection reset / DNS / timeout. Retry.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const name = (err as any)?.name ?? '';
    return name !== 'AbortError';
  }
  return status === 429 || status === 408 || status === 409 || status >= 500;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const headersOf = (err: any) => err?.headers ?? err?.response?.headers;

const parseRetryAfter = (err: unknown): number => {
  const headers = headersOf(err);
  const raw =
    headers?.get?.('retry-after') ?? headers?.['retry-after'] ?? undefined;
  if (!raw) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000 + 1_000, MAX_RETRY_AFTER_MS);
  }
  return DEFAULT_RETRY_AFTER_MS;
};

/** Exponential backoff with full jitter, so N retrying callers don't resonate. */
const backoffMs = (attempt: number): number => {
  const base = Math.min(1_000 * 2 ** attempt, 30_000);
  return Math.round(base / 2 + Math.random() * (base / 2));
};

/**
 * `budget_tokens` was removed on the 4.6+ generation and returns a 400 there;
 * adaptive thinking replaces it. Older models still require the explicit
 * budget. Pick the right shape from the model id so a single config knob works
 * across the routed tiers.
 */
const ADAPTIVE_THINKING_MODELS = [
  'opus-4-6',
  'opus-4-7',
  'opus-4-8',
  'opus-5',
  'sonnet-4-6',
  'sonnet-5',
  'fable-5',
  'mythos-5',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const buildThinkingParam = (model: string, budget?: number): any | null => {
  if (!budget || budget <= 0) return null;
  const m = model.toLowerCase();
  if (ADAPTIVE_THINKING_MODELS.some((id) => m.includes(id))) {
    return { type: 'adaptive' };
  }
  return { type: 'enabled', budget_tokens: budget };
};

interface SendResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  message: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  headers?: any;
}

const send = async (
  client: ClaudeClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  useStream: boolean
): Promise<SendResult> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyClient = client as any;

  if (!useStream) {
    const { data, response } = await anyClient.messages.create(req).withResponse();
    return { message: data, headers: response?.headers };
  }

  const stream = anyClient.messages.stream(req);
  const message = await stream.finalMessage();
  return { message, headers: stream.response?.headers };
};

/**
 * Send with admission control and retries.
 *
 * The reservation is re-acquired on every attempt rather than held across them:
 * a 429 means our model of the budget was wrong, so `pauseAll` drains the
 * bucket and the next `acquire()` blocks until the server's `retry-after`
 * elapses. That coordinates *all* in-flight callers through one mechanism
 * instead of having each sleep independently against a bucket they can't see.
 */
const sendWithRetry = async (
  client: ClaudeClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  opts: {
    toolName: string;
    estimatedInputTokens: number;
    expectedOutputTokens: number;
    useStream: boolean;
  }
): Promise<SendResult> => {
  let lastWaitMs = 0;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const reservation = await acquire({
      inputTokens: opts.estimatedInputTokens,
      expectedOutputTokens: opts.expectedOutputTokens,
      label: opts.toolName,
    });

    try {
      const result = await send(client, req, opts.useStream);
      syncFromHeaders(result.headers);
      const usage = result.message?.usage ?? {};
      reservation.settle({
        inputTokens:
          (usage.input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0),
        outputTokens: usage.output_tokens ?? 0,
      });
      return result;
    } catch (err) {
      // The call never landed — give the reserved budget back.
      reservation.settle({ inputTokens: 0, outputTokens: 0 });
      syncFromHeaders(headersOf(err));

      const isLast = attempt === MAX_ATTEMPTS - 1;
      if (!isRetryable(err)) throw err;

      if (isLast) {
        if (isRateLimit(err)) {
          throw new RateLimitExceededAfterRetryError(
            `${opts.toolName}: still rate-limited after ${MAX_ATTEMPTS} attempts ` +
              `(last wait ${Math.round(lastWaitMs / 1000)}s). Input likely too large ` +
              `for this tier's per-minute budget.`,
            lastWaitMs
          );
        }
        throw err;
      }

      if (isRateLimit(err)) {
        lastWaitMs = parseRetryAfter(err);
        // Everyone backs off, not just this caller.
        pauseAll(lastWaitMs, `429 on ${opts.toolName}`);
      } else {
        const status = statusOf(err);
        lastWaitMs = backoffMs(attempt);
        if (status === 529) {
          pauseAll(lastWaitMs, `529 overloaded on ${opts.toolName}`);
        }
        // eslint-disable-next-line no-console
        console.warn(
          `[claude] ${opts.toolName} attempt ${attempt + 1}/${MAX_ATTEMPTS} failed ` +
            `(status=${status ?? 'connection'}); retrying in ${Math.round(lastWaitMs / 1000)}s`
        );
        await sleep(lastWaitMs);
      }
    }
  }

  // Unreachable: the loop either returns or throws on its last iteration.
  throw new Error(`${opts.toolName}: exhausted retries`);
};

const sanitizeInputSchema = (schema: unknown): unknown => {
  // Claude's tool schema is JSON Schema draft 7. `zodToJsonSchema` sometimes
  // emits `$ref`/`definitions` which the Anthropic API rejects when the schema
  // is the top-level `input_schema`. Inline definitions for simple cases.
  if (typeof schema !== 'object' || schema === null) return schema;
  // For v1: just strip $schema if present; Anthropic doesn't need it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = { ...(schema as any) };
  delete s.$schema;
  return s;
};

export const runToolUse = async <T>(
  options: RunToolUseOptions<T>
): Promise<ToolUseCall<T>> => {
  const {
    client,
    model,
    maxTokens,
    systemPrompt,
    messages,
    toolName,
    toolDescription,
    toolSchema,
    thinkingBudget,
    estimatedInputTokens,
    expectedOutputTokens,
    stream,
  } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const inputSchema = sanitizeInputSchema(zodToJsonSchema(toolSchema as any));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req: any = {
    model,
    max_tokens: maxTokens,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    tools: [
      {
        name: toolName,
        description: toolDescription,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        input_schema: inputSchema as any,
      },
    ],
    tool_choice: { type: 'tool', name: toolName },
    messages: [{ role: 'user', content: messages }],
  };

  const thinking = buildThinkingParam(model, thinkingBudget);
  if (thinking) req.thinking = thinking;

  const useStream = stream ?? maxTokens > NON_STREAMING_MAX_TOKENS;

  // Fall back to a system-prompt-sized estimate when the caller gave none.
  const estimated =
    estimatedInputTokens ??
    Math.ceil((systemPrompt.length + JSON.stringify(messages).length) / 3);

  const startedAt = Date.now();
  const { message: response } = await sendWithRetry(client, req, {
    toolName,
    estimatedInputTokens: estimated,
    expectedOutputTokens: expectedOutputTokens ?? Math.ceil(maxTokens / 2),
    useStream,
  });
  const durationMs = Date.now() - startedAt;

  const content = response.content as ContentBlock[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawUsage = (response as any).usage ?? {};
  const usage: ToolUseUsage = {
    inputTokens: rawUsage.input_tokens,
    outputTokens: rawUsage.output_tokens,
    cacheCreationInputTokens: rawUsage.cache_creation_input_tokens,
    cacheReadInputTokens: rawUsage.cache_read_input_tokens,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stopReason: string | undefined = (response as any).stop_reason;

  usageMeter.record(model, usage);

  // eslint-disable-next-line no-console
  console.log(
    `[claude] ${toolName} model=${model} stop=${stopReason} ` +
      `in=${usage.inputTokens ?? '?'} out=${usage.outputTokens ?? '?'} ` +
      `cache_read=${usage.cacheReadInputTokens ?? 0} ` +
      `cache_write=${usage.cacheCreationInputTokens ?? 0} ` +
      `stream=${useStream} duration=${durationMs}ms`
  );

  const toolBlock = content.find(
    (c: { type?: string }) => c?.type === 'tool_use'
  );
  if (!toolBlock) {
    throw new Error(
      `Claude did not return a tool_use block for ${toolName} (stop_reason=${stopReason}). ` +
        `This typically means max_tokens was too low or the model refused.`
    );
  }

  const thinkingBlock = content.find(
    (c: { type?: string }) => c?.type === 'thinking'
  ) as { thinking?: string } | undefined;

  try {
    const parsed = toolSchema.parse(toolBlock.input) as T;
    return {
      input: parsed,
      thinking: thinkingBlock?.thinking,
      content,
      usage,
      stopReason,
      durationMs,
    };
  } catch (err) {
    // Surface the actual tool input for debugging. Most common cause: model
    // truncated mid-call because max_tokens was hit, leaving a partial object
    // that fails the Zod schema (e.g. missing required `factSheet` field).
    const rawKeys = Object.keys(toolBlock.input ?? {});
    const rawSample = JSON.stringify(toolBlock.input ?? {}).slice(0, 500);
    // eslint-disable-next-line no-console
    console.error(
      `[tool-use] ${toolName} schema validation failed. stop_reason=${stopReason} ` +
        `output_tokens=${usage.outputTokens} input_tokens=${usage.inputTokens} ` +
        `returned_keys=${JSON.stringify(rawKeys)} ` +
        `raw_sample=${rawSample}`
    );
    throw err;
  }
};
