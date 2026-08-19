/**
 * Document-level consolidation after windowed extraction.
 *
 * A window sees forty pages. It cannot know that the indemnity cap it just read
 * is contradicted by a survival period ninety pages later, that a defined term
 * shifts meaning between articles, or whether the document as a whole is a 4/10
 * or a 9/10. Those are the questions this pass exists to answer — and they are
 * the only questions it is asked. Everything mechanical (deduping clauses,
 * unioning entities, offsetting pages) has already happened in code.
 *
 * The input is the merged clause list, not the PDF. That keeps this call small
 * and cheap regardless of whether the source was 60 pages or 600, and means the
 * source document is never paid for twice.
 */

import { getClaudeClient, getModelId } from './client';
import { runToolUse } from './tool-use';
import { estimateInputTokens } from './rate-limiter';
import {
  consolidateResponseSchema,
  type ConsolidateResponse,
  type ExtractionResponse,
  type DocumentType,
} from './schema';

const CONSOLIDATE_SYSTEM_PROMPT = `You are a senior M&A lawyer producing the final risk judgment for a single contract.

The contract was too long to read in one pass, so it was read in overlapping page windows and the findings were merged mechanically. You are now seeing the complete, deduplicated set of extracted clauses for the whole document at once. Your job is the judgment that no individual window could make.

Do:
- Set riskScore (0-10) and riskLevel for the DOCUMENT AS A WHOLE. This is not an average of the parts. A contract with one fatal change-of-control provision is high risk even if forty other clauses are benign. Conversely, many individually-noted MEDIUM clauses of the same routine type do not compound into a HIGH document.
- Write a riskSummary a deal partner could act on: what actually threatens the transaction, in priority order.
- Reconcile the document-level facts (parties, governing law, effective date, currency, deal value). Windows can disagree; where they do, prefer the reading consistent with the clause text you can see. Return null rather than guessing.
- Report crossWindowFindings: risks visible ONLY because you can see the whole document. Contradictions between distant clauses, defined terms used inconsistently, obligations with no corresponding remedy, caps undermined by carve-outs elsewhere, survival periods inconsistent with the clauses they govern. Cite the clause types and page numbers involved. If you find none, return an empty list — do not manufacture findings.
- Set confidenceScore honestly. Windowed reads lose cross-references; if the clause set looks like it is missing something structural for this document type, say so in confidenceReason and lower the score.

Do not:
- Re-list or restate the clauses. They are already captured.
- Invent clauses, parties, or page numbers not present in the input.

Return everything via the submit_consolidation tool.`;

/** Quotes are truncated — this pass reasons over structure, not full text. */
const CLAUSE_QUOTE_CHARS = 400;
const MAX_CLAUSES_IN_PROMPT = 400;

export interface ConsolidateInput {
  filename: string;
  documentType: DocumentType;
  /** The deterministically merged extraction. */
  merged: ExtractionResponse;
  /** How many windows produced it — context for the confidence judgment. */
  windowCount: number;
  totalPages: number | null;
}

export const consolidateExtraction = async (
  args: ConsolidateInput
): Promise<ConsolidateResponse> => {
  const client = getClaudeClient();
  // Judgment tier: this is the call that decides the document's risk posture,
  // so it does not get the cheap model even when the windows did.
  const model = getModelId('report');

  const clauses = args.merged.clauses.slice(0, MAX_CLAUSES_IN_PROMPT);
  const omitted = args.merged.clauses.length - clauses.length;

  const clauseLines = clauses
    .map((c, i) => {
      const quote = (c.content ?? '').replace(/\s+/g, ' ').slice(0, CLAUSE_QUOTE_CHARS);
      return `${i + 1}. [${c.clauseType}]${c.title ? ` "${c.title}"` : ''} (p.${
        c.pageNumber ?? '?'
      }, ${c.riskLevel ?? 'UNRATED'}): ${quote}`;
    })
    .join('\n');

  const entityLines = args.merged.entities
    .slice(0, 150)
    .map((e) => `- ${e.type}: ${e.normalizedText || e.text} (p.${e.pageNumber ?? '?'})`)
    .join('\n');

  const body =
    `# Document\n` +
    `Filename: ${args.filename}\n` +
    `Type: ${args.documentType}\n` +
    `Pages: ${args.totalPages ?? 'unknown'}\n` +
    `Read in ${args.windowCount} overlapping page windows.\n\n` +
    `# Per-window document-level readings (may disagree)\n` +
    `Parties: ${args.merged.parties.join('; ') || '(none found)'}\n` +
    `Governing law: ${args.merged.governingLaw ?? '(none found)'}\n` +
    `Effective date: ${args.merged.effectiveDate ?? '(none found)'}\n` +
    `Currency: ${args.merged.currency ?? '(none found)'}\n` +
    `Deal value: ${args.merged.dealValue ?? '(none found)'}\n\n` +
    `# Merged clauses (${args.merged.clauses.length} total` +
    `${omitted > 0 ? `, showing first ${clauses.length}` : ''})\n${clauseLines}\n\n` +
    `# Entities\n${entityLines || '(none)'}\n\n` +
    `Produce the document-level judgment via submit_consolidation.`;

  const { input } = await runToolUse<ConsolidateResponse>({
    client,
    model,
    maxTokens: 8192,
    systemPrompt: CONSOLIDATE_SYSTEM_PROMPT,
    messages: [{ type: 'text', text: body }],
    toolName: 'submit_consolidation',
    toolDescription:
      'Emit the document-level risk judgment, reconciled facts, and cross-window findings.',
    toolSchema: consolidateResponseSchema,
    estimatedInputTokens: estimateInputTokens({
      textChars: body.length,
      systemPromptChars: CONSOLIDATE_SYSTEM_PROMPT.length,
    }),
  });

  return input;
};

/**
 * Fold the consolidation verdict onto the merged extraction.
 *
 * Reconciled scalars only overwrite when the model actually returned one —
 * a null from consolidation means "could not determine", which must not erase
 * a value the deterministic merge found by majority vote across windows.
 */
export const applyConsolidation = (
  merged: ExtractionResponse,
  verdict: ConsolidateResponse
): ExtractionResponse => ({
  ...merged,
  riskScore: verdict.riskScore,
  riskLevel: verdict.riskLevel,
  riskSummary: verdict.riskSummary || merged.riskSummary,
  confidenceScore: verdict.confidenceScore,
  confidenceReason: verdict.confidenceReason || merged.confidenceReason,
  parties: verdict.parties.length > 0 ? verdict.parties : merged.parties,
  effectiveDate: verdict.effectiveDate ?? merged.effectiveDate,
  governingLaw: verdict.governingLaw ?? merged.governingLaw,
  currency: verdict.currency ?? merged.currency,
  dealValue: verdict.dealValue ?? merged.dealValue,
});
