import { config } from '../../config';
import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { buildExtractionPrompt } from './prompts/extraction';
import {
  extractionResponseSchema,
  type ExtractionResponse,
  type DocumentType,
  type Playbook,
} from './schema';

type ExtractInput =
  | { kind: 'pdf'; bytes: Buffer; filename: string }
  | { kind: 'text'; text: string; filename: string };

export interface ExtractOptions {
  documentType: DocumentType;
  playbook?: Playbook | null;
  /**
   * Override the model chosen by the router. Used for idempotency-hash parity
   * and explicit re-extractions. If omitted, extract.ts uses the provider's
   * default extraction model (the legacy `getModelId('extraction')`). Most
   * callers set this from model-router.pickExtractionModel().
   */
  modelOverride?: string;
  /** Correction hint: if the verifier found issues, pass suggested fixes to a second pass. */
  correctionHint?: string;
}

export const extractDocument = async (
  input: ExtractInput,
  options: ExtractOptions
): Promise<ExtractionResponse> => {
  const client = getClaudeClient();
  const model = options.modelOverride ?? getModelId('extraction');
  const systemPrompt = buildExtractionPrompt({
    documentType: options.documentType,
    playbook: options.playbook,
  });

  const preamble = options.correctionHint
    ? `Filename: ${input.filename}\n\nYou previously extracted this document. A verifier flagged the following issues:\n${options.correctionHint}\n\nRe-extract the document, correcting these issues. Use the same JSON tool call schema.`
    : `Filename: ${input.filename}\n\nExtract the document into the submit_extraction tool call.`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any[] =
    input.kind === 'pdf'
      ? [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: input.bytes.toString('base64'),
            },
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: preamble },
        ]
      : [
          {
            type: 'text',
            text: `---BEGIN DOCUMENT---\n${input.text}\n---END DOCUMENT---`,
            cache_control: { type: 'ephemeral' },
          },
          { type: 'text', text: preamble },
        ];

  const thinkingBudget = config.claude.extractionThinkingBudget;
  // Extraction fact sheets for long contracts can easily exceed 8k output tokens.
  // Haiku 4.5 supports far higher; Opus 4.x supports 64k. Leave plenty of room.
  const maxTokens = Math.max(
    16384,
    (thinkingBudget ?? 0) > 0 ? thinkingBudget! + 8192 : 16384
  );

  const { input: parsed } = await runToolUse<ExtractionResponse>({
    client,
    model,
    maxTokens,
    systemPrompt,
    messages,
    toolName: 'submit_extraction',
    toolDescription:
      'Emit the extracted fact sheet markdown plus structured top-level fields.',
    toolSchema: extractionResponseSchema,
    thinkingBudget,
  });

  return parsed;
};
