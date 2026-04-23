import { z } from 'zod';

// ============================================================
// Document type classifier (Haiku)
// ============================================================

export const DOCUMENT_TYPES = [
  'SPA',
  'APA',
  'LOI',
  'NDA',
  'EMPLOYMENT',
  'LEASE',
  'FINANCIAL',
  'CORPORATE',
  'GENERIC',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const classifyResponseSchema = z.object({
  documentType: z.enum(DOCUMENT_TYPES),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type ClassifyResponse = z.infer<typeof classifyResponseSchema>;

// ============================================================
// Extraction (Opus)
// ============================================================

// Claude (especially Haiku and Sonnet) occasionally serializes arrays as
// JSON-encoded strings when the instruction uses phrasing like "array of
// objects". Haiku also sometimes emits trailing commas or slightly
// non-conforming JSON. This preprocess hook tries increasingly aggressive
// recovery before giving up and letting Zod surface the real type error.
const jsonArrayPreprocessor = (v: unknown) => {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return v;

  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  // First pass: direct parse.
  const direct = tryParse(v);
  if (direct !== undefined) return direct;

  // Second pass: strip trailing commas before `]` or `}` (common Haiku tic).
  const detrailed = v.replace(/,\s*([\]}])/g, '$1');
  const detrailedParsed = tryParse(detrailed);
  if (detrailedParsed !== undefined) return detrailedParsed;

  // Give up. Log a short sample so the tool-use error dump shows what
  // Haiku returned.
  // eslint-disable-next-line no-console
  console.warn(
    `[schema] could not parse stringified array (len=${v.length}): ${v.slice(
      0,
      200
    )}…`
  );
  return v;
};

// Coerce null → '' so Haiku/Sonnet emitting a null where a required string
// is expected doesn't fail the whole extraction. Use only on fields where
// an empty string is a safe "missing" signal (content quotes, entity text).
const nullToEmptyString = (v: unknown) => (v == null ? '' : v);

export const extractionResponseSchema = z.object({
  factSheet: z.string().min(1),
  documentType: z.string().nullable().optional(),
  riskScore: z.number().int().min(0).max(10),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  riskSummary: z.string().optional(),
  /**
   * Self-reported confidence in the overall extraction quality.
   * Bands: 90+ high, 80-89 good, 70-79 moderate, <70 low.
   */
  confidenceScore: z.number().int().min(0).max(100).default(85),
  confidenceReason: z.string().default(''),
  parties: z.preprocess(jsonArrayPreprocessor, z.array(z.string()).default([])),
  effectiveDate: z.string().nullable().optional(),
  governingLaw: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  dealValue: z.number().nullable().optional(),
  pageCount: z.number().int().nullable().optional(),
  language: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  entities: z.preprocess(
    jsonArrayPreprocessor,
    z
      .array(
        z.object({
          type: z.string(),
          text: z.preprocess(nullToEmptyString, z.string()),
          normalizedText: z.string().nullable().optional(),
          pageNumber: z.number().int().nullable().optional(),
          confidence: z.number().min(0).max(1).default(0.9),
        })
      )
      .default([])
  ),
  clauses: z.preprocess(
    jsonArrayPreprocessor,
    z
      .array(
        z.object({
          clauseType: z.string(),
          title: z.string().nullable().optional(),
          // content can come back null from Haiku if no verbatim quote was
          // captured. Coerce to '' rather than failing the whole extraction.
          content: z.preprocess(nullToEmptyString, z.string()),
          pageNumber: z.number().int().nullable().optional(),
          riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).nullable().optional(),
          confidence: z.number().min(0).max(1).default(0.9),
        })
      )
      .default([])
  ),
  relationships: z.preprocess(
    jsonArrayPreprocessor,
    z
      .array(
        z.object({
          sourceText: z.preprocess(nullToEmptyString, z.string()),
          sourceType: z.string(),
          targetText: z.preprocess(nullToEmptyString, z.string()),
          targetType: z.string(),
          relationshipType: z.string(),
          pageNumber: z.number().int().nullable().optional(),
          confidence: z.number().min(0).max(1).default(0.9),
        })
      )
      .default([])
  ),
});
export type ExtractionResponse = z.infer<typeof extractionResponseSchema>;

// ============================================================
// Verification (Sonnet)
// ============================================================

export const VERIFICATION_ISSUE_TYPES = [
  'HALLUCINATED_QUOTE',
  'WRONG_PAGE',
  'MISSING_CLAUSE',
  'RISK_MISMATCH',
  'ENTITY_ERROR',
  'OTHER',
] as const;
export type VerificationIssueType = (typeof VERIFICATION_ISSUE_TYPES)[number];

export const verifyResponseSchema = z.object({
  verified: z.boolean(),
  confidence: z.number().min(0).max(1),
  issues: z.preprocess(
    jsonArrayPreprocessor,
    z
      .array(
        z.object({
          type: z.enum(VERIFICATION_ISSUE_TYPES),
          severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
          description: z.string(),
          location: z
            .object({
              section: z.string().optional(),
              pageNumber: z.number().int().nullable().optional(),
            })
            .optional(),
          suggestedCorrection: z.string().optional(),
        })
      )
      .default([])
  ),
  correctedFactSheet: z.string().optional(),
});
export type VerifyResponse = z.infer<typeof verifyResponseSchema>;

// ============================================================
// Risk report (Opus)
// ============================================================

export const riskReportResponseSchema = z.object({
  report: z.string().min(1),
  summary: z.string().min(1),
  /**
   * Self-reported confidence in the risk-report conclusions.
   * Bands: 90+ high, 80-89 good, 70-79 moderate, <70 low.
   */
  confidenceScore: z.number().int().min(0).max(100).default(85),
  confidenceReason: z.string().default(''),
  citations: z.preprocess(
    jsonArrayPreprocessor,
    z
      .array(
        z.object({
          documentId: z.string(),
          pageNumber: z.number().int().nullable().optional(),
          quote: z.string(),
        })
      )
      .default([])
  ),
});
export type RiskReportResponse = z.infer<typeof riskReportResponseSchema>;

/**
 * Shared confidence-band helpers. Keep in sync with the frontend pill component.
 */
export const confidenceBand = (
  score: number | null | undefined
): 'HIGH' | 'GOOD' | 'MODERATE' | 'LOW' | 'UNKNOWN' => {
  if (score == null) return 'UNKNOWN';
  if (score >= 90) return 'HIGH';
  if (score >= 80) return 'GOOD';
  if (score >= 70) return 'MODERATE';
  return 'LOW';
};

// ============================================================
// Chat (Haiku)
// ============================================================

export const chatResponseSchema = z.object({
  content: z.string().min(1),
  citations: z.preprocess(
    jsonArrayPreprocessor,
    z
      .array(
        z.object({
          documentId: z.string(),
          pageNumber: z.number().int().nullable().optional(),
          snippet: z.string(),
        })
      )
      .default([])
  ),
});
export type ChatResponse = z.infer<typeof chatResponseSchema>;

// ============================================================
// Reconciliation (Sonnet)
// ============================================================

export const reconciliationResponseSchema = z.object({
  masterEntities: z.preprocess(
    jsonArrayPreprocessor,
    z
      .array(
        z.object({
          entityType: z.string(),
          canonicalName: z.string(),
          aliases: z
            .preprocess(jsonArrayPreprocessor, z.array(z.string()))
            .default([]),
        })
      )
      .default([])
  ),
  relationships: z.preprocess(
    jsonArrayPreprocessor,
    z
      .array(
        z.object({
          sourceCanonicalName: z.string(),
          sourceType: z.string(),
          targetCanonicalName: z.string(),
          targetType: z.string(),
          relationshipType: z.string(),
          evidenceDocumentIds: z
            .preprocess(jsonArrayPreprocessor, z.array(z.string()))
            .default([]),
          confidence: z.number().min(0).max(1).default(0.9),
        })
      )
      .default([])
  ),
});
export type ReconciliationResponse = z.infer<typeof reconciliationResponseSchema>;

// ============================================================
// Peer-group anomaly detection (Sonnet)
// ============================================================

export const anomalyResponseSchema = z.object({
  anomalies: z.preprocess(
    jsonArrayPreprocessor,
    z
      .array(
        z.object({
          documentId: z.string(),
          clauseType: z.string(),
          thisValue: z.string(),
          peerValue: z.string(),
          peerSize: z.number().int().min(3),
          reason: z.string(),
        })
      )
      .default([])
  ),
});
export type AnomalyResponse = z.infer<typeof anomalyResponseSchema>;

// ============================================================
// Deal brief (Sonnet)
// ============================================================

export const briefResponseSchema = z.object({
  brief: z.string().min(1),
  docCount: z.number().int().min(0),
  portfolioRiskScore: z.number().int().min(0).max(10).nullable().optional(),
});
export type BriefResponse = z.infer<typeof briefResponseSchema>;

// ============================================================
// Playbook (stored on Project.playbook)
// ============================================================

export const playbookSchema = z.object({
  version: z.literal(1),
  dealContext: z.string().optional(),
  redFlags: z.array(z.string()).default([]),
  standardPositions: z
    .array(
      z.object({
        clauseType: z.string(),
        preferredLanguage: z.string().optional(),
        fallbacks: z.array(z.string()).default([]),
        riskIfDeviates: z.enum(['LOW', 'MEDIUM', 'HIGH']),
        notes: z.string().optional(),
      })
    )
    .default([]),
});
export type Playbook = z.infer<typeof playbookSchema>;

export const emptyPlaybook: Playbook = {
  version: 1,
  dealContext: undefined,
  redFlags: [],
  standardPositions: [],
};
