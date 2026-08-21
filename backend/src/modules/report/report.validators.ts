import { z } from 'zod';

const SEVERITY = z.enum(['HIGH', 'MEDIUM', 'LOW']);

export const reportQuerySchema = z.object({
  /**
   * Default true: this is an *issues* report, so it shows the exceptions. The
   * full picture already has a home in the Data Room.
   */
  flaggedOnly: z
    .union([z.literal('true'), z.literal('false')])
    .optional()
    .transform((v) => v !== 'false'),
});

export const createEntrySchema = z.object({
  riskCategoryId: z.string().min(1),
  title: z.string().min(1).max(200),
  humanText: z.string().min(1),
  nextSteps: z.string().nullable().optional(),
  supplementalRequest: z.string().nullable().optional(),
  severity: SEVERITY.nullable().optional(),
});

export const updateEntrySchema = z
  .object({
    humanText: z.string().nullable().optional(),
    nextSteps: z.string().nullable().optional(),
    supplementalRequest: z.string().nullable().optional(),
    severity: SEVERITY.nullable().optional(),
    status: z.enum(['AI_DRAFT', 'IN_REVIEW', 'VERIFIED']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
