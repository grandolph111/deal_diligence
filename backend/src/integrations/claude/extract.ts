import { config } from '../../config';
import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import {
  estimateInputTokens,
  estimateExtractionOutputTokens,
} from './rate-limiter';
import { buildExtractionPrompt } from './prompts/extraction';
import {
  extractionResponseSchema,
  type ExtractionResponse,
  type DocumentType,
  type Playbook,
} from './schema';

type ExtractInput =
  | { kind: 'pdf'; bytes: Buffer; filename: string }
  | {
      kind: 'text';
      text: string;
      filename: string;
      /**
       * True when `text` carries `=== Page N ===` markers (a PDF we parsed
       * locally rather than shipping as base64 images). Text costs ~4x fewer
       * input tokens than the same pages as a PDF document block and reads at
       * the same speed, but the model loses native page awareness — so when
       * markers are present we must tell it to cite them.
       */
      pageMarked?: boolean;
    };

export interface ExtractOptions {
  documentType: DocumentType;
  playbook?: Playbook | null;
  /** Firm-wide house playbook markdown, injected (cached) above the deal playbook. */
  companyPlaybookMarkdown?: string | null;
  /**
   * Override the model chosen by the router. Used for idempotency-hash parity
   * and explicit re-extractions. If omitted, extract.ts uses the provider's
   * default extraction model (the legacy `getModelId('extraction')`). Most
   * callers set this from model-router.pickExtractionModel().
   */
  modelOverride?: string;
  /** Correction hint: if the verifier found issues, pass suggested fixes to a second pass. */
  correctionHint?: string;
  /**
   * Set when this input is one page-window of a larger document.
   *
   * `absolutePages` distinguishes the two window sources. On the page-marked
   * text path the markers already carry document-true page numbers, so the
   * model is left alone. On the sliced-PDF path each window is a fresh PDF
   * numbered from 1, so the model is told to number relative to the excerpt and
   * the caller adds the offset back deterministically — safer than asking a
   * model to add 147 to every citation it emits.
   */
  windowContext?: {
    index: number;
    total: number;
    startPage: number;
    endPage: number;
    absolutePages: boolean;
  };
  /** Page count of THIS input, for token-budget admission control. */
  pageCount?: number | null;
  /**
   * Ask for clause locators instead of full quotes. Only valid when the caller
   * holds parsed page text to resolve them against — see anchor-resolver.
   */
  anchorMode?: boolean;
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
    companyPlaybookMarkdown: options.companyPlaybookMarkdown,
    anchorMode: options.anchorMode,
  });

  // Page-number provenance. A PDF document block gives the model native page
  // awareness; parsed text does not, so the markers become the sole source of
  // truth for every pageNumber it emits. Lives in the user message, not the
  // cached system prompt, so it never invalidates the prompt cache.
  const pageNote =
    input.kind === 'text' && input.pageMarked
      ? `\n\nThe document text below is annotated with "=== Page N ===" markers. Every pageNumber you emit MUST be the number from the marker of the page the text actually appears under. Do not guess or interpolate page numbers.`
      : '';

  // Window framing. Two costs are being managed here. The obvious one is
  // correctness at the boundaries. The less obvious one is output volume: a
  // naive split makes every window re-emit the document-level scalars and prose,
  // which measured at roughly 2x the single-pass output for no extra coverage.
  // Windows are therefore told to extract clauses and stay quiet about the
  // document-level narrative, which the consolidation pass owns.
  const win = options.windowContext;
  const windowNote = win
    ? `\n\nThis is EXCERPT ${win.index + 1} of ${win.total} from a longer document (source pages ${win.startPage}-${win.endPage}).` +
      (win.absolutePages
        ? ''
        : `\n\nPage numbering: number every pageNumber from 1 relative to THIS EXCERPT — the first page you can see is page 1. Do not use the original document's page numbers; they are restored automatically afterwards.`) +
      `\n\nBoundaries: a clause may begin before this excerpt or continue past its end. Extract a clause only when you can see enough of it to quote accurately. Excerpts overlap, so a clause cut off at either edge is captured whole by its neighbour — a truncated quote here is worse than no quote, because it becomes a citation that cannot be verified.

Scope — this excerpt only:
- Extract clauses, entities, and relationships visible in these pages. This is your main job.
- Report a document-level scalar (parties, governingLaw, effectiveDate, currency, dealValue) ONLY if the clause establishing it appears in THIS excerpt. Otherwise leave it null. Do not infer or carry over.
- Set riskScore and riskLevel for what is visible here alone.
- Leave riskSummary and confidenceReason EMPTY. A separate pass sees every excerpt at once and writes the document-level narrative; prose written here is discarded, so producing it only costs output tokens and slows the read.`
    : '';

  const preamble = options.correctionHint
    ? `Filename: ${input.filename}${pageNote}\n\nYou previously extracted this document. A verifier flagged the following issues:\n${options.correctionHint}\n\nRe-extract the document, correcting these issues. Use the same JSON tool call schema.${windowNote}`
    : `Filename: ${input.filename}${pageNote}\n\nExtract the document into the submit_extraction tool call.${windowNote}`;

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
  // The clause list is the largest output this system produces, and hitting the
  // ceiling truncates the tool call mid-JSON — which surfaces as a Zod failure
  // rather than a clean error. `runToolUse` streams above ~16k, so the ceiling
  // can be generous without risking an HTTP timeout.
  const maxTokens = Math.max(
    config.claude.extractionMaxOutputTokens,
    (thinkingBudget ?? 0) > 0 ? thinkingBudget! + 8192 : 0
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
    expectedOutputTokens: estimateExtractionOutputTokens({
      pages: options.pageCount,
      maxTokens,
      isWindow: !!win,
      anchorMode: options.anchorMode,
    }),
    estimatedInputTokens: estimateInputTokens({
      pdfPages: input.kind === 'pdf' ? options.pageCount ?? undefined : undefined,
      textChars: input.kind === 'text' ? input.text.length : undefined,
      systemPromptChars: systemPrompt.length,
    }),
  });

  return parsed;
};
