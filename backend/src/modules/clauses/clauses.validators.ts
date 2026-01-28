import { z } from 'zod';

/**
 * Clause types that can be detected in documents
 * Based on common M&A contract clauses
 */
export const clauseTypeEnum = z.enum([
  'TERMINATION',
  'LIABILITY',
  'INDEMNIFICATION',
  'CONFIDENTIALITY',
  'NON_COMPETE',
  'CHANGE_OF_CONTROL',
  'ASSIGNMENT',
  'GOVERNING_LAW',
  'DISPUTE_RESOLUTION',
  'PAYMENT_TERMS',
  'WARRANTY',
  'INTELLECTUAL_PROPERTY',
  'FORCE_MAJEURE',
  'REPRESENTATIONS',
  'COVENANTS',
  'CONDITIONS_PRECEDENT',
  'MATERIAL_ADVERSE_CHANGE',
  'OTHER',
]);

export type ClauseType = z.infer<typeof clauseTypeEnum>;

/**
 * Risk levels for flagged clauses
 */
export const riskLevelEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export type RiskLevel = z.infer<typeof riskLevelEnum>;

/**
 * Query parameters for listing clauses
 */
export const listClausesQuerySchema = z.object({
  clauseType: clauseTypeEnum.optional(),
  riskLevel: riskLevelEnum.optional(),
  isRiskFlagged: z.coerce.boolean().optional(),
  isVerified: z.coerce.boolean().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListClausesQuery = z.infer<typeof listClausesQuerySchema>;

/**
 * Query parameters for searching clauses across a project
 */
export const searchClausesQuerySchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  clauseType: clauseTypeEnum.optional(),
  riskLevel: riskLevelEnum.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type SearchClausesQuery = z.infer<typeof searchClausesQuerySchema>;

/**
 * Schema for syncing clauses from Python microservice
 */
export const syncClausesSchema = z.object({
  clauses: z.array(
    z.object({
      clauseType: clauseTypeEnum,
      title: z.string().optional(),
      content: z.string(),
      pageNumber: z.number().int().positive().nullable().optional(),
      startOffset: z.number().int().nonnegative().optional(),
      endOffset: z.number().int().nonnegative().optional(),
      confidence: z.number().min(0).max(1),
      riskLevel: riskLevelEnum.nullable().optional(),
      riskReason: z.string().nullable().optional(),
    })
  ),
});

export type SyncClausesInput = z.infer<typeof syncClausesSchema>;

/**
 * Schema for manually creating a clause annotation
 */
export const createClauseSchema = z.object({
  clauseType: clauseTypeEnum,
  title: z.string().optional(),
  content: z.string().min(1, 'Clause content is required'),
  pageNumber: z.number().int().positive().optional(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
  riskLevel: riskLevelEnum.optional(),
  riskReason: z.string().optional(),
});

export type CreateClauseInput = z.infer<typeof createClauseSchema>;

/**
 * Schema for updating a clause annotation
 */
export const updateClauseSchema = z.object({
  clauseType: clauseTypeEnum.optional(),
  title: z.string().nullable().optional(),
  content: z.string().min(1).optional(),
  riskLevel: riskLevelEnum.nullable().optional(),
  riskReason: z.string().nullable().optional(),
});

export type UpdateClauseInput = z.infer<typeof updateClauseSchema>;

/**
 * Clause detection result from Python microservice
 */
export interface ClauseDetectionResult {
  documentId: string;
  clauses: Array<{
    clauseType: ClauseType;
    title?: string;
    content: string;
    pageNumber?: number | null;
    startOffset?: number;
    endOffset?: number;
    confidence: number;
    riskLevel?: RiskLevel | null;
    riskReason?: string | null;
  }>;
  processingTimeMs: number;
}

/**
 * Clause statistics for a document
 */
export interface ClauseStats {
  documentId: string;
  totalClauses: number;
  riskFlaggedCount: number;
  verifiedCount: number;
  byType: Array<{ type: string; count: number }>;
  byRiskLevel: Array<{ level: string; count: number }>;
}

/**
 * Low confidence threshold for flagging clauses needing review
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.8;
