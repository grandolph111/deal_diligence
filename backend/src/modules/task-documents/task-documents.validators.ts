import { z } from 'zod';

/**
 * Schema for linking a document to a task
 */
export const linkDocumentSchema = z.object({
  documentId: z.string().uuid('Invalid document ID'),
});

/**
 * Schema for unlink document path params
 */
export const unlinkDocumentParamsSchema = z.object({
  documentId: z.string().uuid('Invalid document ID'),
});

export type LinkDocumentInput = z.infer<typeof linkDocumentSchema>;
