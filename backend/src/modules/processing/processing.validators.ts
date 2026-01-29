/**
 * Processing Pipeline Validators
 */

import { z } from 'zod';

/**
 * Entity from Python microservice (snake_case format)
 */
const callbackEntitySchema = z.object({
  text: z.string(),
  entity_type: z.string(),
  confidence: z.number().min(0).max(1),
  start_offset: z.number().int().nonnegative(),
  end_offset: z.number().int().nonnegative(),
  page_number: z.number().int().positive().nullable().optional(),
  normalized_value: z.string().nullable().optional(),
});

/**
 * Clause from Python microservice (snake_case format)
 */
const callbackClauseSchema = z.object({
  clause_type: z.string(),
  title: z.string().nullable().optional(),
  content: z.string(),
  page_number: z.number().int().positive().nullable().optional(),
  start_offset: z.number().int().nonnegative().nullable().optional(),
  end_offset: z.number().int().nonnegative().nullable().optional(),
  confidence: z.number().min(0).max(1),
  risk_level: z.string().nullable().optional(),
  risk_reason: z.string().nullable().optional(),
});

export const processingCallbackSchema = z.object({
  document_id: z.string().uuid(),
  berrydb_id: z.string().optional(),
  status: z.enum(['completed', 'failed']),
  document_type: z.string().optional(),
  risk_level: z.string().optional(),
  page_count: z.number().int().positive().optional(),
  error: z.string().optional(),
  // New fields for entities and clauses
  entities: z.array(callbackEntitySchema).optional(),
  clauses: z.array(callbackClauseSchema).optional(),
});

export const retryDocumentSchema = z.object({
  documentId: z.string().uuid(),
});

export type ProcessingCallbackInput = z.infer<typeof processingCallbackSchema>;
export type RetryDocumentInput = z.infer<typeof retryDocumentSchema>;
export type CallbackEntity = z.infer<typeof callbackEntitySchema>;
export type CallbackClause = z.infer<typeof callbackClauseSchema>;
