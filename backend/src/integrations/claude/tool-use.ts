/**
 * Shared helpers for Claude tool-use calls. Every runner (extract, verify,
 * classify, deal-brief, risk-report, chat, reconcile, anomaly) forces the
 * model into a single named tool call whose input is the validated response.
 *
 * This replaces JSON-in-text parsing: Claude cannot emit extra prose, tokens
 * match the Zod schema by construction, and schema drift surfaces as Zod
 * validation errors at a single clear boundary.
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
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
}

/**
 * Anthropic enforces a per-minute input-token rate limit. When we blow past it
 * (typical on a brief rebuild where mergeEntities + detectAnomalies + per-scope
 * briefs all run in sequence), the SDK throws a 429. The response's
 * `retry-after` header — or in its absence, a sensible default — tells us how
 * long to wait before the bucket refills. We honor it and retry once, which
 * turns "you did too much in this minute" from a failure into a pause.
 *
 * Throws RateLimitExceededAfterRetryError if still 429 after the wait, so the
 * caller (reconciliation) can flag the batch as "too large for current limits"
 * rather than silently failing.
 */
export class RateLimitExceededAfterRetryError extends Error {
  constructor(message: string, public readonly waitedMs: number) {
    super(message);
    this.name = 'RateLimitExceededAfterRetryError';
  }
}

const DEFAULT_RETRY_AFTER_MS = 60_000;
const MAX_RETRY_AFTER_MS = 90_000;

const parseRetryAfter = (err: unknown): number => {
  const headers =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err as any)?.headers ?? (err as any)?.response?.headers;
  const raw =
    headers?.get?.('retry-after') ?? headers?.['retry-after'] ?? undefined;
  if (!raw) return DEFAULT_RETRY_AFTER_MS;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds * 1000 + 1_000, MAX_RETRY_AFTER_MS);
  }
  return DEFAULT_RETRY_AFTER_MS;
};

const isRateLimit = (err: unknown): boolean => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const status = (err as any)?.status ?? (err as any)?.response?.status;
  return status === 429;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sendWithRateLimitRetry = async (
  client: ClaudeClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  req: any,
  toolName: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  try {
    return await client.messages.create(req);
  } catch (err) {
    if (!isRateLimit(err)) throw err;
    const waitMs = parseRetryAfter(err);
    // eslint-disable-next-line no-console
    console.warn(
      `[claude] ${toolName} hit 429 rate limit; waiting ${Math.round(
        waitMs / 1000
      )}s before single retry`
    );
    await sleep(waitMs);
    try {
      return await client.messages.create(req);
    } catch (retryErr) {
      if (isRateLimit(retryErr)) {
        throw new RateLimitExceededAfterRetryError(
          `${toolName}: still rate-limited after ${Math.round(
            waitMs / 1000
          )}s wait. Input likely too large for this tier's per-minute budget.`,
          waitMs
        );
      }
      throw retryErr;
    }
  }
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

  if (thinkingBudget && thinkingBudget > 0) {
    req.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
  }

  const startedAt = Date.now();
  const response = await sendWithRateLimitRetry(client, req, toolName);
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

  // eslint-disable-next-line no-console
  console.log(
    `[claude] ${toolName} model=${model} stop=${stopReason} ` +
      `in=${usage.inputTokens ?? '?'} out=${usage.outputTokens ?? '?'} ` +
      `cache_read=${usage.cacheReadInputTokens ?? 0} ` +
      `cache_write=${usage.cacheCreationInputTokens ?? 0} ` +
      `duration=${durationMs}ms`
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
