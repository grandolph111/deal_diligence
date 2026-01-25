/**
 * Processing Pipeline Validators
 */

import { z } from 'zod';

export const processingCallbackSchema = z.object({
  document_id: z.string().uuid(),
  berrydb_id: z.string().optional(),
  status: z.enum(['completed', 'failed']),
  document_type: z.string().optional(),
  risk_level: z.string().optional(),
  page_count: z.number().int().positive().optional(),
  error: z.string().optional(),
});

export const retryDocumentSchema = z.object({
  documentId: z.string().uuid(),
});

export type ProcessingCallbackInput = z.infer<typeof processingCallbackSchema>;
export type RetryDocumentInput = z.infer<typeof retryDocumentSchema>;
