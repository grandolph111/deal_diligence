/**
 * Library router (Haiku). Given a user question and the compact risk-category
 * index (item id + title + coverage status + clause types), returns the ids of
 * the items relevant to answering it — the "read the index, follow the links"
 * step. Cheap and fast; the retriever then loads only those items' evidence.
 */

import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { libraryRouteResponseSchema } from './schema';

export interface RouteCategory {
  id: string;
  title: string;
  status: string;
  clauseTypes: string[];
}

const ROUTE_SYSTEM_PROMPT = `You route a due-diligence question to the relevant risk categories.

You are given the deal's risk categories — the topics of a due-diligence issues report — each with a coverage status (OPEN = no evidence yet, COVERED, FLAGGED = risk/deviation, THIN = partial) and the clause types filed under it.

Return ONLY the ids relevant to the question. Prefer a tight set: two or three categories that genuinely bear on the question beat ten that loosely touch it. Include a category even when it is OPEN if the question is about that topic — an open category is a gap worth surfacing, not something to hide.

Note that most contract language files under Material Contracts, so a question about indemnities, liability caps, termination, exclusivity, pricing, governing law or contract dates belongs there rather than in a category named after the subject.`;

export const routeRiskCategories = async (args: {
  query: string;
  items: RouteCategory[];
}): Promise<string[]> => {
  if (args.items.length === 0) return [];
  const client = getClaudeClient();
  const model = getModelId('chat'); // Haiku tier

  const index = args.items
    .map(
      (i) =>
        `- ${i.id} — ${i.title} [${i.status}]${
          i.clauseTypes.length ? ` (clauses: ${i.clauseTypes.join(', ')})` : ''
        }`
    )
    .join('\n');

  const { input } = await runToolUse<{ riskCategoryIds: string[] }>({
    client,
    model,
    maxTokens: 512,
    systemPrompt: ROUTE_SYSTEM_PROMPT,
    messages: [
      {
        type: 'text',
        text: `Risk categories:\n${index}\n\nUser question: "${args.query}"\n\nSelect the relevant risk category ids.`,
      },
    ],
    toolName: 'select_items',
    toolDescription: 'Select the risk category ids relevant to the question.',
    toolSchema: libraryRouteResponseSchema,
  });

  // Only return ids that actually exist in the provided set.
  const valid = new Set(args.items.map((i) => i.id));
  return input.riskCategoryIds.filter((id) => valid.has(id));
};
