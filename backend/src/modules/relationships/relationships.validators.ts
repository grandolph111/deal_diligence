import { z } from 'zod';

export const relationshipTypeSchema = z.enum([
  'PARTY_TO',
  'REFERENCES',
  'EMPLOYS',
  'OWNS',
  'SUBSIDIARY_OF',
  'ACQUIRES',
  'CONTRACTS_WITH',
  'REPRESENTS',
  'SIGNATORY',
]);

export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

export const createRelationshipSchema = z.object({
  sourceEntityId: z.string().uuid(),
  targetEntityId: z.string().uuid(),
  relationshipType: relationshipTypeSchema,
  documentId: z.string().uuid().optional(),
  confidence: z.number().min(0).max(1).default(1.0),
  metadata: z.record(z.unknown()).optional(),
});

export type CreateRelationshipInput = z.infer<typeof createRelationshipSchema>;

export const updateRelationshipSchema = z.object({
  relationshipType: relationshipTypeSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateRelationshipInput = z.infer<typeof updateRelationshipSchema>;

export const listRelationshipsQuerySchema = z.object({
  relationshipType: relationshipTypeSchema.optional(),
  sourceEntityId: z.string().uuid().optional(),
  targetEntityId: z.string().uuid().optional(),
  documentId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ListRelationshipsQuery = z.infer<typeof listRelationshipsQuerySchema>;

export const syncRelationshipsSchema = z.object({
  documentId: z.string().uuid(),
  relationships: z.array(z.object({
    sourceEntityText: z.string(),
    sourceEntityType: z.string(),
    targetEntityText: z.string(),
    targetEntityType: z.string(),
    relationshipType: relationshipTypeSchema,
    confidence: z.number().min(0).max(1),
    pageNumber: z.number().int().positive().optional(),
    contextText: z.string().optional(),
  })),
});

export type SyncRelationshipsInput = z.infer<typeof syncRelationshipsSchema>;

export const extractRelationshipsSchema = z.object({
  documentId: z.string().uuid(),
});

export type ExtractRelationshipsInput = z.infer<typeof extractRelationshipsSchema>;
