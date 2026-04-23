import { z } from 'zod';

/**
 * Document types that can be classified
 * Matches the documentType field in the Document model.
 *
 * Superset of:
 *  - manual-classification taxonomy (CONTRACT / FINANCIAL / LEGAL / ...)
 *  - Claude extraction taxonomy (SPA / APA / LOI / NDA / EMPLOYMENT / LEASE / GENERIC)
 * Any document the extractor produced must round-trip through this endpoint.
 */
export const documentTypeEnum = z.enum([
  // manual classification
  'CONTRACT',
  'FINANCIAL',
  'LEGAL',
  'CORPORATE',
  'TECHNICAL',
  'TAX',
  'HR',
  'IP',
  'COMMERCIAL',
  'OPERATIONAL',
  'OTHER',
  // extraction pipeline output
  'SPA',
  'APA',
  'LOI',
  'NDA',
  'EMPLOYMENT',
  'LEASE',
  'GENERIC',
]);

export type DocumentType = z.infer<typeof documentTypeEnum>;

/**
 * Risk levels for document classification
 */
export const riskLevelEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

export type RiskLevel = z.infer<typeof riskLevelEnum>;

/**
 * Schema for classifying a document manually
 */
export const classifyDocumentSchema = z.object({
  documentType: documentTypeEnum,
  riskLevel: riskLevelEnum.optional(),
});

export type ClassifyDocumentInput = z.infer<typeof classifyDocumentSchema>;

/**
 * Schema for syncing classification from Python microservice
 */
export const syncClassificationSchema = z.object({
  documentType: documentTypeEnum,
  documentTypeConfidence: z.number().min(0).max(1),
  riskLevel: riskLevelEnum.optional(),
  riskLevelConfidence: z.number().min(0).max(1).optional(),
  language: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
});

export type SyncClassificationInput = z.infer<typeof syncClassificationSchema>;

/**
 * Query parameters for listing documents by classification
 */
export const listByClassificationQuerySchema = z.object({
  documentType: documentTypeEnum.optional(),
  riskLevel: riskLevelEnum.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListByClassificationQuery = z.infer<typeof listByClassificationQuerySchema>;

/**
 * Classification statistics response
 */
export interface ClassificationStats {
  totalDocuments: number;
  classifiedDocuments: number;
  unclassifiedDocuments: number;
  byType: Record<string, number>;
  byRiskLevel: Record<string, number>;
}

/**
 * Classification result from Python microservice
 */
export interface ClassificationResult {
  documentId: string;
  documentType: DocumentType;
  documentTypeConfidence: number;
  riskLevel?: RiskLevel;
  riskLevelConfidence?: number;
  language?: string;
  currency?: string;
  region?: string;
}
