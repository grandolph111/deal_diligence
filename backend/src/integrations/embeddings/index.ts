/**
 * Embedding abstraction for semantic ranking (Phase B).
 *
 * Callers depend only on `embedTexts` + `cosine`. With a provider configured
 * (Voyage / OpenAI / Isaacus-compatible HTTP endpoint) real embeddings are used;
 * otherwise a deterministic **mock** embedder runs — a hashed bag-of-words vector,
 * so lexically-similar texts get higher cosine and the ranking path works in dev
 * without an API key (same pattern as mock extraction/chat).
 *
 * Ranking is done in-code over the ToC-narrowed candidate slice (bounded — a few
 * hundred provisions), which is fast and needs no pgvector extension. Swap to a
 * pgvector ANN backend only when searching the *whole* corpus (no ToC filter).
 */

import { config } from '../../config';

export const isEmbeddingsConfigured = (): boolean =>
  Boolean(config.embeddings.provider && config.embeddings.apiKey);

/* ---------- mock (deterministic) ---------- */

const MOCK_DIM = Math.max(32, config.embeddings.mockDim);

const hashToken = (t: string): number => {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const mockEmbed = (text: string): number[] => {
  const v = new Array(MOCK_DIM).fill(0);
  const tokens = (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 2);
  for (const tok of tokens) v[hashToken(tok) % MOCK_DIM] += 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
};

/* ---------- real (HTTP provider) ---------- */

const httpEmbed = async (texts: string[]): Promise<number[][]> => {
  const res = await fetch(config.embeddings.baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.embeddings.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: texts, model: config.embeddings.model }),
  });
  if (!res.ok) {
    throw new Error(`Embeddings provider ${config.embeddings.provider} returned ${res.status}`);
  }
  const json = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return json.data.map((d) => d.embedding);
};

/* ---------- public API ---------- */

/** Embed a batch of texts. Falls back to the mock embedder when unconfigured. */
export const embedTexts = async (texts: string[]): Promise<number[][]> => {
  if (texts.length === 0) return [];
  if (!isEmbeddingsConfigured()) return texts.map(mockEmbed);
  try {
    return await httpEmbed(texts);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[embeddings] provider failed, falling back to mock:', err instanceof Error ? err.message : err);
    return texts.map(mockEmbed);
  }
};

export const embedText = async (text: string): Promise<number[]> => (await embedTexts([text]))[0];

/** Cosine similarity. Vectors need not be pre-normalized. */
export const cosine = (a: number[], b: number[]): number => {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
};

export const embeddingModelId = (): string =>
  isEmbeddingsConfigured() ? `${config.embeddings.provider}:${config.embeddings.model}` : 'mock';
