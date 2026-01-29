import { prisma } from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  ListMasterEntitiesQuery,
  FindDuplicatesQuery,
  MergeEntitiesInput,
  SplitEntityInput,
  CreateMasterEntityInput,
  UpdateMasterEntityInput,
  DEFAULT_SIMILARITY_THRESHOLD,
  MIN_SIMILARITY_FOR_SUGGESTION,
} from './master-entities.validators';

/**
 * Calculate similarity between two strings using Levenshtein distance
 * Returns a value between 0 and 1, where 1 is an exact match
 */
function levenshteinSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.length === 0) return 0;
  if (s2.length === 0) return 0;

  const len1 = s1.length;
  const len2 = s2.length;

  // Create distance matrix
  const matrix: number[][] = [];
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill in the matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - distance / maxLen;
}

/**
 * Normalize entity text for better matching
 * - Removes common prefixes/suffixes
 * - Normalizes whitespace and punctuation
 * - Handles common abbreviations
 */
function normalizeEntityText(text: string): string {
  let normalized = text
    .toLowerCase()
    .trim()
    // Remove common legal suffixes
    .replace(/\s*(inc\.?|llc\.?|ltd\.?|corp\.?|plc\.?|co\.?|limited|incorporated|corporation)\.?\s*$/i, '')
    // Remove common prefixes
    .replace(/^(the|a|an)\s+/i, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove punctuation except periods in abbreviations
    .replace(/[,'"()]/g, '')
    // Normalize ampersands
    .replace(/\s*&\s*/g, ' and ');

  return normalized.trim();
}

/**
 * Calculate similarity with normalization
 */
function calculateSimilarity(text1: string, text2: string): number {
  const norm1 = normalizeEntityText(text1);
  const norm2 = normalizeEntityText(text2);
  return levenshteinSimilarity(norm1, norm2);
}

/**
 * Check if one string is contained within another (for alias detection)
 */
function isSubstringMatch(shorter: string, longer: string): boolean {
  const normShorter = normalizeEntityText(shorter);
  const normLonger = normalizeEntityText(longer);
  return normLonger.includes(normShorter) || normShorter.includes(normLonger);
}

export const masterEntitiesService = {
  /**
   * Get all master entities in a project
   */
  async listMasterEntities(projectId: string, query: ListMasterEntitiesQuery) {
    const { entityType, search, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: {
      projectId: string;
      entityType?: string;
      OR?: Array<{
        canonicalName?: { contains: string; mode: 'insensitive' };
      }>;
    } = {
      projectId,
    };

    if (entityType) {
      where.entityType = entityType;
    }

    if (search) {
      where.OR = [{ canonicalName: { contains: search, mode: 'insensitive' } }];
    }

    const [entities, total] = await Promise.all([
      prisma.masterEntity.findMany({
        where,
        include: {
          _count: {
            select: { documentEntities: true },
          },
        },
        orderBy: [{ entityType: 'asc' }, { canonicalName: 'asc' }],
        skip,
        take: limit,
      }),
      prisma.masterEntity.count({ where }),
    ]);

    return {
      entities: entities.map((e) => ({
        ...e,
        documentCount: e._count.documentEntities,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get a single master entity by ID
   */
  async getMasterEntityById(entityId: string, projectId: string) {
    const entity = await prisma.masterEntity.findFirst({
      where: { id: entityId, projectId },
      include: {
        documentEntities: {
          include: {
            document: {
              select: {
                id: true,
                name: true,
                folderId: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
        relatedEntities: {
          include: {
            targetEntity: {
              select: {
                id: true,
                canonicalName: true,
                entityType: true,
              },
            },
          },
        },
        relatedFrom: {
          include: {
            sourceEntity: {
              select: {
                id: true,
                canonicalName: true,
                entityType: true,
              },
            },
          },
        },
        _count: {
          select: { documentEntities: true },
        },
      },
    });

    if (!entity) {
      throw ApiError.notFound('Master entity not found');
    }

    return {
      ...entity,
      documentCount: entity._count.documentEntities,
    };
  },

  /**
   * Create a master entity manually
   */
  async createMasterEntity(projectId: string, data: CreateMasterEntityInput) {
    // Check for existing entity with same name
    const existing = await prisma.masterEntity.findUnique({
      where: {
        projectId_entityType_canonicalName: {
          projectId,
          entityType: data.entityType,
          canonicalName: data.canonicalName,
        },
      },
    });

    if (existing) {
      throw ApiError.badRequest(
        `Master entity "${data.canonicalName}" already exists for type ${data.entityType}`
      );
    }

    return prisma.masterEntity.create({
      data: {
        projectId,
        canonicalName: data.canonicalName,
        entityType: data.entityType,
        aliases: data.aliases || [],
        metadata: data.metadata || {},
      },
    });
  },

  /**
   * Update a master entity
   */
  async updateMasterEntity(entityId: string, projectId: string, data: UpdateMasterEntityInput) {
    const entity = await prisma.masterEntity.findFirst({
      where: { id: entityId, projectId },
    });

    if (!entity) {
      throw ApiError.notFound('Master entity not found');
    }

    // If changing canonical name, check for conflicts
    if (data.canonicalName && data.canonicalName !== entity.canonicalName) {
      const existing = await prisma.masterEntity.findUnique({
        where: {
          projectId_entityType_canonicalName: {
            projectId,
            entityType: entity.entityType,
            canonicalName: data.canonicalName,
          },
        },
      });

      if (existing) {
        throw ApiError.badRequest(
          `Master entity "${data.canonicalName}" already exists for type ${entity.entityType}`
        );
      }
    }

    return prisma.masterEntity.update({
      where: { id: entityId },
      data: {
        canonicalName: data.canonicalName,
        aliases: data.aliases,
        metadata: data.metadata,
      },
    });
  },

  /**
   * Delete a master entity (unlinks document entities, doesn't delete them)
   */
  async deleteMasterEntity(entityId: string, projectId: string) {
    const entity = await prisma.masterEntity.findFirst({
      where: { id: entityId, projectId },
    });

    if (!entity) {
      throw ApiError.notFound('Master entity not found');
    }

    // Unlink all document entities
    await prisma.documentEntity.updateMany({
      where: { masterEntityId: entityId },
      data: { masterEntityId: null },
    });

    // Delete the master entity
    await prisma.masterEntity.delete({
      where: { id: entityId },
    });
  },

  /**
   * Find or create a master entity for a document entity
   * This is the core deduplication algorithm
   */
  async findOrCreateMasterEntity(
    projectId: string,
    text: string,
    entityType: string,
    threshold: number = DEFAULT_SIMILARITY_THRESHOLD
  ) {
    const normalizedText = normalizeEntityText(text);

    // First, look for exact match on canonical name
    const exactMatch = await prisma.masterEntity.findFirst({
      where: {
        projectId,
        entityType,
        canonicalName: { equals: normalizedText, mode: 'insensitive' },
      },
    });

    if (exactMatch) {
      return { masterEntity: exactMatch, isNew: false, similarity: 1.0 };
    }

    // Search for fuzzy matches
    const candidates = await prisma.masterEntity.findMany({
      where: { projectId, entityType },
      select: {
        id: true,
        canonicalName: true,
        aliases: true,
      },
    });

    let bestMatch: { id: string; similarity: number } | null = null;

    for (const candidate of candidates) {
      // Check against canonical name
      const similarity = calculateSimilarity(text, candidate.canonicalName);
      if (similarity >= threshold) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = { id: candidate.id, similarity };
        }
      }

      // Check against aliases
      const aliases = (candidate.aliases as string[]) || [];
      for (const alias of aliases) {
        const aliasSimilarity = calculateSimilarity(text, alias);
        if (aliasSimilarity >= threshold) {
          if (!bestMatch || aliasSimilarity > bestMatch.similarity) {
            bestMatch = { id: candidate.id, similarity: aliasSimilarity };
          }
        }
      }
    }

    if (bestMatch) {
      const matchedEntity = await prisma.masterEntity.findUnique({
        where: { id: bestMatch.id },
      });

      // Add as alias if it's a good match but not exact
      if (matchedEntity && bestMatch.similarity < 1.0) {
        const aliases = (matchedEntity.aliases as string[]) || [];
        if (!aliases.some((a) => calculateSimilarity(a, text) > 0.95)) {
          await prisma.masterEntity.update({
            where: { id: matchedEntity.id },
            data: {
              aliases: [...aliases, text],
            },
          });
        }
      }

      return {
        masterEntity: matchedEntity,
        isNew: false,
        similarity: bestMatch.similarity,
      };
    }

    // No match found, create new master entity
    const newEntity = await prisma.masterEntity.create({
      data: {
        projectId,
        canonicalName: text,
        entityType,
        aliases: [],
        metadata: {},
      },
    });

    return { masterEntity: newEntity, isNew: true, similarity: 1.0 };
  },

  /**
   * Run deduplication on all unlinked document entities in a project
   */
  async runDeduplication(
    projectId: string,
    entityType?: string,
    threshold: number = DEFAULT_SIMILARITY_THRESHOLD
  ) {
    // Find all document entities without a master entity link
    const where: {
      document: { projectId: string };
      masterEntityId: null;
      entityType?: string;
    } = {
      document: { projectId },
      masterEntityId: null,
    };

    if (entityType) {
      where.entityType = entityType;
    }

    const unlinkedEntities = await prisma.documentEntity.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });

    const stats = {
      processed: 0,
      newMasterEntities: 0,
      linkedToExisting: 0,
      skipped: 0,
    };

    // Batch the updates
    const updates: { id: string; masterEntityId: string }[] = [];

    for (const docEntity of unlinkedEntities) {
      // Only deduplicate certain entity types
      if (!['PERSON', 'ORGANIZATION', 'LOCATION', 'JURISDICTION'].includes(docEntity.entityType)) {
        stats.skipped++;
        continue;
      }

      const result = await this.findOrCreateMasterEntity(
        projectId,
        docEntity.text,
        docEntity.entityType,
        threshold
      );

      if (result.masterEntity) {
        updates.push({
          id: docEntity.id,
          masterEntityId: result.masterEntity.id,
        });

        if (result.isNew) {
          stats.newMasterEntities++;
        } else {
          stats.linkedToExisting++;
        }
      }

      stats.processed++;
    }

    // Apply all updates in a transaction
    if (updates.length > 0) {
      await prisma.$transaction(
        updates.map((update) =>
          prisma.documentEntity.update({
            where: { id: update.id },
            data: { masterEntityId: update.masterEntityId },
          })
        )
      );
    }

    return stats;
  },

  /**
   * Find potential duplicate master entities
   */
  async findPotentialDuplicates(projectId: string, query: FindDuplicatesQuery) {
    const { threshold, entityType, page, limit } = query;
    const skip = (page - 1) * limit;

    const where: { projectId: string; entityType?: string } = { projectId };
    if (entityType) {
      where.entityType = entityType;
    }

    const entities = await prisma.masterEntity.findMany({
      where,
      include: {
        _count: {
          select: { documentEntities: true },
        },
      },
      orderBy: { canonicalName: 'asc' },
    });

    // Find pairs that are similar
    const duplicatePairs: Array<{
      entity1: { id: string; canonicalName: string; entityType: string };
      entity2: { id: string; canonicalName: string; entityType: string };
      similarity: number;
    }> = [];

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const e1 = entities[i];
        const e2 = entities[j];

        // Only compare same entity types
        if (e1.entityType !== e2.entityType) continue;

        const similarity = calculateSimilarity(e1.canonicalName, e2.canonicalName);
        if (similarity >= (threshold || MIN_SIMILARITY_FOR_SUGGESTION)) {
          duplicatePairs.push({
            entity1: {
              id: e1.id,
              canonicalName: e1.canonicalName,
              entityType: e1.entityType,
            },
            entity2: {
              id: e2.id,
              canonicalName: e2.canonicalName,
              entityType: e2.entityType,
            },
            similarity,
          });
        }
      }
    }

    // Sort by similarity (highest first)
    duplicatePairs.sort((a, b) => b.similarity - a.similarity);

    // Apply pagination
    const paginatedPairs = duplicatePairs.slice(skip, skip + limit);

    return {
      duplicates: paginatedPairs,
      pagination: {
        page,
        limit,
        total: duplicatePairs.length,
        totalPages: Math.ceil(duplicatePairs.length / limit),
      },
    };
  },

  /**
   * Merge multiple master entities into one
   * - Target entity becomes the canonical entity
   * - Source entities are deleted
   * - All document entities are linked to target
   */
  async mergeEntities(projectId: string, data: MergeEntitiesInput) {
    const { sourceEntityIds, targetEntityId, canonicalName } = data;

    // Verify target exists and belongs to project
    const targetEntity = await prisma.masterEntity.findFirst({
      where: { id: targetEntityId, projectId },
    });

    if (!targetEntity) {
      throw ApiError.notFound('Target entity not found');
    }

    // Verify all source entities exist and are same type
    const sourceEntities = await prisma.masterEntity.findMany({
      where: {
        id: { in: sourceEntityIds },
        projectId,
      },
    });

    if (sourceEntities.length !== sourceEntityIds.length) {
      throw ApiError.notFound('One or more source entities not found');
    }

    // Check all entities are the same type
    const invalidTypes = sourceEntities.filter((e) => e.entityType !== targetEntity.entityType);
    if (invalidTypes.length > 0) {
      throw ApiError.badRequest('All entities must be of the same type to merge');
    }

    // Collect all aliases from source entities
    const allAliases = new Set<string>(
      (targetEntity.aliases as string[]) || []
    );

    for (const source of sourceEntities) {
      // Add the source canonical name as an alias
      allAliases.add(source.canonicalName);
      // Add all source aliases
      const sourceAliases = (source.aliases as string[]) || [];
      for (const alias of sourceAliases) {
        allAliases.add(alias);
      }
    }

    // Remove the target canonical name from aliases (it's not an alias, it's the main name)
    const finalCanonicalName = canonicalName || targetEntity.canonicalName;
    allAliases.delete(finalCanonicalName);

    await prisma.$transaction(async (tx) => {
      // Update all document entities to point to target
      await tx.documentEntity.updateMany({
        where: {
          masterEntityId: { in: sourceEntityIds },
        },
        data: {
          masterEntityId: targetEntityId,
        },
      });

      // Update target entity with merged aliases and optional new canonical name
      await tx.masterEntity.update({
        where: { id: targetEntityId },
        data: {
          canonicalName: finalCanonicalName,
          aliases: Array.from(allAliases),
        },
      });

      // Delete source entities
      await tx.masterEntity.deleteMany({
        where: { id: { in: sourceEntityIds } },
      });
    });

    // Return the updated target entity
    return this.getMasterEntityById(targetEntityId, projectId);
  },

  /**
   * Split document entities from a master entity into a new master entity
   */
  async splitEntity(entityId: string, projectId: string, data: SplitEntityInput) {
    const { documentEntityIds, newCanonicalName } = data;

    // Verify master entity exists
    const sourceEntity = await prisma.masterEntity.findFirst({
      where: { id: entityId, projectId },
    });

    if (!sourceEntity) {
      throw ApiError.notFound('Master entity not found');
    }

    // Verify all document entities belong to this master entity
    const docEntities = await prisma.documentEntity.findMany({
      where: {
        id: { in: documentEntityIds },
        masterEntityId: entityId,
      },
    });

    if (docEntities.length !== documentEntityIds.length) {
      throw ApiError.badRequest(
        'One or more document entities not found or not linked to this master entity'
      );
    }

    // Check if new canonical name conflicts with existing
    const existing = await prisma.masterEntity.findUnique({
      where: {
        projectId_entityType_canonicalName: {
          projectId,
          entityType: sourceEntity.entityType,
          canonicalName: newCanonicalName,
        },
      },
    });

    if (existing) {
      throw ApiError.badRequest(
        `Master entity "${newCanonicalName}" already exists. Use merge instead.`
      );
    }

    let newEntity: Awaited<ReturnType<typeof prisma.masterEntity.create>>;

    await prisma.$transaction(async (tx) => {
      // Create new master entity
      newEntity = await tx.masterEntity.create({
        data: {
          projectId,
          canonicalName: newCanonicalName,
          entityType: sourceEntity.entityType,
          aliases: [],
          metadata: {},
        },
      });

      // Update document entities to point to new entity
      await tx.documentEntity.updateMany({
        where: {
          id: { in: documentEntityIds },
        },
        data: {
          masterEntityId: newEntity.id,
        },
      });
    });

    return this.getMasterEntityById(newEntity!.id, projectId);
  },

  /**
   * Get documents associated with a master entity
   */
  async getMasterEntityDocuments(entityId: string, projectId: string, page: number = 1, limit: number = 20) {
    const entity = await prisma.masterEntity.findFirst({
      where: { id: entityId, projectId },
    });

    if (!entity) {
      throw ApiError.notFound('Master entity not found');
    }

    const skip = (page - 1) * limit;

    const [docEntities, total] = await Promise.all([
      prisma.documentEntity.findMany({
        where: { masterEntityId: entityId },
        include: {
          document: {
            select: {
              id: true,
              name: true,
              folderId: true,
              documentType: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.documentEntity.count({
        where: { masterEntityId: entityId },
      }),
    ]);

    // Group by document
    const documentMap = new Map<
      string,
      {
        document: {
          id: string;
          name: string;
          folderId: string | null;
          documentType: string | null;
          createdAt: Date;
        };
        mentions: Array<{
          id: string;
          text: string;
          pageNumber: number | null;
          confidence: number;
        }>;
      }
    >();

    for (const de of docEntities) {
      if (!documentMap.has(de.documentId)) {
        documentMap.set(de.documentId, {
          document: de.document,
          mentions: [],
        });
      }
      documentMap.get(de.documentId)!.mentions.push({
        id: de.id,
        text: de.text,
        pageNumber: de.pageNumber,
        confidence: de.confidence,
      });
    }

    return {
      entity: {
        id: entity.id,
        canonicalName: entity.canonicalName,
        entityType: entity.entityType,
      },
      documents: Array.from(documentMap.values()),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },
};
