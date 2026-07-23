/**
 * Library ToC router (Haiku). Given a user question and the compact checklist
 * index (item id + title + coverage status + clause types), returns the ids of
 * the items relevant to answering it — the "read the index, follow the links"
 * step. Cheap and fast; the retriever then loads only those items' evidence.
 */

import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { libraryRouteResponseSchema } from './schema';

export interface RouteItem {
  id: string;
  title: string;
  status: string;
  clauseTypes: string[];
}

const ROUTE_SYSTEM_PROMPT = `You route a due-diligence question to the relevant checklist items.

You are given the deal's diligence checklist — each item is a question the deal team must answer, with a coverage status (OPEN = no evidence yet, COVERED, FLAGGED = risk/deviation, THIN = partial) and the clause types filed under it.

Return ONLY the ids of items relevant to the user's question, via the select_items tool. Prefer precision: usually 1–6 items. Include an item even if its status is OPEN when the question is about that topic (an open item is a gap worth surfacing). If nothing is relevant, return an empty list.`;

export const routeLibraryItems = async (args: {
  query: string;
  items: RouteItem[];
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

  const { input } = await runToolUse<{ itemIds: string[] }>({
    client,
    model,
    maxTokens: 512,
    systemPrompt: ROUTE_SYSTEM_PROMPT,
    messages: [
      {
        type: 'text',
        text: `Diligence checklist:\n${index}\n\nUser question: "${args.query}"\n\nSelect the relevant item ids.`,
      },
    ],
    toolName: 'select_items',
    toolDescription: 'Select the checklist item ids relevant to the question.',
    toolSchema: libraryRouteResponseSchema,
  });

  // Only return ids that actually exist in the provided set.
  const valid = new Set(args.items.map((i) => i.id));
  return input.itemIds.filter((id) => valid.has(id));
};
