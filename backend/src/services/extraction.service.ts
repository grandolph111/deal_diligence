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
import { DocumentStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { config, isClaudeConfigured } from '../config';
import { s3Service } from './s3.service';
import {
  classifyDocument,
  classifyTextSample,
  extractDocument,
  verifyExtraction,
  pickExtractionModel,
  type ExtractionResponse,
  type ClassifyResponse,
  type VerifyResponse,
  type DocumentType,
} from '../integrations/claude';
import { playbookService } from './playbook.service';
import { reconciliationService } from './reconciliation.service';
import { extractPdfPages, validateCitations, type CitationIssue } from '../utils/citation-validator';

/** Read the page count from a PDF without decoding content — fast, local. */
const readPdfPageCount = async (bytes: Buffer): Promise<number | null> => {
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    return doc.getPageCount();
  } catch {
    return null;
  }
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

const extractionKey = (documentId: string) => `extractions/${documentId}.md`;

const deriveRiskLevel = (score: number): 'LOW' | 'MEDIUM' | 'HIGH' => {
  if (score >= 7) return 'HIGH';
  if (score >= 4) return 'MEDIUM';
  return 'LOW';
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

const determineVerificationStatus = (
  verify: VerifyResponse | null,
  citationIssues: CitationIssue[],
  correctionApplied: boolean
): 'VERIFIED' | 'NEEDS_REVIEW' | 'FAILED' => {
  const verifyCritical = verify?.issues.some((i) => i.severity === 'CRITICAL') ?? false;
  const verifyOther = (verify?.issues.length ?? 0) > 0 || citationIssues.length > 0;

  if (verifyCritical && !correctionApplied) return 'FAILED';
  if (verifyOther) return 'NEEDS_REVIEW';
  return 'VERIFIED';
};

/* ---------- Service ---------- */

interface PipelineResult {
  classification: ClassifyResponse;
  extraction: ExtractionResponse;
  citationIssues: CitationIssue[];
  verify: VerifyResponse | null;
  verificationStatus: 'VERIFIED' | 'NEEDS_REVIEW' | 'FAILED';
  verificationIssues: Array<Record<string, unknown>>;
}

export const extractionService = {
  isConfigured(): boolean {
    return isClaudeConfigured();
  },

  async triggerExtraction(documentId: string): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document) throw new Error(`Document not found: ${documentId}`);

    const etag = await s3Service.getObjectETag(document.s3Key);
    const modelId = config.claude.models.extraction;
    const hash = buildExtractionHash(etag, modelId);

    if (
      document.extractionContentHash === hash &&
      document.processingStatus === 'COMPLETE' &&
      document.verificationStatus === 'VERIFIED'
    ) {
      console.log(`[extraction] ${document.name} → cache hit, skipping`);
      return;
    }

    console.log(`[extraction] ${document.name} → starting (model: ${modelId})`);
    const startedAt = Date.now();

    await prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: 'PROCESSING' as DocumentStatus,
        lastError: null,
      },
    });

    try {
      const bytes = await s3Service.getObjectBytes(document.s3Key);
      const pipeline = await this.runPipeline({
        filename: document.name,
        mimeType: document.mimeType,
        bytes,
        projectId: document.projectId,
      });
      await this.persistResult(documentId, pipeline, hash, modelId);

      const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
      console.log(`[extraction] ${document.name} → complete in ${seconds}s`);

      reconciliationService
        .scheduleRebuild(document.projectId)
        .catch(() => undefined);
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
  }): Promise<PipelineResult> {
    // 1. Classify
    const classification = await this.classify(args);

    // 2. Page count (cheap local read, PDF only) — drives model router
    const pageCount =
      args.mimeType === 'application/pdf'
        ? await readPdfPageCount(args.bytes)
        : null;

    // 3. Pick extraction model based on size + type
    const decision = pickExtractionModel({
      pageCount,
      documentType: classification.documentType,
    });
    // eslint-disable-next-line no-console
    console.log(
      `[extraction] ${args.filename} → routed to ${decision.model} (${decision.reason})`
    );

    // 4. Load playbook (per project)
    const playbook = await playbookService.get(args.projectId);

    // 5. Extract
    const extraction = await this.extract({
      filename: args.filename,
      mimeType: args.mimeType,
      bytes: args.bytes,
      documentType: classification.documentType,
      playbook,
      modelOverride: decision.model,
    });

    // 4. Citation regex validation (only on PDFs — needs raw text)
    let citationIssues: CitationIssue[] = [];
    if (args.mimeType === 'application/pdf') {
      try {
        const { pages } = await extractPdfPages(args.bytes);
        citationIssues = validateCitations(extraction, pages);
      } catch {
        // ignore; verifier still runs
      }
    }

    // 5. Sonnet verify (only on PDFs; tool currently only supports PDF doc source)
    let verify: VerifyResponse | null = null;
    if (isClaudeConfigured() && args.mimeType === 'application/pdf') {
      try {
        verify = await verifyExtraction({
          pdfBytes: args.bytes,
          extraction,
          documentType: classification.documentType,
          filename: args.filename,
        });
      } catch {
        // verifier failed — treat as "no verification" rather than fail extraction
      }
    }

    // 6. Auto-correct if verify provided a full replacement fact sheet
    let correctionApplied = false;
    if (verify?.correctedFactSheet) {
      extraction.factSheet = verify.correctedFactSheet;
      correctionApplied = true;
    }

    const verificationStatus = determineVerificationStatus(
      verify,
      citationIssues,
      correctionApplied
    );

    const allIssues = [
      ...citationIssues.map(issueToJson),
      ...(verify?.issues.map(verifyIssueToJson) ?? []),
    ];

    return {
      classification,
      extraction,
      citationIssues,
      verify,
      verificationStatus,
      verificationIssues: allIssues,
    };
  },

  async classify(args: {
    filename: string;
    mimeType: string;
    bytes: Buffer;
  }): Promise<ClassifyResponse> {
    if (!isClaudeConfigured()) {
      return { documentType: 'GENERIC', confidence: 0.5, reasoning: 'Mock' };
    }
    try {
      if (args.mimeType === 'application/pdf') {
        return await classifyDocument({
          pdfBytes: args.bytes,
          filename: args.filename,
          pagesToRead: 2,
        });
      }
      if (
        args.mimeType ===
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        args.filename.toLowerCase().endsWith('.docx')
      ) {
        const { value } = await mammoth.extractRawText({ buffer: args.bytes });
        return await classifyTextSample({
          text: value,
          filename: args.filename,
        });
      }
      const text = args.bytes.toString('utf8');
      return await classifyTextSample({ text, filename: args.filename });
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
    mimeType: string;
    bytes: Buffer;
    documentType: DocumentType;
    playbook: Awaited<ReturnType<typeof playbookService.get>>;
    modelOverride?: string;
  }): Promise<ExtractionResponse> {
    if (!isClaudeConfigured()) return mockExtract(args.filename);

    const baseOptions = {
      documentType: args.documentType,
      playbook: args.playbook,
      modelOverride: args.modelOverride,
    };

    if (args.mimeType === 'application/pdf') {
      return extractDocument(
        { kind: 'pdf', bytes: args.bytes, filename: args.filename },
        baseOptions
      );
    }
    if (
      args.mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      args.filename.toLowerCase().endsWith('.docx')
    ) {
      const { value } = await mammoth.extractRawText({ buffer: args.bytes });
      return extractDocument(
        { kind: 'text', text: value, filename: args.filename },
        baseOptions
      );
    }
    const text = args.bytes.toString('utf8');
    return extractDocument(
      { kind: 'text', text, filename: args.filename },
      baseOptions
    );
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
        effectiveDate: extraction.effectiveDate
          ? new Date(extraction.effectiveDate)
          : null,
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
      await prisma.document.update({
        where: { id: documentId },
        data: { retryCount: nextRetry, lastError: message },
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
