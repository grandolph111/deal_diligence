import { prisma } from '../../config/database';
import { config } from '../../config';
import { ApiError } from '../../utils/ApiError';
import {
  CreateEntityInput,
  ListEntitiesQuery,
  SearchEntitiesQuery,
  SyncEntitiesInput,
  UpdateEntityInput,
  LOW_CONFIDENCE_THRESHOLD,
} from './entities.validators';

/**
 * Response from Python microservice entity extraction
 */
interface PythonEntityResponse {
  document_id: string;
  entities: Array<{
    text: string;
    entity_type: string;
    confidence: number;
    start_offset: number;
    end_offset: number;
    page_number: number | null;
    normalized_value: string | null;
  }>;
  processing_time_ms: number;
}

export const entitiesService = {
  /**
   * Verify document belongs to project (IDOR protection)
   */
  async verifyDocumentInProject(documentId: string, projectId: string) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    return document;
  },

  /**
   * Get entities for a document
   */
  async getDocumentEntities(documentId: string, projectId: string, query: ListEntitiesQuery) {
    await this.verifyDocumentInProject(documentId, projectId);

    const { entityType, needsReview, minConfidence, page, limit } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: {
      documentId: string;
      entityType?: string;
      needsReview?: boolean;
      confidence?: { gte: number };
    } = {
      documentId,
    };

    if (entityType) {
      where.entityType = entityType;
    }
    if (needsReview !== undefined) {
      where.needsReview = needsReview;
    }
    if (minConfidence !== undefined) {
      where.confidence = { gte: minConfidence };
    }

    const [entities, total] = await Promise.all([
      prisma.documentEntity.findMany({
        where,
        include: {
          masterEntity: {
            select: {
              id: true,
              canonicalName: true,
              aliases: true,
            },
          },
        },
        orderBy: [{ pageNumber: 'asc' }, { startOffset: 'asc' }],
        skip,
        take: limit,
      }),
      prisma.documentEntity.count({ where }),
    ]);

    return {
      entities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get a single entity by ID
   */
  async getEntityById(entityId: string, documentId: string, projectId: string) {
    await this.verifyDocumentInProject(documentId, projectId);

    const entity = await prisma.documentEntity.findFirst({
      where: { id: entityId, documentId },
      include: {
        masterEntity: {
          select: {
            id: true,
            canonicalName: true,
            aliases: true,
            metadata: true,
          },
        },
        document: {
          select: {
            id: true,
            name: true,
            projectId: true,
          },
        },
      },
    });

    if (!entity) {
      throw ApiError.notFound('Entity not found');
    }

    return entity;
  },

  /**
   * Sync entities from Python microservice extraction
   * This is called after document processing to store extracted entities
   */
  async syncEntitiesFromPython(
    documentId: string,
    projectId: string,
    data: SyncEntitiesInput
  ) {
    await this.verifyDocumentInProject(documentId, projectId);

    // Delete existing entities for this document before syncing new ones
    await prisma.documentEntity.deleteMany({
      where: { documentId, source: 'berrydb' },
    });

    // Create new entities
    const entities = await prisma.documentEntity.createMany({
      data: data.entities.map((entity) => ({
        documentId,
        text: entity.text,
        entityType: entity.entityType,
        normalizedText: entity.normalizedValue,
        pageNumber: entity.pageNumber ?? null,
        startOffset: entity.startOffset,
        endOffset: entity.endOffset,
        confidence: entity.confidence,
        source: 'berrydb',
        needsReview: entity.confidence < LOW_CONFIDENCE_THRESHOLD,
      })),
    });

    return {
      synced: entities.count,
      documentId,
    };
  },

  /**
   * Call Python microservice to extract entities from a document
   */
  async extractEntitiesFromDocument(documentId: string, projectId: string) {
    const document = await this.verifyDocumentInProject(documentId, projectId);

    if (document.processingStatus !== 'COMPLETE') {
      throw ApiError.badRequest('Document processing is not complete');
    }

    // Check if Python service is configured
    if (!config.pythonService.url) {
      throw ApiError.internal('Python service is not configured');
    }

    try {
      const response = await fetch(`${config.pythonService.url}/analyze/entities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: documentId,
          berrydb_id: document.berryDbId,
          s3_key: document.s3Key,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Python service error: ${response.status} - ${errorText}`);
      }

      const result = (await response.json()) as PythonEntityResponse;

      // Transform Python response to our schema format
      const syncInput: SyncEntitiesInput = {
        entities: result.entities.map((entity) => ({
          text: entity.text,
          entityType: entity.entity_type.toUpperCase() as SyncEntitiesInput['entities'][0]['entityType'],
          confidence: entity.confidence,
          startOffset: entity.start_offset,
          endOffset: entity.end_offset,
          pageNumber: entity.page_number,
          normalizedValue: entity.normalized_value,
        })),
      };

      // Sync to database
      await this.syncEntitiesFromPython(documentId, projectId, syncInput);

      return {
        documentId,
        extractedCount: result.entities.length,
        processingTimeMs: result.processing_time_ms,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.internal(
        `Failed to extract entities: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * Manually create an entity for a document
   */
  async createEntity(documentId: string, projectId: string, data: CreateEntityInput) {
    await this.verifyDocumentInProject(documentId, projectId);

    const entity = await prisma.documentEntity.create({
      data: {
        documentId,
        text: data.text,
        entityType: data.entityType,
        normalizedText: data.normalizedText,
        pageNumber: data.pageNumber,
        startOffset: data.startOffset,
        endOffset: data.endOffset,
        confidence: data.confidence,
        source: data.source,
        needsReview: false, // Manual entries don't need review
      },
    });

    return entity;
  },

  /**
   * Update an entity (e.g., after human review)
   */
  async updateEntity(
    entityId: string,
    documentId: string,
    projectId: string,
    data: UpdateEntityInput
  ) {
    await this.verifyDocumentInProject(documentId, projectId);

    const entity = await prisma.documentEntity.findFirst({
      where: { id: entityId, documentId },
    });

    if (!entity) {
      throw ApiError.notFound('Entity not found');
    }

    const updated = await prisma.documentEntity.update({
      where: { id: entityId },
      data: {
        text: data.text,
        normalizedText: data.normalizedText,
        entityType: data.entityType,
        needsReview: data.needsReview,
      },
    });

    return updated;
  },

  /**
   * Delete an entity
   */
  async deleteEntity(entityId: string, documentId: string, projectId: string) {
    await this.verifyDocumentInProject(documentId, projectId);

    const entity = await prisma.documentEntity.findFirst({
      where: { id: entityId, documentId },
    });

    if (!entity) {
      throw ApiError.notFound('Entity not found');
    }

    await prisma.documentEntity.delete({
      where: { id: entityId },
    });
  },

  /**
   * Search entities across all documents in a project
   */
  async searchEntities(projectId: string, query: SearchEntitiesQuery) {
    const { query: searchQuery, entityType, page, limit } = query;
    const skip = (page - 1) * limit;

    // Build where clause - search in text and normalizedText
    const where: {
      document: { projectId: string };
      entityType?: string;
      OR: Array<{ text: { contains: string; mode: 'insensitive' } } | { normalizedText: { contains: string; mode: 'insensitive' } }>;
    } = {
      document: { projectId },
      OR: [
        { text: { contains: searchQuery, mode: 'insensitive' } },
        { normalizedText: { contains: searchQuery, mode: 'insensitive' } },
      ],
    };

    if (entityType) {
      where.entityType = entityType;
    }

    const [entities, total] = await Promise.all([
      prisma.documentEntity.findMany({
        where,
        include: {
          document: {
            select: {
              id: true,
              name: true,
              folderId: true,
            },
          },
          masterEntity: {
            select: {
              id: true,
              canonicalName: true,
            },
          },
        },
        orderBy: { confidence: 'desc' },
        skip,
        take: limit,
      }),
      prisma.documentEntity.count({ where }),
    ]);

    return {
      entities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get entity statistics for a document
   */
  async getEntityStats(documentId: string, projectId: string) {
    await this.verifyDocumentInProject(documentId, projectId);

    const stats = await prisma.documentEntity.groupBy({
      by: ['entityType'],
      where: { documentId },
      _count: { id: true },
    });

    const needsReviewCount = await prisma.documentEntity.count({
      where: { documentId, needsReview: true },
    });

    const totalCount = await prisma.documentEntity.count({
      where: { documentId },
    });

    return {
      documentId,
      totalEntities: totalCount,
      needsReview: needsReviewCount,
      byType: stats.map((s) => ({
        type: s.entityType,
        count: s._count.id,
      })),
    };
  },

  /**
   * Get entities needing review across a project
   */
  async getEntitiesNeedingReview(projectId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [entities, total] = await Promise.all([
      prisma.documentEntity.findMany({
        where: {
          document: { projectId },
          needsReview: true,
        },
        include: {
          document: {
            select: {
              id: true,
              name: true,
              folderId: true,
            },
          },
        },
        orderBy: [{ confidence: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      prisma.documentEntity.count({
        where: {
          document: { projectId },
          needsReview: true,
        },
      }),
    ]);

    return {
      entities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Flag an entity as low confidence / needs review
   */
  async flagEntityForReview(entityId: string, documentId: string, projectId: string) {
    await this.verifyDocumentInProject(documentId, projectId);

    const entity = await prisma.documentEntity.findFirst({
      where: { id: entityId, documentId },
    });

    if (!entity) {
      throw ApiError.notFound('Entity not found');
    }

    return prisma.documentEntity.update({
      where: { id: entityId },
      data: { needsReview: true },
    });
  },

  /**
   * Mark entity as reviewed (clear needsReview flag)
   */
  async markEntityReviewed(entityId: string, documentId: string, projectId: string) {
    await this.verifyDocumentInProject(documentId, projectId);

    const entity = await prisma.documentEntity.findFirst({
      where: { id: entityId, documentId },
    });

    if (!entity) {
      throw ApiError.notFound('Entity not found');
    }

    return prisma.documentEntity.update({
      where: { id: entityId },
      data: { needsReview: false },
    });
  },
};
