import { z } from 'zod';

export const retryDocumentSchema = z.object({
  documentId: z.string().uuid(),
});

export type RetryDocumentInput = z.infer<typeof retryDocumentSchema>;
