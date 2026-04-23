import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { RECONCILIATION_SYSTEM_PROMPT } from './prompts/reconciliation';
import {
  reconciliationResponseSchema,
  type ReconciliationResponse,
} from './schema';
import type { AttachedDoc } from './riskReport';

export const reconcileGraph = async (args: {
  factSheets: AttachedDoc[];
}): Promise<ReconciliationResponse> => {
  if (args.factSheets.length < 2) {
    return { masterEntities: [], relationships: [] };
  }
  const client = getClaudeClient();
  const model = getModelId('reconciliation');

  const block = args.factSheets
    .map(
      (d) =>
        `<document documentId="${d.documentId}" name="${d.documentName}">\n${d.factSheetMarkdown}\n</document>`
    )
    .join('\n\n');

  const { input } = await runToolUse<ReconciliationResponse>({
    client,
    model,
    maxTokens: 4096,
    systemPrompt: RECONCILIATION_SYSTEM_PROMPT,
    messages: [
      {
        type: 'text',
        text: `# Fact sheets for this deal\n\n${block}\n\nReconcile into the submit_reconciliation tool.`,
      },
    ],
    toolName: 'submit_reconciliation',
    toolDescription:
      'Emit merged master entities and cross-document relationships.',
    toolSchema: reconciliationResponseSchema,
  });

  return input;
};
