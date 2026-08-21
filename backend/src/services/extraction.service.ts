/**
 * Document extraction pipeline — v2 with type routing + verify pass.
 *
 *   1. Idempotency check via S3 ETag.
 *   2. Haiku classify (first 2 pages) → docType.
 *   3. Opus extract with type-specific prompt + playbook context + tool-use.
 *   4. Deterministic citation regex validator.
 *   5. Sonnet verify (PDF + fact sheet) → issues + optional corrected fact sheet.
 *   6. Persist + fire reconciliation.
 */

import mammoth from 'mammoth';
import { PDFDocument } from 'pdf-lib';
import { resolveExtractionAnchors } from '../utils/anchor-resolver';
import { readParsedPages, writeParsedPages } from './parsed-page-cache.service';
import {
  extractDocumentWindowed,
  type WindowSource,
} from '../integrations/claude/extract-windowed';
import { DocumentStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { config, isClaudeConfigured } from '../config';
import { s3Service } from './s3.service';
import {
  classifyDocument,
  classifyTextSample,
  extractDocument,
  verifyExtraction,
  adjudicateFlags,
  pickExtractionModel,
  type ExtractionResponse,
  type ClassifyResponse,
  type VerifyResponse,
  type DocumentType,
} from '../integrations/claude';
import { playbookService } from './playbook.service';
import { reconciliationService } from './reconciliation.service';
import { libraryWriterService } from './library-writer.service';
import { extractPdfPages, validateCitations, type CitationIssue } from '../utils/citation-validator';
import { renderFactSheet } from '../utils/fact-sheet-renderer';

/**
 * Adjudicate the low-precision HALLUCINATED_QUOTE flags with Haiku verdicts:
 * keep only confirmed fabrications; drop faithful paraphrases and false
 * positives (quotes Haiku found present that the fuzzy matcher missed). The
 * verdict `index` maps to the position of the flag in the array we sent.
 *
 * Only hallucination flags are passed here — WRONG_PAGE flags are already
 * precise (the validator located the quote verbatim), so they're never sent to
 * Haiku and never overridden.
 */
const keepConfirmedFabrications = (
  hallucinationFlags: CitationIssue[],
  verdicts: Array<{ index: number; verdict: string }>
): CitationIssue[] => {
  const byIndex = new Map(verdicts.map((v) => [v.index, v]));
  return hallucinationFlags.filter((_, i) => {
    const v = byIndex.get(i);
    if (!v) return true; // no verdict returned — keep the flag (conservative)
    return v.verdict === 'FABRICATED'; // drop PARAPHRASE + VERBATIM false positives
  });
};

/** Read the page count from a PDF without decoding content — fast, local. */
const readPdfPageCount = async (bytes: Buffer): Promise<number | null> => {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return doc.getPageCount();
  } catch {
    return null;
  }
};

/* ---------- Source preparation ---------- */

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const isDocx = (mimeType: string, filename: string): boolean =>
  mimeType === DOCX_MIME || filename.toLowerCase().endsWith('.docx');

/**
 * A document normalized into whatever form we're going to send to Claude, plus
 * the parsed page text every downstream stage reuses.
 *
 * `kind: 'text'` is strongly preferred for PDFs. Shipping a PDF as a base64
 * document block costs ~3,200 input tokens/page (it is rendered to images);
 * the same pages as parsed text cost ~740. Measured on a 7-page contract:
 * 22,209 input tokens as PDF vs 5,177 as text — for an identical 68s wall
 * clock and the same clause coverage, because extraction latency is bound by
 * OUTPUT tokens, not input. So the PDF path buys nothing but cost, and we take
 * it only when the file has no usable text layer (scans / image-only PDFs).
 */
interface DocumentSource {
  /** What we send to Claude. */
  kind: 'pdf' | 'text';
  /** Present when kind === 'pdf'. */
  bytes?: Buffer;
  /** Present when kind === 'text'. Page-marked for PDFs, raw for docx/plain. */
  text?: string;
  /** Parsed per-page text. Empty when unavailable (docx, plain text, scans). */
  pages: string[];
  /** True when `text` carries `=== Page N ===` markers. */
  pageMarked: boolean;
  /** Page count from the PDF itself (authoritative), null for non-PDFs. */
  pageCount: number | null;
}

/**
 * True when a PDF's extracted text layer is rich enough to extract from.
 * Scanned/image-only PDFs parse to a handful of stray characters; sending those
 * to Claude as text would silently gut the extraction, so they must keep the
 * (expensive) native PDF path where Claude does its own OCR.
 */
export const hasUsableTextLayer = (pages: string[]): boolean => {
  if (pages.length === 0) return false;
  const totalChars = pages.reduce((sum, p) => sum + p.length, 0);
  return totalChars >= 500 && totalChars / pages.length >= 40;
};

export const withPageMarkers = (pages: string[]): string =>
  pages.map((p, i) => `=== Page ${i + 1} ===\n${p}`).join('\n\n');

/**
 * Parse a document ONCE into the form we send to Claude plus reusable page text.
 * Every later stage (extraction, citation validator, verification) reads from
 * this — the source is never parsed, downloaded, or paid for twice.
 */
export const prepareSource = async (args: {
  filename: string;
  mimeType: string;
  bytes: Buffer;
  /**
   * Enables the S3 parse cache. Omit for callers that already hold bytes with
   * no stable identity (an eval script, an ad-hoc parse) — they simply parse.
   */
  documentId?: string;
  /** Source object ETag, so a re-upload cannot serve the previous file's text. */
  sourceETag?: string | null;
}): Promise<DocumentSource> => {
  if (args.mimeType === 'application/pdf') {
    // A cached parse skips the most expensive local step. It matters most for
    // the paths that run long after extraction — verification sweeps, batch
    // results, and re-checking anchored clauses against their stored offsets,
    // all of which would otherwise re-parse the whole contract to read one page.
    if (args.documentId) {
      const cached = await readParsedPages(args.documentId, args.sourceETag ?? null);
      if (cached && hasUsableTextLayer(cached.pages)) {
        return {
          kind: 'text',
          text: withPageMarkers(cached.pages),
          pages: cached.pages,
          pageMarked: true,
          pageCount: cached.pageCount ?? cached.pages.length,
        };
      }
    }

    const [pageCount, parsed] = await Promise.all([
      readPdfPageCount(args.bytes),
      extractPdfPages(args.bytes).catch(() => ({ pages: [] as string[] })),
    ]);
    const pages = parsed.pages;
    if (args.documentId) {
      // Fire-and-forget: the parse is already in hand, so a slow or failed
      // cache write must not hold up (or fail) the extraction behind it.
      void writeParsedPages(
        args.documentId,
        args.sourceETag ?? null,
        pages,
        pageCount ?? pages.length
      );
    }
    if (hasUsableTextLayer(pages)) {
      return {
        kind: 'text',
        text: withPageMarkers(pages),
        pages,
        pageMarked: true,
        pageCount: pageCount ?? pages.length,
      };
    }
    // No usable text layer — scan or image-only. Fall back to native PDF input
    // so Claude reads the pixels. `pages` stays whatever we got (often empty),
    // which correctly disables the text-based validator and verifier.
    console.log(
      `[extraction] ${args.filename} → no usable text layer (${pages.length} pages parsed); using native PDF input`
    );
    return {
      kind: 'pdf',
      bytes: args.bytes,
      pages,
      pageMarked: false,
      pageCount,
    };
  }

  if (isDocx(args.mimeType, args.filename)) {
    const { value } = await mammoth.extractRawText({ buffer: args.bytes });
    return { kind: 'text', text: value, pages: [], pageMarked: false, pageCount: null };
  }

  return {
    kind: 'text',
    text: args.bytes.toString('utf8'),
    pages: [],
    pageMarked: false,
    pageCount: null,
  };
};

/**
 * Normalize entity types to the canonical vocabulary the frontend expects.
 * Claude sometimes emits synonyms (COMPANY vs ORGANIZATION, AMOUNT vs MONEY)
 * because the CUAD and legal-AI conventions diverge from the original Phase 2B
 * vocabulary used by the UI. Normalize at write-time so downstream code
 * (dashboard rollups, icon maps, master-entity merge) sees a single set.
 */
const ENTITY_TYPE_ALIASES: Record<string, string> = {
  COMPANY: 'ORGANIZATION',
  CORPORATION: 'ORGANIZATION',
  ORG: 'ORGANIZATION',
  AMOUNT: 'MONEY',
  MONETARY: 'MONEY',
  CURRENCY_AMOUNT: 'MONEY',
  PCT: 'PERCENTAGE',
  PERCENT: 'PERCENTAGE',
  PLACE: 'LOCATION',
  GEO: 'LOCATION',
  CLAUSE: 'CLAUSE_TYPE',
  TERM: 'CONTRACT_TERM',
  CONTRACT: 'CONTRACT_TERM',
  JURIS: 'JURISDICTION',
};

const normalizeEntityType = (raw: string): string => {
  const upper = raw.toUpperCase();
  return ENTITY_TYPE_ALIASES[upper] ?? upper;
};

const MAX_RETRIES = 3;
const LOW_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Verification runs AFTER the document is marked COMPLETE, so it is not counted
 * by the extraction queue's own concurrency cap. Without a separate bound, a
 * burst of N extractions finishing together would fire N verifications on top of
 * the next N extractions the queue immediately claims — doubling in-flight Claude
 * calls and tripping the per-minute rate limit. Cap them independently.
 */
const VERIFY_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.EXTRACTION_VERIFY_CONCURRENCY || '3', 10)
);
let verifyInFlight = 0;
const verifyWaiters: Array<() => void> = [];

const acquireVerifySlot = async (): Promise<() => void> => {
  if (verifyInFlight >= VERIFY_CONCURRENCY) {
    await new Promise<void>((resolve) => verifyWaiters.push(resolve));
  }
  verifyInFlight += 1;
  let released = false;
  return () => {
    if (released) return; // idempotent — double-release must not corrupt the count
    released = true;
    verifyInFlight -= 1;
    verifyWaiters.shift()?.();
  };
};

/**
 * A document is only worth the (Sonnet-tier) verification pass where being wrong
 * is costly: material documents, or an extraction the model itself flagged as
 * shaky. Text-based, so it needs parsed pages or the raw PDF to fall back on.
 */
export const shouldVerify = (args: {
  priority?: string;
  confidenceScore?: number | null;
  isPdf: boolean;
}): boolean => {
  if (!isClaudeConfigured() || !args.isPdf) return false;
  const material = args.priority === 'P0' || args.priority === 'P1';
  const lowConfidence = (args.confidenceScore ?? 100) < 70;
  return material || lowConfidence;
};

const extractionKey = (documentId: string) => `extractions/${documentId}.md`;

const deriveRiskLevel = (score: number): 'LOW' | 'MEDIUM' | 'HIGH' => {
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
};

/**
 * True when a clause's content is a "checked-but-absent" confirmation (e.g. the
 * type-specific alwaysInclude list makes the model emit "Present: no" or "No X
 * provision found in this Agreement") rather than a real clause. These are not
 * clause evidence — persisting them pollutes the library and counts as false
 * positives in accuracy scoring, so they are dropped before persist + library filing.
 * Requires an absence phrasing AND a provision/clause word AND an absence verb to
 * avoid dropping genuine operative clauses that merely begin with "No".
 */
const isAbsentMarkerClause = (content: string | null | undefined): boolean => {
  const t = (content ?? '').trim();
  if (t.length < 3) return true;
  if (/^present:\s*no\b/i.test(t)) return true;
  if (/^not\s+(present|found|applicable|specified|included|disclosed)\b/i.test(t)) return true;
  const head = t.slice(0, 180);
  return (
    /^(no\b|there (is|are) no\b)/i.test(head) &&
    /\b(provision|clause|language|section)\b/i.test(head) &&
    /\b(present|found|exist|appears?|applicable|contained|anywhere|in this (agreement|contract))\b/i.test(head)
  );
};

const buildExtractionHash = (etag: string | null, modelId: string): string =>
  `${etag ?? 'no-etag'}::${modelId}`;

/* ---------- Mock mode ---------- */

// Mock confidence used in no-API-key dev mode so the UI renders realistic badges.
const MOCK_CONFIDENCE = 82;
const MOCK_CONFIDENCE_REASON =
  'Mock extraction — not a real confidence score. Configure ANTHROPIC_API_KEY for real values.';

const mockExtract = (filename: string): ExtractionResponse => ({
  factSheet: `---
document_name: ${filename}
document_type: SPA
parties: ["Acme Corporation", "TechStart Inc."]
effective_date: 2026-06-30
governing_law: Delaware
deal_value: $250,000,000
risk_score: 6
risk_level: MEDIUM
page_count: 47
---

# Executive Summary
Mock extraction (Claude not configured). Configure ANTHROPIC_API_KEY for real output.

# Risk Assessment
**Overall: 6/10 (MEDIUM)** — Mock baseline.

## Top Risks
1. **Change of Control trigger** (severity: medium, pages 12-13)
2. **Indemnification scope** (severity: medium, pages 23-24)

# Entities
## Companies
| Acme Corporation | Buyer | 1 |
| TechStart Inc. | Seller | 1 |
`,
  documentType: 'SPA',
  riskScore: 6,
  riskLevel: 'MEDIUM',
  riskSummary: 'Mock — configure Claude.',
  confidenceScore: MOCK_CONFIDENCE,
  confidenceReason: MOCK_CONFIDENCE_REASON,
  parties: ['Acme Corporation', 'TechStart Inc.'],
  effectiveDate: '2026-06-30',
  governingLaw: 'Delaware',
  currency: 'USD',
  dealValue: 250000000,
  pageCount: 47,
  language: 'en',
  region: 'United States',
  entities: [
    { type: 'COMPANY', text: 'Acme Corporation', pageNumber: 1, confidence: 0.95 },
    { type: 'COMPANY', text: 'TechStart Inc.', pageNumber: 1, confidence: 0.95 },
  ],
  clauses: [
    {
      clauseType: 'CHANGE_OF_CONTROL',
      title: 'Change of Control',
      content: 'Upon any Change of Control event involving the transfer of more than 25% of equity...',
      pageNumber: 12,
      riskLevel: 'MEDIUM',
      confidence: 0.88,
    },
  ],
  relationships: [
    {
      sourceText: 'Acme Corporation',
      sourceType: 'COMPANY',
      targetText: 'TechStart Inc.',
      targetType: 'COMPANY',
      relationshipType: 'ACQUIRES',
      pageNumber: 1,
      confidence: 0.95,
    },
  ],
});

/* ---------- Helpers ---------- */

const issueToJson = (issue: CitationIssue) => ({
  type: issue.type,
  severity: issue.severity,
  description: issue.description,
  location: { pageNumber: issue.citedPage ?? null },
  suggestedCorrection:
    issue.type === 'WRONG_PAGE' && issue.actualPage != null
      ? `Use page ${issue.actualPage}`
      : undefined,
});

const verifyIssueToJson = (issue: VerifyResponse['issues'][number]) => ({
  type: issue.type,
  severity: issue.severity,
  description: issue.description,
  location: issue.location ?? null,
  suggestedCorrection: issue.suggestedCorrection ?? null,
});

export type VerificationStatus =
  | 'VERIFIED'
  | 'NEEDS_REVIEW'
  | 'FAILED'
  | 'PENDING';

const determineVerificationStatus = (
  verify: VerifyResponse | null,
  citationIssues: CitationIssue[]
): 'VERIFIED' | 'NEEDS_REVIEW' | 'FAILED' => {
  const verifyCritical = verify?.issues.some((i) => i.severity === 'CRITICAL') ?? false;
  const verifyOther = (verify?.issues.length ?? 0) > 0 || citationIssues.length > 0;

  if (verifyCritical) return 'FAILED';
  if (verifyOther) return 'NEEDS_REVIEW';
  return 'VERIFIED';
};

/* ---------- Service ---------- */

interface PipelineResult {
  classification: ClassifyResponse;
  extraction: ExtractionResponse;
  citationIssues: CitationIssue[];
  /**
   * Status from the deterministic checks alone. 'PENDING' when a verification
   * pass has been queued — it will be patched in when that pass lands.
   */
  verificationStatus: VerificationStatus;
  verificationIssues: Array<Record<string, unknown>>;
  /** Parsed page text, carried through so background verification never re-parses. */
  pages: string[];
  /** Whether this document earned a verification pass. */
  verifyQueued: boolean;
}

/**
 * Parse a model-supplied effective date, or null.
 *
 * `effectiveDate` is a free-text field on the extraction schema, so the model
 * sometimes returns prose ("upon execution", "see §2.1") instead of a date.
 * Handing that straight to `new Date()` yields Invalid Date, Prisma rejects the
 * whole update, and the error path re-runs the ENTIRE extraction — four times,
 * then FAILED. The document is destroyed by an unparseable optional field after
 * the expensive work already succeeded, which is how four documents in the CUAD
 * deal died and burned sixteen Sonnet extractions.
 *
 * A date we cannot read is worth nothing; the extraction around it is worth a
 * lot. Drop the field, keep the document.
 */
export function parseEffectiveDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    console.warn(`[extraction] unparseable effectiveDate ${JSON.stringify(raw)} — storing null`);
    return null;
  }
  // Guard against year 0001 / 275760 style parses that are technically valid
  // Dates but certainly not a contract date.
  const year = parsed.getUTCFullYear();
  if (year < 1900 || year > 2200) {
    console.warn(`[extraction] implausible effectiveDate ${JSON.stringify(raw)} — storing null`);
    return null;
  }
  return parsed;
}

export const extractionService = {
  isConfigured(): boolean {
    return isClaudeConfigured();
  },

  /**
   * Atomically claim a specific PENDING document (→ PROCESSING). Race-safe: the
   * `WHERE status='PENDING'` gate means only one caller (queue worker or a direct
   * trigger) ever wins, so a document is never processed twice.
   */
  async claim(documentId: string): Promise<boolean> {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "Document" SET "processingStatus" = 'PROCESSING', "lastError" = NULL
      WHERE "id" = ${documentId} AND "processingStatus" = 'PENDING'
      RETURNING "id"`;
    return rows.length > 0;
  },

  /** Direct entry point: claim then process. No-op if already claimed/complete. */
  async triggerExtraction(documentId: string): Promise<void> {
    if (await this.claim(documentId)) await this.process(documentId);
  },

  /**
   * Process a document that has already been claimed (status = PROCESSING).
   * Called by the queue worker (after claimNext) and by triggerExtraction.
   * Routes dedup → stub → full extraction.
   */
  async process(documentId: string): Promise<void> {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) return;

    // De-duplication: reuse an already-extracted identical document.
    if (document.duplicateOfId) {
      await this.reuseFromCanonical(documentId, document.duplicateOfId);
      return;
    }

    // Lazy tier: P3 bulk documents are classified + counted, but full CUAD
    // extraction is deferred until a query or a diligence gap needs them.
    if (document.extractionDepth === 'STUB') {
      await this.runStub(documentId);
      return;
    }

    const etag = await s3Service.getObjectETag(document.s3Key);
    const modelId = config.claude.models.extraction;
    const hash = buildExtractionHash(etag, modelId);

    console.log(`[extraction] ${document.name} → starting (priority ${document.priority})`);
    const startedAt = Date.now();

    try {
      const bytes = await s3Service.getObjectBytes(document.s3Key);
      const pipeline = await this.runPipeline({
        filename: document.name,
        mimeType: document.mimeType,
        bytes,
        projectId: document.projectId,
        priority: document.priority,
        documentId,
        sourceETag: etag,
      });
      this.dropAbsentMarkers(pipeline, document.name);

      await this.persistResult(documentId, pipeline, hash, modelId);

      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[extraction] ${document.name} → complete in ${seconds}s`);

      await this.afterPersist(document.projectId, documentId, document.name, pipeline);
    } catch (error) {
      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.error(
        `[extraction] ${document.name} → FAILED after ${seconds}s:`,
        error instanceof Error ? error.message : error
      );
      await this.handleError(documentId, error);
    }
  },

  async runPipeline(args: {
    filename: string;
    mimeType: string;
    bytes: Buffer;
    projectId: string;
    /** Enables the S3 parse cache. Omitted by ad-hoc callers (eval scripts). */
    documentId?: string;
    sourceETag?: string | null;
    priority?: 'P0' | 'P1' | 'P2' | 'P3';
    /**
     * Extraction that already happened elsewhere — currently the Message
     * Batches path, where the model call ran hours earlier on Anthropic's side.
     *
     * Supplying it here rather than giving the batch path its own pipeline is
     * deliberate: fact-sheet rendering, citation validation, adjudication and
     * verification gating are the same work regardless of how the extraction
     * was obtained, and a second copy of that sequence would drift from this
     * one within a release or two.
     */
    precomputed?: {
      extraction: ExtractionResponse;
      classification: ClassifyResponse;
    };
  }): Promise<PipelineResult> {
    // 1. Parse the source ONCE, up front. Everything downstream — classification,
    //    extraction, the citation validator, verification — reads from this. For
    //    PDFs with a text layer this also swaps the input we send Claude from
    //    base64 images to parsed text (~4x fewer input tokens, same latency).
    const source = await prepareSource(args);
    if (source.kind === 'text' && source.pageMarked) {
      console.log(
        `[extraction] ${args.filename} → text layer OK (${source.pages.length} pages, ${source.text!.length} chars); sending as text`
      );
    }

    // 2. Classify + load playbooks concurrently — independent of each other.
    //    A batched document arrives already classified and extracted, so both
    //    model calls are skipped and only the playbooks are loaded.
    const [classification, playbook, companyPlaybookMarkdown] = await Promise.all([
      args.precomputed
        ? Promise.resolve(args.precomputed.classification)
        : this.classify({ filename: args.filename, source }),
      playbookService.get(args.projectId),
      playbookService.getCompanyMarkdown(args.projectId),
    ]);

    // 3. Pick the extraction model based on size + type.
    const decision = pickExtractionModel({
      pageCount: source.pageCount,
      documentType: classification.documentType,
      priority: args.priority,
    });
    console.log(
      `[extraction] ${args.filename} → routed to ${decision.model} (${decision.reason})`
    );

    // 4. Extract (unless the batch path already did).
    const extraction =
      args.precomputed?.extraction ??
      (await this.extract({
        filename: args.filename,
        source,
        documentType: classification.documentType,
        playbook,
        companyPlaybookMarkdown,
        modelOverride: decision.model,
      }));

    // Render the human-readable fact sheet deterministically from the structured
    // fields (the model no longer writes it — saves ~3-4k output tokens/doc). Fall
    // back to the model's text if an older prompt still produced one.
    if (!extraction.factSheet || extraction.factSheet.trim().length === 0) {
      extraction.factSheet = renderFactSheet(extraction, args.filename);
    }

    // 5. Deterministic citation validator (free) — runs on EVERY document.
    let citationIssues: CitationIssue[] = source.pages.length
      ? validateCitations(extraction, source.pages)
      : [];

    // 6. Adjudicate only the low-precision HALLUCINATED_QUOTE flags with a cheap,
    //    TARGETED Haiku pass — clears faithful paraphrases + false positives so
    //    only real fabrications reach a human. WRONG_PAGE flags are already
    //    precise (verbatim match located) and pass through untouched.
    const hallucinationFlags = citationIssues.filter((i) => i.type === 'HALLUCINATED_QUOTE');
    if (isClaudeConfigured() && hallucinationFlags.length > 0 && source.pages.length) {
      try {
        const verdicts = await adjudicateFlags({
          pages: source.pages,
          flags: hallucinationFlags.map((iss) => ({
            clauseType: iss.clauseType,
            quote: iss.quote,
            citedPage: iss.citedPage,
            actualPage: iss.actualPage ?? null,
          })),
        });
        const others = citationIssues.filter((i) => i.type !== 'HALLUCINATED_QUOTE');
        citationIssues = [...others, ...keepConfirmedFabrications(hallucinationFlags, verdicts)];
      } catch {
        // adjudication failed — keep the raw deterministic flags (conservative)
      }
    }

    // 7. Verification is NOT on this path. It is a Sonnet-tier judgment pass that
    //    costs ~2.5k output tokens (~45s) and produces only review metadata — no
    //    field the reader sees first depends on it. Running it inline was a third
    //    of end-to-end latency for zero perceived benefit, so the document goes
    //    COMPLETE now and `process()` fires verification in the background, which
    //    patches verificationStatus when it lands.
    const verifyQueued = shouldVerify({
      priority: args.priority,
      confidenceScore: extraction.confidenceScore,
      isPdf: args.mimeType === 'application/pdf',
    });

    return {
      classification,
      extraction,
      citationIssues,
      verificationStatus: verifyQueued
        ? 'PENDING'
        : determineVerificationStatus(null, citationIssues),
      verificationIssues: citationIssues.map(issueToJson),
      pages: source.pages,
      verifyQueued,
    };
  },

  async classify(args: {
    filename: string;
    source: DocumentSource;
  }): Promise<ClassifyResponse> {
    if (!isClaudeConfigured()) {
      return { documentType: 'GENERIC', confidence: 0.5, reasoning: 'Mock' };
    }
    try {
      // Prefer parsed text — classifying from the first two pages of text costs a
      // fraction of the same pages shipped as a PDF slice, and skips the pdf-lib
      // re-save entirely. Native PDF only for sources with no usable text layer.
      if (args.source.kind === 'pdf') {
        return await classifyDocument({
          pdfBytes: args.source.bytes!,
          filename: args.filename,
          pagesToRead: 2,
        });
      }
      const sample = args.source.pages.length
        ? args.source.pages.slice(0, 2).join('\n\n')
        : (args.source.text ?? '');
      return await classifyTextSample({ text: sample, filename: args.filename });
    } catch {
      return {
        documentType: 'GENERIC',
        confidence: 0.5,
        reasoning: 'Classifier failed; defaulting to GENERIC.',
      };
    }
  },

  async extract(args: {
    filename: string;
    source: DocumentSource;
    documentType: DocumentType;
    playbook: Awaited<ReturnType<typeof playbookService.get>>;
    companyPlaybookMarkdown?: string | null;
    modelOverride?: string;
  }): Promise<ExtractionResponse> {
    if (!isClaudeConfigured()) return mockExtract(args.filename);

    const baseOptions = {
      documentType: args.documentType,
      playbook: args.playbook,
      companyPlaybookMarkdown: args.companyPlaybookMarkdown,
      modelOverride: args.modelOverride,
    };

    // Large documents are read in overlapping page windows and reassembled.
    // The constraint that forces this is OUTPUT, not input: a 300-page contract
    // fits the context window and Claude's 600-page document limit comfortably,
    // but it cannot emit its whole clause list inside one response — the tool
    // call truncates mid-JSON and surfaces as a Zod failure.
    //
    // Windowing needs a page-addressable source. Page-marked text is the cheap
    // path (~4x fewer input tokens, and the markers carry absolute page numbers
    // so citations need no correction); a scan with no text layer falls back to
    // slicing the PDF itself. A docx has no pages to slice, so it goes whole and
    // relies on the raised output ceiling.
    const { thresholdPages, windowPages, overlapPages, concurrency, allowPartial } =
      config.claude.windowing;
    const pageCount = args.source.pageCount ?? 0;
    const canWindow =
      pageCount > thresholdPages &&
      ((args.source.pageMarked && args.source.pages.length > 0) ||
        (args.source.kind === 'pdf' && !!args.source.bytes));

    if (canWindow) {
      const windowSource: WindowSource =
        args.source.pageMarked && args.source.pages.length > 0
          ? { kind: 'text', pages: args.source.pages }
          : { kind: 'pdf', bytes: args.source.bytes!, pageCount };

      const { extraction, stats, failedRanges } = await extractDocumentWindowed({
        filename: args.filename,
        documentType: args.documentType,
        source: windowSource,
        extractOptions: baseOptions,
        windowPages,
        overlapPages,
        concurrency,
        allowPartial,
      });

      if (failedRanges.length > 0) {
        console.warn(
          `[extraction] ${args.filename} → PARTIAL: ${stats.windowsFailed}/` +
            `${stats.windowsPlanned} windows failed; fact sheet has gaps`
        );
      }
      return extraction;
    }

    if (pageCount > thresholdPages) {
      console.warn(
        `[extraction] ${args.filename} → ${pageCount}p exceeds the ${thresholdPages}p ` +
          `window threshold but is not page-addressable (kind=${args.source.kind}, ` +
          `pageMarked=${args.source.pageMarked}); reading whole. Watch for output truncation.`
      );
    }

    // Anchor quoting needs parsed page text to resolve locators against, so a
    // scan (no text layer) keeps the verbatim-quote contract.
    const anchorMode = config.claude.anchorQuoting && args.source.pages.length > 0;

    if (args.source.kind === 'pdf') {
      return extractDocument(
        { kind: 'pdf', bytes: args.source.bytes!, filename: args.filename },
        { ...baseOptions, pageCount: args.source.pageCount, anchorMode }
      );
    }

    const extraction = await extractDocument(
      {
        kind: 'text',
        text: args.source.text ?? '',
        filename: args.filename,
        pageMarked: args.source.pageMarked,
      },
      { ...baseOptions, pageCount: args.source.pageCount, anchorMode }
    );

    if (anchorMode) {
      const { stats } = resolveExtractionAnchors(extraction, args.source.pages);
      console.log(
        `[anchors] ${args.filename} → ${stats.resolved}/${stats.total} resolved, ` +
          `${stats.fellBackToQuote} fell back to quote, ${stats.dropped} dropped, ` +
          `${stats.pagesCorrected} page(s) corrected, ` +
          `${stats.ambiguousAnchors} ambiguous`
      );
    }
    return extraction;
  },

  /**
   * Off-critical-path verification. Runs after the document is already COMPLETE
   * and patches `verificationStatus` / `verificationIssues` in place.
   *
   * `context` is the in-memory result from the extraction that just ran — the
   * fast path, with no re-download and no re-parse. Omit it and everything is
   * rebuilt from Postgres + S3 instead, which is what the startup sweep uses to
   * recover documents whose verification was interrupted by a restart.
   *
   * Never throws: verification is advisory, and a failure here must not touch
   * the extraction result or trigger an extraction retry.
   */
  async verifyDocument(
    documentId: string,
    context?: {
      pages: string[];
      extraction: ExtractionResponse;
      documentType: DocumentType;
      filename: string;
      citationIssues: CitationIssue[];
    }
  ): Promise<void> {
    const release = await acquireVerifySlot();
    const startedAt = Date.now();
    try {
      const resolved = context ?? (await this.rebuildVerifyContext(documentId));
      if (!resolved) return;

      const { pages, extraction, documentType, filename, citationIssues } = resolved;

      let verify: VerifyResponse | null = null;
      try {
        verify = await verifyExtraction({
          extraction,
          documentType,
          filename,
          pages,
        });
      } catch (err) {
        console.error(
          `[verify] ${filename} → verifier failed:`,
          err instanceof Error ? err.message : err
        );
      }

      // Verifier unreachable: fall back to what the deterministic checks alone
      // concluded, so the document never sits at PENDING forever.
      const status = determineVerificationStatus(verify, citationIssues);
      const issues = [
        ...citationIssues.map(issueToJson),
        ...(verify?.issues.map(verifyIssueToJson) ?? []),
      ];

      // Guard the write: the document may have been re-queued, re-extracted, or
      // deleted while we were waiting. Only patch a row still sitting at PENDING,
      // so a fresher extraction's status is never clobbered by a stale verify.
      const { count } = await prisma.document.updateMany({
        where: { id: documentId, verificationStatus: 'PENDING' },
        data: {
          verificationStatus: status,
          verificationIssues: (issues.length > 0
            ? (issues as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull),
        },
      });

      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      if (count === 0) {
        console.log(
          `[verify] ${filename} → superseded while verifying (${seconds}s); result discarded`
        );
      } else {
        console.log(
          `[verify] ${filename} → ${status} in ${seconds}s (${issues.length} issue(s))`
        );
      }
    } catch (err) {
      console.error(
        `[verify] ${documentId} → unexpected failure:`,
        err instanceof Error ? err.message : err
      );
    } finally {
      release();
    }
  },

  /**
   * Reconstruct everything verification needs from durable storage, for a
   * document whose in-memory extraction result is gone (server restarted
   * mid-verify). Returns null when the document is no longer verifiable.
   */
  async rebuildVerifyContext(documentId: string): Promise<{
    pages: string[];
    extraction: ExtractionResponse;
    documentType: DocumentType;
    filename: string;
    citationIssues: CitationIssue[];
  } | null> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        name: true,
        s3Key: true,
        mimeType: true,
        documentType: true,
        extractionS3Key: true,
        riskScore: true,
        riskLevel: true,
        riskSummary: true,
        confidenceScore: true,
        confidenceReason: true,
        pageCount: true,
        language: true,
        currency: true,
        region: true,
        dealValue: true,
        effectiveDate: true,
        governingLaw: true,
      },
    });
    if (!document || !document.extractionS3Key) return null;
    if (document.mimeType !== 'application/pdf') return null;

    const [bytes, annotations, entities, factSheet] = await Promise.all([
      s3Service.getObjectBytes(document.s3Key),
      prisma.documentAnnotation.findMany({
        where: { documentId, annotationType: 'CLAUSE', source: 'claude' },
      }),
      prisma.documentEntity.findMany({ where: { documentId, source: 'claude' } }),
      s3Service.getObjectText(document.extractionS3Key).catch(() => ''),
    ]);

    const { pages } = await extractPdfPages(bytes).catch(() => ({ pages: [] as string[] }));
    if (!pages.length) return null; // no text layer → nothing cheap to verify against

    const extraction: ExtractionResponse = {
      factSheet: factSheet || '',
      documentType: document.documentType,
      riskScore: document.riskScore ?? 0,
      riskLevel: (document.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH') ?? undefined,
      riskSummary: document.riskSummary ?? undefined,
      confidenceScore: document.confidenceScore ?? 85,
      confidenceReason: document.confidenceReason ?? '',
      parties: [],
      effectiveDate: document.effectiveDate?.toISOString().slice(0, 10) ?? null,
      governingLaw: document.governingLaw,
      currency: document.currency,
      dealValue: document.dealValue == null ? null : Number(document.dealValue),
      pageCount: document.pageCount,
      language: document.language,
      region: document.region,
      entities: entities.map((e) => ({
        type: e.entityType,
        text: e.text,
        normalizedText: e.normalizedText,
        pageNumber: e.pageNumber,
        confidence: e.confidence ?? 0.9,
      })),
      clauses: annotations.map((a) => ({
        clauseType: a.clauseType ?? 'UNKNOWN',
        title: a.title,
        content: a.content ?? '',
        pageNumber: a.pageNumber,
        riskLevel: (a.riskLevel as 'LOW' | 'MEDIUM' | 'HIGH' | null) ?? null,
        confidence: a.confidence ?? 0.9,
      })),
      relationships: [],
    };

    return {
      pages,
      extraction,
      documentType: (document.documentType as DocumentType) ?? 'GENERIC',
      filename: document.name,
      citationIssues: validateCitations(extraction, pages),
    };
  },

  /**
   * Recover documents left at verificationStatus='PENDING' by a restart. Called
   * once on boot: without it, a crash mid-verification would strand a document
   * in PENDING permanently, since the only trigger was the in-process extraction
   * that has since died.
   */
  async sweepStaleVerifications(): Promise<number> {
    if (!isClaudeConfigured()) return 0;
    const stale = await prisma.document.findMany({
      where: { processingStatus: 'COMPLETE', verificationStatus: 'PENDING' },
      select: { id: true },
      take: 100,
    });
    if (stale.length === 0) return 0;
    console.log(`[verify] resuming ${stale.length} interrupted verification(s)`);
    for (const { id } of stale) void this.verifyDocument(id);
    return stale.length;
  },

  /**
   * Drop "checked-but-absent" confirmations the model emits as clauses.
   *
   * These come from the alwaysInclude coverage prompt; left in they pollute the
   * library and register as false positives. Shared so the batch path filters
   * identically — a batched document that kept them would score differently
   * from the same document extracted live.
   */
  dropAbsentMarkers(pipeline: { extraction: ExtractionResponse }, documentName: string): void {
    const before = pipeline.extraction.clauses.length;
    pipeline.extraction.clauses = pipeline.extraction.clauses.filter(
      (c) => !isAbsentMarkerClause(c.content)
    );
    const dropped = before - pipeline.extraction.clauses.length;
    if (dropped > 0) {
      // eslint-disable-next-line no-console
      console.log(`[extraction] ${documentName} → dropped ${dropped} absent-marker clause(s)`);
    }
  },

  /**
   * Everything that must happen once a document is COMPLETE and readable:
   * file it into the library, schedule the entity-graph rebuild, and queue
   * verification.
   *
   * Shared with the batch path deliberately. These steps used to live inline in
   * `process()`, so a batched document landed COMPLETE but was never filed —
   * which, now that the library drives both retrieval and the data-room
   * navigation, meant it was invisible to chat, to Kanban AI, to the deal map,
   * and to the risk category tree despite having been fully extracted.
   */
  async afterPersist(
    projectId: string,
    documentId: string,
    documentName: string,
    pipeline: PipelineResult
  ): Promise<void> {
    // Best-effort: never fail an extraction that already succeeded.
    if (libraryWriterService.isEnabled()) {
      try {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          select: { name: true },
        });
        await libraryWriterService.fileDocument({
          projectId,
          projectName: project?.name ?? 'Deal',
          documentId,
          documentName,
          extraction: pipeline.extraction,
        });
      } catch (libErr) {
        // eslint-disable-next-line no-console
        console.error(
          `[library] fileDocument failed for ${documentName}:`,
          libErr instanceof Error ? libErr.message : libErr
        );
      }
    }

    reconciliationService.scheduleRebuild(projectId).catch(() => undefined);

    // Fire verification AFTER the document is COMPLETE and readable.
    // Deliberately not awaited — it only patches review metadata, and errors are
    // swallowed inside verifyDocument so they can never reach the retry path.
    if (pipeline.verifyQueued) {
      void this.verifyDocument(documentId, {
        pages: pipeline.pages,
        extraction: pipeline.extraction,
        documentType: pipeline.classification.documentType,
        filename: documentName,
        citationIssues: pipeline.citationIssues,
      });
    }
  },

  async persistResult(
    documentId: string,
    pipeline: PipelineResult,
    contentHash: string,
    modelId: string
  ): Promise<void> {
    const { extraction, classification, verificationStatus, verificationIssues } =
      pipeline;
    const s3Key = extractionKey(documentId);
    await s3Service.putObjectText(s3Key, extraction.factSheet);

    const summary = extraction.riskSummary ?? extraction.factSheet.slice(0, 200);

    await prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: 'COMPLETE' as DocumentStatus,
        extractionS3Key: s3Key,
        extractionSummary: summary.slice(0, 200),
        extractionContentHash: contentHash,
        extractionModel: modelId,
        riskScore: extraction.riskScore,
        riskLevel:
          extraction.riskLevel ?? deriveRiskLevel(extraction.riskScore),
        riskSummary: extraction.riskSummary ?? null,
        confidenceScore: extraction.confidenceScore ?? null,
        confidenceReason: extraction.confidenceReason ?? null,
        documentType: classification.documentType,
        documentTypeConfidence: classification.confidence,
        pageCount: extraction.pageCount ?? null,
        language: extraction.language ?? null,
        currency: extraction.currency ?? null,
        region: extraction.region ?? null,
        dealValue: extraction.dealValue ?? null,
        effectiveDate: parseEffectiveDate(extraction.effectiveDate),
        governingLaw: extraction.governingLaw ?? null,
        verificationStatus,
        verificationIssues: (verificationIssues.length > 0
          ? (verificationIssues as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull),
        lastError: null,
        retryCount: 0,
      },
    });

    // Replace AI-sourced entities for this document.
    // Normalize entity types to the canonical vocabulary so the frontend's
    // Record<EntityType, …> maps never see an unknown key.
    await prisma.documentEntity.deleteMany({
      where: { documentId, source: 'claude' },
    });
    if (extraction.entities.length > 0) {
      await prisma.documentEntity.createMany({
        data: extraction.entities.map((e) => ({
          documentId,
          entityType: normalizeEntityType(e.type),
          text: e.text,
          normalizedText: e.normalizedText ?? null,
          pageNumber: e.pageNumber ?? null,
          confidence: e.confidence,
          source: 'claude',
          needsReview: e.confidence < LOW_CONFIDENCE_THRESHOLD,
        })),
      });
    }

    await prisma.documentAnnotation.deleteMany({
      where: { documentId, annotationType: 'CLAUSE', source: 'claude' },
    });
    if (extraction.clauses.length > 0) {
      await prisma.documentAnnotation.createMany({
        data: extraction.clauses.map((c) => ({
          documentId,
          annotationType: 'CLAUSE',
          clauseType: c.clauseType.toUpperCase(),
          title: c.title ?? null,
          content: c.content,
          pageNumber: c.pageNumber ?? null,
          // Character offsets within the page, present when the clause was
          // resolved from an anchor. These make a clause mechanically
          // re-checkable later: slice the page at these offsets and the result
          // must still equal `content`. A generated quote can only ever be
          // fuzzy-matched after the fact; a span can be re-derived exactly.
          startOffset: (c as { startOffset?: number | null }).startOffset ?? null,
          endOffset: (c as { endOffset?: number | null }).endOffset ?? null,
          riskLevel: c.riskLevel ?? null,
          confidence: c.confidence,
          source: 'claude',
        })),
      });
    }
  },

  async handleError(documentId: string, error: unknown): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document) return;

    const message = error instanceof Error ? error.message : String(error);
    const nextRetry = (document.retryCount ?? 0) + 1;

    if (nextRetry <= MAX_RETRIES) {
      // Reset to PENDING so the scheduled retry (or the queue worker) can re-claim.
      await prisma.document.update({
        where: { id: documentId },
        data: { retryCount: nextRetry, lastError: message, processingStatus: 'PENDING' as DocumentStatus },
      });
      const delayMs = Math.min(1000 * 2 ** nextRetry, 30_000);
      setTimeout(() => {
        this.triggerExtraction(documentId).catch(() => undefined);
      }, delayMs);
      return;
    }

    await prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: 'FAILED' as DocumentStatus,
        retryCount: nextRetry,
        lastError: `Max retries exceeded. Last error: ${message}`,
      },
    });
  },

  /**
   * De-dup reuse: point a duplicate at the canonical document's already-computed
   * extraction (shared fact sheet + risk metadata) instead of re-reading it. Does
   * NOT re-file the library — the duplicate would otherwise double-count evidence.
   */
  async reuseFromCanonical(documentId: string, canonicalId: string): Promise<void> {
    const canonical = await prisma.document.findUnique({
      where: { id: canonicalId },
      select: {
        extractionS3Key: true,
        extractionSummary: true,
        riskScore: true,
        riskLevel: true,
        riskSummary: true,
        documentType: true,
        documentTypeConfidence: true,
        pageCount: true,
      },
    });
    if (!canonical || !canonical.extractionS3Key) {
      // Canonical isn't ready yet — fall back to a stub so this doc still resolves.
      await this.runStub(documentId);
      return;
    }
    await prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: 'COMPLETE' as DocumentStatus,
        extractionS3Key: canonical.extractionS3Key,
        extractionSummary: canonical.extractionSummary,
        riskScore: canonical.riskScore,
        riskLevel: canonical.riskLevel,
        riskSummary: canonical.riskSummary,
        documentType: canonical.documentType,
        documentTypeConfidence: canonical.documentTypeConfidence,
        pageCount: canonical.pageCount,
        verificationStatus: 'VERIFIED',
        extractionDepth: 'STUB',
        lastError: null,
        retryCount: 0,
      },
    });
    console.log(`[extraction] ${documentId} → reused canonical ${canonicalId} (duplicate)`);
  },

  /**
   * Stub tier (P3 bulk): classify only + record metadata, mark COMPLETE, and
   * defer full CUAD extraction. Cheap — one Haiku classify (or none in mock mode).
   * No fact sheet, no library filing; the document is categorized and findable and
   * can be promoted to a full extraction later (gap-driven / on demand).
   */
  async runStub(documentId: string): Promise<void> {
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) return;
    let documentType: string | null = null;
    let confidence: number | null = null;
    let pageCount: number | null = null;
    try {
      const bytes = await s3Service.getObjectBytes(document.s3Key);
      const source = await prepareSource({
        filename: document.name,
        mimeType: document.mimeType,
        bytes,
        documentId,
        sourceETag: await s3Service.getObjectETag(document.s3Key),
      });
      pageCount = source.pageCount;
      const classification = await this.classify({ filename: document.name, source });
      documentType = classification.documentType;
      confidence = classification.confidence;
    } catch {
      // classify failed — still mark stubbed so the doc resolves.
    }
    await prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: 'COMPLETE' as DocumentStatus,
        extractionDepth: 'STUB',
        documentType,
        documentTypeConfidence: confidence,
        pageCount,
        extractionSummary: `Stub (${document.priority}): classified${documentType ? ` as ${documentType}` : ''}; deep extraction deferred.`,
        verificationStatus: 'NEEDS_REVIEW',
        lastError: null,
        retryCount: 0,
      },
    });
    console.log(`[extraction] ${document.name} → stubbed (${document.priority}, type=${documentType ?? '?'})`);
  },

  /** Promote a stubbed document to a full extraction (gap-driven / on demand). */
  async promoteToFull(documentId: string): Promise<void> {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        extractionDepth: 'FULL',
        processingStatus: 'PENDING' as DocumentStatus,
        extractionContentHash: null,
        retryCount: 0,
        lastError: null,
      },
    });
    await this.triggerExtraction(documentId);
  },

  async manualRetry(documentId: string): Promise<void> {
    await prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: 'PENDING' as DocumentStatus,
        retryCount: 0,
        lastError: null,
      },
    });
    await this.triggerExtraction(documentId);
  },

  async getStatus(documentId: string) {
    const doc = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        processingStatus: true,
        extractionS3Key: true,
        verificationStatus: true,
        retryCount: true,
        lastError: true,
      },
    });
    if (!doc) throw new Error(`Document not found: ${documentId}`);
    return {
      documentId: doc.id,
      status: doc.processingStatus,
      extractionS3Key: doc.extractionS3Key,
      verificationStatus: doc.verificationStatus,
      retryCount: doc.retryCount ?? 0,
      lastError: doc.lastError,
    };
  },
};
