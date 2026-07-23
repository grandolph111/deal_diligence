import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { VERIFY_SYSTEM_PROMPT } from './prompts/verify';
import {
  verifyResponseSchema,
  type VerifyResponse,
  type ExtractionResponse,
  type DocumentType,
} from './schema';

/**
 * Verify an extraction against its source.
 *
 * Prefers the already-parsed page TEXT (`pages`) over re-sending the PDF, which
 * costs ~⅓ as much (no image tokens) and reuses text we already produced for the
 * validator — so the source document is never read twice. `pdfBytes` is only a
 * fallback for when text parsing failed. Deterministic citation checks handle
 * quote presence/page; this pass focuses on what they can't see — missed clauses
 * and mis-rated risk/entities on the documents that matter.
 */
export const verifyExtraction = async (args: {
  pages?: string[];
  pdfBytes?: Buffer;
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

  // Source block: page text (cheap, preferred) or PDF (fallback when no text).
  const useText = args.pages && args.pages.length > 0;
  const sourceBlock = useText
    ? {
        type: 'text' as const,
        text: `# Source document text\n\n${args
          .pages!.map((p, i) => `=== Page ${i + 1} ===\n${p}`)
          .join('\n\n')}`,
        cache_control: { type: 'ephemeral' as const },
      }
    : {
        type: 'document' as const,
        source: {
          type: 'base64' as const,
          media_type: 'application/pdf' as const,
          data: (args.pdfBytes ?? Buffer.alloc(0)).toString('base64'),
        },
        cache_control: { type: 'ephemeral' as const },
      };

  const { input } = await runToolUse<VerifyResponse>({
    client,
    model,
    maxTokens: 4096,
    systemPrompt: VERIFY_SYSTEM_PROMPT,
    messages: [
      sourceBlock,
      {
        type: 'text',
        text: `Filename: ${args.filename}\nDocument type (as classified): ${args.documentType}\n\n# Fact sheet to verify\n\n${factSheet}\n\n# Extracted clauses (for page/quote verification)\n\n${clauseSummaries}\n\nVerify this fact sheet against the source above. A deterministic checker already validates quote wording and page numbers, so focus especially on COMPLETENESS (material clauses that were missed) and JUDGMENT (mis-rated risk levels, misattributed entities). Flag every error you find.`,
      },
    ],
    toolName: 'submit_verification',
    toolDescription: 'Emit the verification results.',
    toolSchema: verifyResponseSchema,
  });

  return input;
};
