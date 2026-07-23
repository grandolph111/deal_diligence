/**
 * Library lint / gap-hunting (Sonnet). Reads the deal's checklist coverage +
 * document registry + playbook and returns prioritized findings — the material
 * gaps, thin areas, risks to escalate, cross-document inconsistencies, and
 * documents worth requesting. The model's judgment is what deterministic checks
 * can't give: which OPEN items actually matter for this deal.
 */

import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { lintResponseSchema, type LintResponse } from './schema';

const LINT_SYSTEM_PROMPT = `You are a senior M&A diligence lead reviewing the coverage of a deal's document set against a due-diligence checklist.

You are given: the checklist coverage (each item's status — OPEN=no evidence, COVERED, FLAGGED=risk/deviation, THIN=partial — and how many pieces of evidence it has), the document registry (what's been provided), and the customer's playbook.

Produce a prioritized list of findings via the submit_lint tool. Focus on judgment a mechanical check can't provide:
- **GAP** — an OPEN item that is *material for this deal* (not every open item — the ones that matter). Say why it matters and, in suggestedAction, what document or evidence would close it.
- **THIN** — an item whose evidence looks incomplete; what's missing.
- **RISK** — a FLAGGED item that should be escalated; why.
- **INCONSISTENCY** — evidence that appears to conflict across documents.
- **SUGGESTION** — a specific document to request or next action.

Set itemId to the related checklist item's slug when a finding maps to one. Rank by severity (HIGH first). Be specific and grounded in the provided coverage — never invent facts or documents. Prefer 5–15 high-signal findings over an exhaustive list.`;

export const analyzeLibraryGaps = async (args: {
  dealName: string;
  playbookContext: string;
  coverageMarkdown: string;
  registryMarkdown: string;
}): Promise<LintResponse> => {
  const client = getClaudeClient();
  const model = getModelId('reconciliation'); // Sonnet tier — reads markdown

  const { input } = await runToolUse<LintResponse>({
    client,
    model,
    maxTokens: 4096,
    systemPrompt: LINT_SYSTEM_PROMPT,
    messages: [
      {
        type: 'text',
        text: `# Deal: ${args.dealName}\n\n## Playbook\n${args.playbookContext || '(no playbook)'}\n\n## Checklist coverage\n${args.coverageMarkdown}\n\n## Document registry\n${args.registryMarkdown}\n\nReview the coverage and submit your findings.`,
      },
    ],
    toolName: 'submit_lint',
    toolDescription: 'Emit the prioritized diligence findings.',
    toolSchema: lintResponseSchema,
  });

  return input;
};
