import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { DEAL_BRIEF_SYSTEM_PROMPT, DEAL_BRIEF_SYNTHESIS_PROMPT } from './prompts/deal-brief';
import {
  briefResponseSchema,
  briefSynthesisSchema,
  type BriefResponse,
  type BriefSynthesis,
  type Playbook,
} from './schema';
import type { AttachedDoc } from './riskReport';

export interface BriefGenerationArgs {
  projectName: string;
  scopeLabel: string; // "full" or "folder:legal,financial" etc.
  factSheets: AttachedDoc[];
  masterEntitiesSummary: string;
  playbook?: Playbook | null;
  previousBriefHumanSections?: Record<string, string>;
}

export const generateDealBrief = async (
  args: BriefGenerationArgs
): Promise<BriefResponse> => {
  const client = getClaudeClient();
  const model = getModelId('reconciliation'); // Sonnet tier

  const factSheetBlock = args.factSheets
    .map(
      (d) =>
        `<document documentId="${d.documentId}" name="${d.documentName}">\n${d.factSheetMarkdown}\n</document>`
    )
    .join('\n\n');

  const playbookBlock = args.playbook
    ? `<playbook>\n${JSON.stringify(args.playbook, null, 2)}\n</playbook>`
    : '<playbook>No active playbook — use absolute rubric.</playbook>';

  const humanSectionsHint = args.previousBriefHumanSections
    ? `\n\n(Note: the previous brief had human sections for team-notes and custom-context. Emit empty placeholders for those sections — they will be spliced back in afterward.)`
    : '';

  const { input } = await runToolUse<BriefResponse>({
    client,
    model,
    maxTokens: 8192,
    systemPrompt: DEAL_BRIEF_SYSTEM_PROMPT,
    messages: [
      {
        type: 'text',
        text: `Project: ${args.projectName}\nScope: ${args.scopeLabel}\nDocument count: ${args.factSheets.length}${humanSectionsHint}`,
      },
      {
        type: 'text',
        text: `# Master entities summary\n\n${args.masterEntitiesSummary || '(no entities reconciled yet)'}`,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: playbookBlock,
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: `# In-scope document fact sheets\n\n${factSheetBlock}`,
      },
    ],
    toolName: 'submit_brief',
    toolDescription: 'Emit the synthesized deal brief markdown.',
    toolSchema: briefResponseSchema,
  });

  return input;
};

export interface BriefSynthesisArgs {
  projectName: string;
  scopeLabel: string;
  digest: string; // bounded library digest (coverage + top provisions + entities + anomalies)
  masterEntitiesSummary: string;
  playbook?: Playbook | null;
}

/**
 * Scalable synthesis call (library path). Returns ONLY the synthesis fields; the
 * enumerable sections are rendered from Postgres and assembled in TS. Output is
 * bounded, so a small maxTokens is sufficient and overflow cannot drop fields.
 */
export const generateBriefSynthesis = async (
  args: BriefSynthesisArgs
): Promise<BriefSynthesis> => {
  const client = getClaudeClient();
  const model = getModelId('reconciliation'); // Sonnet tier

  const playbookBlock = args.playbook
    ? `<playbook>\n${JSON.stringify(args.playbook, null, 2)}\n</playbook>`
    : '<playbook>No active playbook — use absolute rubric.</playbook>';

  const { input } = await runToolUse<BriefSynthesis>({
    client,
    model,
    maxTokens: 4096, // synthesis is small + constant-size; headroom to spare
    systemPrompt: DEAL_BRIEF_SYNTHESIS_PROMPT,
    messages: [
      { type: 'text', text: `Project: ${args.projectName}\nScope: ${args.scopeLabel}` },
      {
        type: 'text',
        text: `# Master entities summary\n\n${args.masterEntitiesSummary || '(no entities reconciled yet)'}`,
        cache_control: { type: 'ephemeral' },
      },
      { type: 'text', text: playbookBlock, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: `# Deal library digest\n\n${args.digest}` },
    ],
    toolName: 'submit_brief_synthesis',
    toolDescription: 'Emit only the synthesized snapshot, top risks, and clause notes.',
    toolSchema: briefSynthesisSchema,
  });

  return input;
};
