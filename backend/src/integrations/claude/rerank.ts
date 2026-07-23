/**
 * Provision reranker (Haiku). The Claude-native alternative to embeddings: given
 * a question and the candidate clauses in the ToC-narrowed slice, Haiku reads them
 * and returns the ids most relevant to the question, best first. No vectors, no
 * embeddings vendor — it reasons about relevance (a change-of-control trigger is
 * relevant to a CoC question even if it never says "change of control").
 *
 * Cheap + fast because the ToC route already bounds the candidate set; the caller
 * caps it further before calling.
 */

import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { rerankResponseSchema } from './schema';

export interface RerankCandidate {
  id: string;
  clauseType: string;
  title: string;
  text: string;
}

const RERANK_SYSTEM_PROMPT = `You rank due-diligence clauses by how relevant each is to answering a specific question.

You are given a question and a numbered list of candidate clauses (id, clause type, and text). Return, via the submit_ranking tool, the ids ordered from MOST to LEAST relevant — include only clauses that actually help answer the question, and drop irrelevant ones. Judge by meaning, not keywords (a clause can be relevant even if it doesn't use the question's exact words). Prefer precision; a short, well-ordered list beats a long one.`;

export const rerankProvisions = async (args: {
  query: string;
  candidates: RerankCandidate[];
}): Promise<string[]> => {
  if (args.candidates.length === 0) return [];
  const client = getClaudeClient();
  const model = getModelId('chat'); // Haiku tier

  const list = args.candidates
    .map((c) => `- ${c.id} [${c.clauseType}] ${c.title}: ${c.text.slice(0, 300).replace(/\n/g, ' ')}`)
    .join('\n');

  const { input } = await runToolUse<{ rankedIds: string[] }>({
    client,
    model,
    maxTokens: 1024,
    systemPrompt: RERANK_SYSTEM_PROMPT,
    messages: [
      {
        type: 'text',
        text: `Question: "${args.query}"\n\nCandidate clauses:\n${list}\n\nReturn the ids most relevant to the question, best first.`,
      },
    ],
    toolName: 'submit_ranking',
    toolDescription: 'Emit the clause ids ordered by relevance.',
    toolSchema: rerankResponseSchema,
  });

  const valid = new Set(args.candidates.map((c) => c.id));
  return input.rankedIds.filter((id) => valid.has(id));
};
