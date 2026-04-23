import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { ANOMALY_SYSTEM_PROMPT } from './prompts/reconciliation';
import { anomalyResponseSchema, type AnomalyResponse } from './schema';
import type { AttachedDoc } from './riskReport';

export const detectAnomalies = async (args: {
  factSheets: AttachedDoc[];
  scopeLabel: string;
}): Promise<AnomalyResponse> => {
  if (args.factSheets.length < 3) {
    return { anomalies: [] };
  }

  const client = getClaudeClient();
  const model = getModelId('reconciliation'); // Sonnet

  const block = args.factSheets
    .map(
      (d) =>
        `<document documentId="${d.documentId}" name="${d.documentName}">\n${d.factSheetMarkdown}\n</document>`
    )
    .join('\n\n');

  const { input } = await runToolUse<AnomalyResponse>({
    client,
    model,
    maxTokens: 3072,
    systemPrompt: ANOMALY_SYSTEM_PROMPT,
    messages: [
      {
        type: 'text',
        text: `Scope: ${args.scopeLabel}\nDocument count: ${args.factSheets.length}\n\n# Fact sheets to compare\n\n${block}\n\nIdentify every outlier vs. peers.`,
      },
    ],
    toolName: 'submit_anomalies',
    toolDescription: 'Emit the list of per-document anomalies.',
    toolSchema: anomalyResponseSchema,
  });

  return input;
};
