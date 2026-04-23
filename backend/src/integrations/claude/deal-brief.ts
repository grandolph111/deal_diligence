import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { DEAL_BRIEF_SYSTEM_PROMPT } from './prompts/deal-brief';
import {
  briefResponseSchema,
  type BriefResponse,
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
