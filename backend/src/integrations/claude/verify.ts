import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { VERIFY_SYSTEM_PROMPT } from './prompts/verify';
import {
  verifyResponseSchema,
  type VerifyResponse,
  type ExtractionResponse,
  type DocumentType,
} from './schema';

export const verifyExtraction = async (args: {
  pdfBytes: Buffer;
  extraction: ExtractionResponse;
  documentType: DocumentType;
  filename: string;
}): Promise<VerifyResponse> => {
  const client = getClaudeClient();
  const model = getModelId('reconciliation'); // Sonnet tier

  const factSheet = args.extraction.factSheet;
  const clauseSummaries = (args.extraction.clauses ?? [])
    .map(
      (c, i) =>
        `${i + 1}. clauseType=${c.clauseType}, page=${c.pageNumber}, risk=${c.riskLevel}, quote="${c.content.slice(0, 140).replace(/\n/g, ' ')}${c.content.length > 140 ? '…' : ''}"`
    )
    .join('\n');

  const { input } = await runToolUse<VerifyResponse>({
    client,
    model,
    maxTokens: 4096,
    systemPrompt: VERIFY_SYSTEM_PROMPT,
    messages: [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: args.pdfBytes.toString('base64'),
        },
        cache_control: { type: 'ephemeral' },
      },
      {
        type: 'text',
        text: `Filename: ${args.filename}\nDocument type (as classified): ${args.documentType}\n\n# Fact sheet to verify\n\n${factSheet}\n\n# Extracted clauses (for page/quote verification)\n\n${clauseSummaries}\n\nVerify this fact sheet against the PDF above. Flag every hallucination or error you find.`,
      },
    ],
    toolName: 'submit_verification',
    toolDescription: 'Emit the verification results.',
    toolSchema: verifyResponseSchema,
  });

  return input;
};
