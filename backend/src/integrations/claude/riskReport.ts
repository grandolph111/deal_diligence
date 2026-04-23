import { getClaudeClient, getModelId } from './client';
import { runToolUse, type ToolUseUsage } from './tool-use';
import { RISK_REPORT_SYSTEM_PROMPT } from './prompts/riskReport';
import { riskReportResponseSchema, type RiskReportResponse } from './schema';

export interface AttachedDoc {
  documentId: string;
  documentName: string;
  factSheetMarkdown: string;
}

export interface RiskReportResult extends RiskReportResponse {
  usage?: ToolUseUsage;
  durationMs: number;
  model: string;
}

export const generateRiskReport = async (args: {
  brief?: string | null; // deal brief markdown; primary context
  attachedDocs: AttachedDoc[]; // pinned per-doc fact sheets for detail
  userPrompt: string;
  tier?: 'report';
}): Promise<RiskReportResult> => {
  const client = getClaudeClient();
  const model = getModelId(args.tier ?? 'report');

  const briefBlock = args.brief
    ? `# Deal Brief\n\n${args.brief}`
    : '# Deal Brief\n\n(not available — rely on attached documents only)';

  const attachedBlock = args.attachedDocs.length
    ? args.attachedDocs
        .map(
          (d) =>
            `<document documentId="${d.documentId}" name="${d.documentName}">\n${d.factSheetMarkdown}\n</document>`
        )
        .join('\n\n')
    : '(no documents pinned for this task)';

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] = [
    {
      type: 'text',
      text: briefBlock,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: `# Pinned document fact sheets\n\n${attachedBlock}`,
      cache_control: { type: 'ephemeral' },
    },
    {
      type: 'text',
      text: `# User prompt\n\n${args.userPrompt}\n\nModel ID for the report header: ${model}`,
    },
  ];

  const { input, usage, durationMs } = await runToolUse<RiskReportResponse>({
    client,
    model,
    maxTokens: 6144,
    systemPrompt: RISK_REPORT_SYSTEM_PROMPT,
    messages,
    toolName: 'submit_report',
    toolDescription: 'Emit the risk report markdown + summary + citations.',
    toolSchema: riskReportResponseSchema,
  });

  return { ...input, usage, durationMs, model };
};
