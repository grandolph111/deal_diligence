/**
 * Citation-flag adjudicator (Haiku).
 *
 * The deterministic validator has high recall but low precision — it flags
 * faithful paraphrases and formatting quirks as "hallucinations." This cheap,
 * TARGETED Haiku pass looks only at the flagged quotes against only the pages
 * they reference, and decides whether each is genuinely FABRICATED, a faithful
 * PARAPHRASE, or actually VERBATIM (a false positive). That restores precision
 * so humans only review real problems.
 *
 * It never re-reads the whole PDF — it uses the page text already parsed for the
 * validator, and only the handful of pages the flags point at.
 */

import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { adjudicateResponseSchema, type AdjudicateResponse } from './schema';

export interface AdjudicationInput {
  clauseType: string;
  quote: string;
  citedPage: number | null;
  actualPage?: number | null;
}

const ADJUDICATE_SYSTEM_PROMPT = `You adjudicate quotes that an automated checker flagged as possibly not matching a source document.

For each flagged quote, classify it against the provided source page text:
- VERBATIM — appears word-for-word (allow minor OCR, whitespace, or punctuation differences).
- PARAPHRASE — the meaning is faithfully present in the source but the wording differs.
- FABRICATED — the content is not supported by the source at all.

If a quote appears verbatim on a different page than the one cited, report its actualPage. Be strict about FABRICATED — only use it when the substance genuinely isn't in the source. Return one verdict per flagged index via the submit_adjudication tool.`;

const MAX_CONTEXT_PAGES = 8;

export const adjudicateFlags = async (args: {
  flags: AdjudicationInput[];
  pages: string[];
}): Promise<AdjudicateResponse['verdicts']> => {
  if (args.flags.length === 0) return [];
  const client = getClaudeClient();
  const model = getModelId('chat'); // Haiku tier — narrow, easy classification

  // Targeted context: only the pages the flags reference (cited + actual pages),
  // capped. Keeps the call tiny. Fall back to the first pages if none referenced.
  const wanted = new Set<number>();
  for (const f of args.flags) {
    if (f.citedPage && f.citedPage >= 1) wanted.add(f.citedPage);
    if (f.actualPage && f.actualPage >= 1) wanted.add(f.actualPage);
  }
  let pageNums = [...wanted].sort((a, b) => a - b).slice(0, MAX_CONTEXT_PAGES);
  if (pageNums.length === 0) pageNums = args.pages.slice(0, 3).map((_, i) => i + 1);

  const context = pageNums
    .map((n) => `=== Page ${n} ===\n${(args.pages[n - 1] ?? '').slice(0, 4000)}`)
    .join('\n\n');
  const list = args.flags
    .map(
      (f, i) =>
        `${i}. [${f.clauseType}] cited page ${f.citedPage ?? '?'}: "${f.quote.slice(0, 240).replace(/\n/g, ' ')}"`
    )
    .join('\n');

  const { input } = await runToolUse<AdjudicateResponse>({
    client,
    model,
    maxTokens: 1024,
    systemPrompt: ADJUDICATE_SYSTEM_PROMPT,
    messages: [
      {
        type: 'text',
        text: `# Source page text\n\n${context}\n\n# Flagged quotes\n\n${list}\n\nClassify each flagged quote by index.`,
      },
    ],
    toolName: 'submit_adjudication',
    toolDescription: 'Classify each flagged quote as VERBATIM, PARAPHRASE, or FABRICATED.',
    toolSchema: adjudicateResponseSchema,
  });

  return input.verdicts;
};
