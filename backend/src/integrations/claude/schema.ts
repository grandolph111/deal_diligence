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
  // Rendered deterministically from the structured fields post-extraction — the
  // model no longer writes it (see prompts/extraction/shared.ts).
  factSheet: z.string().default(''),
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
          // In anchor mode this arrives empty and is filled in deterministically
          // from the source text — see utils/anchor-resolver.
          content: z.preprocess(nullToEmptyString, z.string()),
          /**
           * Anchor mode: the opening and closing few words of the clause, used
           * to locate it in the parsed page text.
           *
           * Emitting a locator instead of the whole quote is what removes the
           * dominant output cost — the model was spending most of its
           * generation time retyping a document we already hold in memory. The
           * resolved span is then verbatim by construction rather than by
           * instruction, which is the stronger guarantee.
           */
          startAnchor: z.preprocess(nullToEmptyString, z.string()).optional(),
          endAnchor: z.preprocess(nullToEmptyString, z.string()).optional(),
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
// Library ToC routing (Haiku) — pick relevant risk categories for a query
// ============================================================

export const libraryRouteResponseSchema = z.object({
  riskCategoryIds: z.preprocess(jsonArrayPreprocessor, z.array(z.string()).default([])),
});
export type LibraryRouteResponse = z.infer<typeof libraryRouteResponseSchema>;

// Provision reranking (Haiku) — rank candidate clauses by relevance to a query.
export const rerankResponseSchema = z.object({
  rankedIds: z.preprocess(jsonArrayPreprocessor, z.array(z.string()).default([])),
});
export type RerankResponse = z.infer<typeof rerankResponseSchema>;

// Citation flag adjudication (Haiku) — decide whether each deterministically-
// flagged quote is genuinely fabricated, a faithful paraphrase, or actually
// verbatim (a false positive). Restores precision to the free validator.
export const ADJUDICATION_VERDICTS = ['VERBATIM', 'PARAPHRASE', 'FABRICATED'] as const;
export const adjudicateResponseSchema = z.object({
  verdicts: z.preprocess(
    jsonArrayPreprocessor,
    z
      .array(
        z.object({
          index: z.number().int(),
          verdict: z.enum(ADJUDICATION_VERDICTS),
          actualPage: z.number().int().nullable().optional(),
          note: z.string().nullable().optional(),
        })
      )
      .default([])
  ),
});
export type AdjudicateResponse = z.infer<typeof adjudicateResponseSchema>;

// ============================================================
// Library lint / gap-hunting (Sonnet)
// ============================================================

export const LINT_FINDING_TYPES = [
  'GAP', // material risk category with no/insufficient evidence
  'THIN', // has evidence but likely incomplete
  'RISK', // flagged item to escalate
  'INCONSISTENCY', // conflicting evidence across documents
  'SUGGESTION', // a document to request / next action
] as const;
export type LintFindingType = (typeof LINT_FINDING_TYPES)[number];

export const lintResponseSchema = z.object({
  findings: z.preprocess(
    jsonArrayPreprocessor,
    z
      .array(
        z.object({
          type: z.enum(LINT_FINDING_TYPES),
          severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
          riskCategoryId: z.string().nullable().optional(), // related risk category slug
          title: z.string(),
          detail: z.string(),
          suggestedAction: z.string().nullable().optional(),
        })
      )
      .default([])
  ),
});
export type LintResponse = z.infer<typeof lintResponseSchema>;

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

// Scalable brief (library path): Claude returns ONLY the synthesis sections; every
// enumerable section (parties, registry, relationships, anomalies, clause lists) is
// rendered deterministically from Postgres and assembled in TS. Output is bounded by
// construction — it does not grow with document count — so it cannot overflow maxTokens.
// Numeric/short fields come FIRST so a truncated response still validates.
export const briefSynthesisSchema = z.object({
  portfolioRiskScore: z.number().int().min(0).max(10).nullable().optional(),
  snapshot: z.string().min(1), // 2-4 sentence deal snapshot
  topRisks: z
    .array(
      z.object({
        title: z.string(),
        docName: z.string(),
        page: z.number().int().nullable().optional(),
        riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
        rationale: z.string(),
      })
    )
    .max(5)
    .default([]),
  keyClauseNotes: z // optional one-line cross-doc synthesis per high-signal clause type
    .array(z.object({ clauseType: z.string(), note: z.string() }))
    .max(12)
    .default([]),
});
export type BriefSynthesis = z.infer<typeof briefSynthesisSchema>;

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

// ============================================================
// Window consolidation (large documents split into page windows)
// ============================================================

/**
 * Document-level judgment reconstructed after per-window extraction.
 *
 * Only the fields a single window genuinely cannot decide correctly live here.
 * Clause/entity/relationship lists are merged deterministically in code — the
 * model is asked for the things that require seeing the whole document at once.
 */
export const consolidateResponseSchema = z.object({
  riskScore: z.number().int().min(0).max(10),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  riskSummary: z.string().default(''),
  confidenceScore: z.number().int().min(0).max(100).default(85),
  confidenceReason: z.string().default(''),
  parties: z.preprocess(jsonArrayPreprocessor, z.array(z.string()).default([])),
  effectiveDate: z.string().nullable().optional(),
  governingLaw: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  dealValue: z.number().nullable().optional(),
  /**
   * Risks that are invisible from inside any single window — a cap in one
   * article contradicted by a survival period in another, a defined term used
   * inconsistently across the document, an obligation with no matching remedy.
   * This is the reason consolidation is a model pass and not a reduce().
   */
  crossWindowFindings: z.preprocess(
    jsonArrayPreprocessor,
    z
      .array(
        z.object({
          note: z.string(),
          severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
          clauseTypes: z.preprocess(
            jsonArrayPreprocessor,
            z.array(z.string()).default([])
          ),
          pageNumbers: z.preprocess(
            jsonArrayPreprocessor,
            z.array(z.number().int()).default([])
          ),
        })
      )
      .default([])
  ),
});
export type ConsolidateResponse = z.infer<typeof consolidateResponseSchema>;
