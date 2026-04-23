import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { reconciliationService } from '../../services/reconciliation.service';
import { masterEntitiesService } from '../master-entities/master-entities.service';
import {
  CreateRelationshipInput,
  UpdateRelationshipInput,
  ListRelationshipsQuery,
  SyncRelationshipsInput,
} from './relationships.validators';

export const relationshipsService = {
  /**
   * List relationships for a project
   */
  async listRelationships(projectId: string, query: ListRelationshipsQuery) {
    const { relationshipType, sourceEntityId, targetEntityId, documentId, page, limit } = query;
    const skip = (page - 1) * limit;

    // Build where clause - relationships belong to entities in this project
    const where: {
      sourceEntity?: { projectId: string };
      targetEntity?: { projectId: string };
      relationshipType?: string;
      sourceEntityId?: string;
      targetEntityId?: string;
      documentId?: string | null;
    } = {};

    // At least one entity must belong to the project
    if (!sourceEntityId && !targetEntityId) {
      where.sourceEntity = { projectId };
    }

    if (relationshipType) {
      where.relationshipType = relationshipType;
    }

    if (sourceEntityId) {
      where.sourceEntityId = sourceEntityId;
    }

    if (targetEntityId) {
      where.targetEntityId = targetEntityId;
    }

    if (documentId) {
      where.documentId = documentId;
    }

    const [relationships, total] = await Promise.all([
      prisma.entityRelationship.findMany({
        where,
        include: {
          sourceEntity: {
            select: {
              id: true,
              canonicalName: true,
              entityType: true,
            },
          },
          targetEntity: {
            select: {
              id: true,
              canonicalName: true,
              entityType: true,
            },
          },
        },
        orderBy: [
          { relationshipType: 'asc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      prisma.entityRelationship.count({ where }),
    ]);

    return {
      relationships,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get a single relationship by ID
   */
  async getRelationshipById(relationshipId: string, projectId: string) {
    const relationship = await prisma.entityRelationship.findUnique({
      where: { id: relationshipId },
      include: {
        sourceEntity: {
          select: {
            id: true,
            canonicalName: true,
            entityType: true,
            projectId: true,
          },
        },
        targetEntity: {
          select: {
            id: true,
            canonicalName: true,
            entityType: true,
            projectId: true,
          },
        },
      },
    });

    if (!relationship) {
      throw ApiError.notFound('Relationship not found');
    }

    // Verify the relationship belongs to this project
    if (
      relationship.sourceEntity.projectId !== projectId &&
      relationship.targetEntity.projectId !== projectId
    ) {
      throw ApiError.notFound('Relationship not found');
    }

    return relationship;
  },

  /**
   * Get relationships for a specific master entity
   */
  async getEntityRelationships(entityId: string, projectId: string, page: number = 1, limit: number = 20) {
    // Verify entity belongs to project
    const entity = await prisma.masterEntity.findFirst({
      where: { id: entityId, projectId },
    });

    if (!entity) {
      throw ApiError.notFound('Entity not found');
    }

    const skip = (page - 1) * limit;

    // Get relationships where entity is source or target
    const [relationships, total] = await Promise.all([
      prisma.entityRelationship.findMany({
        where: {
          OR: [
            { sourceEntityId: entityId },
            { targetEntityId: entityId },
          ],
        },
        include: {
          sourceEntity: {
            select: {
              id: true,
              canonicalName: true,
              entityType: true,
            },
          },
          targetEntity: {
            select: {
              id: true,
              canonicalName: true,
              entityType: true,
            },
          },
        },
        orderBy: [
          { confidence: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      prisma.entityRelationship.count({
        where: {
          OR: [
            { sourceEntityId: entityId },
            { targetEntityId: entityId },
          ],
        },
      }),
    ]);

    return {
      entity: {
        id: entity.id,
        canonicalName: entity.canonicalName,
        entityType: entity.entityType,
      },
      relationships,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Create a relationship manually
   */
  async createRelationship(projectId: string, data: CreateRelationshipInput) {
    // Verify both entities exist and belong to project
    const [sourceEntity, targetEntity] = await Promise.all([
      prisma.masterEntity.findFirst({
        where: { id: data.sourceEntityId, projectId },
      }),
      prisma.masterEntity.findFirst({
        where: { id: data.targetEntityId, projectId },
      }),
    ]);

    if (!sourceEntity) {
      throw ApiError.notFound('Source entity not found');
    }

    if (!targetEntity) {
      throw ApiError.notFound('Target entity not found');
    }

    // Check if relationship already exists
    const existing = await prisma.entityRelationship.findUnique({
      where: {
        sourceEntityId_targetEntityId_relationshipType: {
          sourceEntityId: data.sourceEntityId,
          targetEntityId: data.targetEntityId,
          relationshipType: data.relationshipType,
        },
      },
    });

    if (existing) {
      throw ApiError.badRequest('Relationship already exists');
    }

    // If documentId provided, verify it belongs to project
    if (data.documentId) {
      const document = await prisma.document.findFirst({
        where: { id: data.documentId, projectId },
      });
      if (!document) {
        throw ApiError.notFound('Document not found');
      }
    }

    return prisma.entityRelationship.create({
      data: {
        sourceEntityId: data.sourceEntityId,
        targetEntityId: data.targetEntityId,
        relationshipType: data.relationshipType,
        documentId: data.documentId,
        confidence: data.confidence,
        metadata: (data.metadata || {}) as Prisma.InputJsonValue,
      },
      include: {
        sourceEntity: {
          select: {
            id: true,
            canonicalName: true,
            entityType: true,
          },
        },
        targetEntity: {
          select: {
            id: true,
            canonicalName: true,
            entityType: true,
          },
        },
      },
    });
  },

  /**
   * Update a relationship
   */
  async updateRelationship(relationshipId: string, projectId: string, data: UpdateRelationshipInput) {
    // First get the relationship to verify access
    await this.getRelationshipById(relationshipId, projectId);

    return prisma.entityRelationship.update({
      where: { id: relationshipId },
      data: {
        relationshipType: data.relationshipType,
        confidence: data.confidence,
        metadata: data.metadata as Prisma.InputJsonValue | undefined,
      },
      include: {
        sourceEntity: {
          select: {
            id: true,
            canonicalName: true,
            entityType: true,
          },
        },
        targetEntity: {
          select: {
            id: true,
            canonicalName: true,
            entityType: true,
          },
        },
      },
    });
  },

  /**
   * Delete a relationship
   */
  async deleteRelationship(relationshipId: string, projectId: string) {
    // Verify relationship exists and belongs to project
    await this.getRelationshipById(relationshipId, projectId);

    await prisma.entityRelationship.delete({
      where: { id: relationshipId },
    });
  },

  /**
   * Trigger a project-level relationship reconciliation. Individual-document
   * relationship extraction happens inside the first-pass Claude extraction;
   * cross-document reconciliation runs over all project fact sheets.
   */
  async extractRelationships(documentId: string, projectId: string) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });
    if (!document) throw ApiError.notFound('Document not found');
    await reconciliationService.rebuildProjectGraph(projectId);
    const count = await prisma.entityRelationship.count({
      where: {
        sourceEntity: { projectId },
      },
    });
    return {
      document_id: documentId,
      relationships: [] as unknown[],
      processing_time_ms: 0,
      reconciled: count,
    };
  },

  /**
   * Sync relationships from Python extraction results
   * Creates master entities if needed and stores relationships
   */
  async syncRelationships(projectId: string, data: SyncRelationshipsInput) {
    const { documentId, relationships } = data;

    // Verify document exists and belongs to project
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    const stats = {
      created: 0,
      updated: 0,
      skipped: 0,
      entitiesCreated: 0,
    };

    for (const rel of relationships) {
      try {
        // Find or create source entity
        const sourceResult = await masterEntitiesService.findOrCreateMasterEntity(
          projectId,
          rel.sourceEntityText,
          rel.sourceEntityType
        );
        if (sourceResult.isNew) {
          stats.entitiesCreated++;
        }

        // Find or create target entity
        const targetResult = await masterEntitiesService.findOrCreateMasterEntity(
          projectId,
          rel.targetEntityText,
          rel.targetEntityType
        );
        if (targetResult.isNew) {
          stats.entitiesCreated++;
        }

        if (!sourceResult.masterEntity || !targetResult.masterEntity) {
          stats.skipped++;
          continue;
        }

        // Check if relationship already exists
        const existing = await prisma.entityRelationship.findUnique({
          where: {
            sourceEntityId_targetEntityId_relationshipType: {
              sourceEntityId: sourceResult.masterEntity.id,
              targetEntityId: targetResult.masterEntity.id,
              relationshipType: rel.relationshipType,
            },
          },
        });

        if (existing) {
          // Update confidence if new one is higher
          if (rel.confidence > existing.confidence) {
            await prisma.entityRelationship.update({
              where: { id: existing.id },
              data: {
                confidence: rel.confidence,
                documentId,
                metadata: {
                  pageNumber: rel.pageNumber,
                  contextText: rel.contextText,
                },
              },
            });
            stats.updated++;
          } else {
            stats.skipped++;
          }
        } else {
          // Create new relationship
          await prisma.entityRelationship.create({
            data: {
              sourceEntityId: sourceResult.masterEntity.id,
              targetEntityId: targetResult.masterEntity.id,
              relationshipType: rel.relationshipType,
              documentId,
              confidence: rel.confidence,
              metadata: {
                pageNumber: rel.pageNumber,
                contextText: rel.contextText,
              },
            },
          });
          stats.created++;
        }
      } catch (error) {
        console.error('Error syncing relationship:', error);
        stats.skipped++;
      }
    }

    return stats;
  },

  /**
   * Get related documents for a document based on shared entities
   */
  async getRelatedDocuments(documentId: string, projectId: string, page: number = 1, limit: number = 10) {
    // Verify document exists and belongs to project
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    // Get all master entities mentioned in this document
    const documentEntities = await prisma.documentEntity.findMany({
      where: { documentId },
      select: { masterEntityId: true },
    });

    const masterEntityIds = documentEntities
      .map((de) => de.masterEntityId)
      .filter((id): id is string => id !== null);

    if (masterEntityIds.length === 0) {
      return {
        document: {
          id: document.id,
          name: document.name,
        },
        relatedDocuments: [],
        pagination: {
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      };
    }

    // Find other documents that mention the same entities
    const skip = (page - 1) * limit;

    const relatedDocEntities = await prisma.documentEntity.findMany({
      where: {
        masterEntityId: { in: masterEntityIds },
        documentId: { not: documentId },
        document: { projectId },
      },
      select: {
        documentId: true,
        masterEntityId: true,
        masterEntity: {
          select: {
            id: true,
            canonicalName: true,
            entityType: true,
          },
        },
        document: {
          select: {
            id: true,
            name: true,
            documentType: true,
            folderId: true,
            createdAt: true,
          },
        },
      },
    });

    // Group by document and count shared entities
    const documentSharedEntities = new Map<
      string,
      {
        document: {
          id: string;
          name: string;
          documentType: string | null;
          folderId: string | null;
          createdAt: Date;
        };
        sharedEntities: Array<{
          id: string;
          canonicalName: string;
          entityType: string;
        }>;
      }
    >();

    for (const de of relatedDocEntities) {
      if (!documentSharedEntities.has(de.documentId)) {
        documentSharedEntities.set(de.documentId, {
          document: de.document,
          sharedEntities: [],
        });
      }
      if (de.masterEntity) {
        const entry = documentSharedEntities.get(de.documentId)!;
        // Only add unique entities
        if (!entry.sharedEntities.some((e) => e.id === de.masterEntity!.id)) {
          entry.sharedEntities.push(de.masterEntity);
        }
      }
    }

    // Convert to array and sort by shared entity count
    const relatedDocs = Array.from(documentSharedEntities.values())
      .sort((a, b) => b.sharedEntities.length - a.sharedEntities.length);

    const total = relatedDocs.length;
    const paginatedDocs = relatedDocs.slice(skip, skip + limit);

    return {
      document: {
        id: document.id,
        name: document.name,
      },
      relatedDocuments: paginatedDocs.map((rd) => ({
        document: rd.document,
        sharedEntityCount: rd.sharedEntities.length,
        sharedEntities: rd.sharedEntities,
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
   * Get relationship statistics for a project
   */
  async getRelationshipStats(projectId: string) {
    // Get all relationships for entities in this project
    const relationships = await prisma.entityRelationship.findMany({
      where: {
        sourceEntity: { projectId },
      },
      select: {
        relationshipType: true,
      },
    });

    // Count by type
    const byType: Record<string, number> = {};
    for (const rel of relationships) {
      byType[rel.relationshipType] = (byType[rel.relationshipType] || 0) + 1;
    }

    // Get total entities in project
    const totalEntities = await prisma.masterEntity.count({
      where: { projectId },
    });

    // Get entities with relationships
    const entitiesWithRelationships = await prisma.masterEntity.count({
      where: {
        projectId,
        OR: [
          { relatedEntities: { some: {} } },
          { relatedFrom: { some: {} } },
        ],
      },
    });

    return {
      totalRelationships: relationships.length,
      byType,
      totalEntities,
      entitiesWithRelationships,
      entitiesWithoutRelationships: totalEntities - entitiesWithRelationships,
    };
  },
};
