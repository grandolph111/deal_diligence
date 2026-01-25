import { z } from 'zod';

/**
 * Entity types that can be extracted from documents
 */
export const entityTypeEnum = z.enum([
  'PERSON',
  'ORGANIZATION',
  'DATE',
  'MONEY',
  'PERCENTAGE',
  'LOCATION',
  'CONTRACT_TERM',
  'CLAUSE_TYPE',
  'JURISDICTION',
]);

export type EntityType = z.infer<typeof entityTypeEnum>;

/**
 * Query parameters for listing entities
 */
export const listEntitiesQuerySchema = z.object({
  entityType: entityTypeEnum.optional(),
  needsReview: z.coerce.boolean().optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListEntitiesQuery = z.infer<typeof listEntitiesQuerySchema>;

/**
 * Query parameters for searching entities across a project
 */
export const searchEntitiesQuerySchema = z.object({
  query: z.string().min(1, 'Search query is required'),
  entityType: entityTypeEnum.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type SearchEntitiesQuery = z.infer<typeof searchEntitiesQuerySchema>;

/**
 * Schema for syncing entities from Python microservice
 */
export const syncEntitiesSchema = z.object({
  entities: z.array(
    z.object({
      text: z.string(),
      entityType: entityTypeEnum,
      confidence: z.number().min(0).max(1),
      startOffset: z.number().int().nonnegative(),
      endOffset: z.number().int().nonnegative(),
      pageNumber: z.number().int().positive().nullable().optional(),
      normalizedValue: z.string().nullable().optional(),
    })
  ),
});

export type SyncEntitiesInput = z.infer<typeof syncEntitiesSchema>;

/**
 * Schema for manually creating an entity
 */
export const createEntitySchema = z.object({
  text: z.string().min(1, 'Entity text is required'),
  entityType: entityTypeEnum,
  normalizedText: z.string().optional(),
  pageNumber: z.number().int().positive().optional(),
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  source: z.string().default('manual'),
});

export type CreateEntityInput = z.infer<typeof createEntitySchema>;

/**
 * Schema for updating an entity (e.g., after human review)
 */
export const updateEntitySchema = z.object({
  text: z.string().min(1).optional(),
  normalizedText: z.string().nullable().optional(),
  entityType: entityTypeEnum.optional(),
  needsReview: z.boolean().optional(),
});

export type UpdateEntityInput = z.infer<typeof updateEntitySchema>;

/**
 * Low confidence threshold for flagging entities needing review
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.8;
