import { z } from 'zod';

/**
 * Entity types that can be deduplicated
 */
export const deduplicatableEntityTypes = z.enum([
  'PERSON',
  'ORGANIZATION',
  'LOCATION',
  'JURISDICTION',
]);

export type DeduplicatableEntityType = z.infer<typeof deduplicatableEntityTypes>;

/**
 * Query parameters for listing master entities
 */
export const listMasterEntitiesQuerySchema = z.object({
  entityType: deduplicatableEntityTypes.optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListMasterEntitiesQuery = z.infer<typeof listMasterEntitiesQuerySchema>;

/**
 * Query parameters for finding potential duplicates
 */
export const findDuplicatesQuerySchema = z.object({
  threshold: z.coerce.number().min(0).max(1).default(0.8),
  entityType: deduplicatableEntityTypes.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type FindDuplicatesQuery = z.infer<typeof findDuplicatesQuerySchema>;

/**
 * Schema for merging entities
 */
export const mergeEntitiesSchema = z.object({
  sourceEntityIds: z.array(z.string().uuid()).min(1, 'At least one source entity is required'),
  targetEntityId: z.string().uuid(),
  // Optional: update the canonical name of the target
  canonicalName: z.string().optional(),
});

export type MergeEntitiesInput = z.infer<typeof mergeEntitiesSchema>;

/**
 * Schema for splitting an entity
 */
export const splitEntitySchema = z.object({
  // Document entity IDs to move to a new master entity
  documentEntityIds: z.array(z.string().uuid()).min(1, 'At least one document entity is required'),
  // The new canonical name for the split-off entity
  newCanonicalName: z.string().min(1, 'Canonical name is required'),
});

export type SplitEntityInput = z.infer<typeof splitEntitySchema>;

/**
 * Schema for creating a master entity manually
 */
export const createMasterEntitySchema = z.object({
  canonicalName: z.string().min(1, 'Canonical name is required'),
  entityType: deduplicatableEntityTypes,
  aliases: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

export type CreateMasterEntityInput = z.infer<typeof createMasterEntitySchema>;

/**
 * Schema for updating a master entity
 */
export const updateMasterEntitySchema = z.object({
  canonicalName: z.string().min(1).optional(),
  aliases: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
});

export type UpdateMasterEntityInput = z.infer<typeof updateMasterEntitySchema>;

/**
 * Similarity threshold for automatic matching
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.85;
export const MIN_SIMILARITY_FOR_SUGGESTION = 0.7;
