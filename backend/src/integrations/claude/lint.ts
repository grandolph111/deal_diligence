/**
 * Library lint / gap-hunting (Sonnet). Reads the deal's risk-category coverage +
 * document registry + playbook and returns prioritized findings — the material
 * gaps, thin areas, risks to escalate, cross-document inconsistencies, and
 * documents worth requesting. The model's judgment is what deterministic checks
 * can't give: which OPEN items actually matter for this deal.
 */

import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { lintResponseSchema, type LintResponse } from './schema';

const LINT_SYSTEM_PROMPT = `You are a senior M&A diligence lead reviewing the coverage of a deal's document set against the risk categories of a due-diligence issues report.

You are given: coverage per risk category (status — OPEN=no evidence, COVERED, FLAGGED=risk/deviation, THIN=partial — and how many pieces of evidence it has), the document registry (what's been provided), and the customer's playbook. Categories marked fact-fed are answered by documents and facts rather than contract clause language, so an OPEN one usually means the document was never produced.

Produce a prioritized list of findings via the submit_lint tool. Focus on judgment a mechanical check can't provide:
- **GAP** — an OPEN category that is *material for this deal* (not every open one — the ones that matter). Say why it matters and, in suggestedAction, name the document to request. This becomes a supplemental diligence request in the issues report, so write it as something you could send to the other side.
- **THIN** — a category whose evidence looks incomplete; what's missing.
- **RISK** — a FLAGGED category that should be escalated; why.
- **INCONSISTENCY** — evidence that appears to conflict across documents.
- **SUGGESTION** — a specific document to request or next action.

Set riskCategoryId to the related risk category's slug when a finding maps to one. Rank by severity (HIGH first). Be specific and grounded in the provided coverage — never invent facts or documents. Prefer 5–15 high-signal findings over an exhaustive list.`;

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
