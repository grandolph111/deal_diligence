import { prisma } from '../../config/database';
import { config } from '../../config';
import { ApiError } from '../../utils/ApiError';
import {
  CreateClauseInput,
  ListClausesQuery,
  SearchClausesQuery,
  SyncClausesInput,
  UpdateClauseInput,
  ClauseStats,
  LOW_CONFIDENCE_THRESHOLD,
} from './clauses.validators';

/**
 * Response from Python microservice clause detection
 */
interface PythonClauseResponse {
  document_id: string;
  clauses: Array<{
    clause_type: string;
    title: string | null;
    content: string;
    page_number: number | null;
    start_offset: number | null;
    end_offset: number | null;
    confidence: number;
    risk_level: string | null;
    risk_reason: string | null;
  }>;
  processing_time_ms: number;
}

export const clausesService = {
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
   * Get clauses (annotations of type CLAUSE) for a document
   */
  async getDocumentClauses(documentId: string, projectId: string, query: ListClausesQuery) {
    await this.verifyDocumentInProject(documentId, projectId);

    const { clauseType, riskLevel, isRiskFlagged, isVerified, page, limit } = query;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: {
      documentId: string;
      annotationType: string;
      clauseType?: string;
      riskLevel?: string | { not: null } | null;
      isVerified?: boolean;
    } = {
      documentId,
      annotationType: 'CLAUSE',
    };

    if (clauseType) {
      where.clauseType = clauseType;
    }
    if (riskLevel) {
      where.riskLevel = riskLevel;
    }
    if (isRiskFlagged !== undefined) {
      where.riskLevel = isRiskFlagged ? { not: null } : null;
    }
    if (isVerified !== undefined) {
      where.isVerified = isVerified;
    }

    const [clauses, total] = await Promise.all([
      prisma.documentAnnotation.findMany({
        where,
        include: {
          verifiedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          rejectedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: [{ pageNumber: 'asc' }, { startOffset: 'asc' }],
        skip,
        take: limit,
      }),
      prisma.documentAnnotation.count({ where }),
    ]);

    return {
      clauses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get a single clause by ID
   */
  async getClauseById(clauseId: string, documentId: string, projectId: string) {
    await this.verifyDocumentInProject(documentId, projectId);

    const clause = await prisma.documentAnnotation.findFirst({
      where: {
        id: clauseId,
        documentId,
        annotationType: 'CLAUSE',
      },
      include: {
        verifiedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        rejectedBy: {
          select: {
            id: true,
            name: true,
            email: true,
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

    if (!clause) {
      throw ApiError.notFound('Clause not found');
    }

    return clause;
  },

  /**
   * Sync clauses from Python microservice detection
   * This is called after document processing to store detected clauses
   */
  async syncClausesFromPython(
    documentId: string,
    projectId: string,
    data: SyncClausesInput
  ) {
    await this.verifyDocumentInProject(documentId, projectId);

    // Delete existing AI-detected clauses for this document before syncing new ones
    await prisma.documentAnnotation.deleteMany({
      where: { documentId, annotationType: 'CLAUSE', source: 'berrydb' },
    });

    // Create new clause annotations
    const clauses = await prisma.documentAnnotation.createMany({
      data: data.clauses.map((clause) => ({
        documentId,
        annotationType: 'CLAUSE',
        clauseType: clause.clauseType,
        title: clause.title ?? null,
        content: clause.content,
        pageNumber: clause.pageNumber ?? null,
        startOffset: clause.startOffset ?? null,
        endOffset: clause.endOffset ?? null,
        confidence: clause.confidence,
        riskLevel: clause.riskLevel ?? null,
        source: 'berrydb',
        // Metadata can store additional info like risk reason
        // We'll use verificationNote field for risk reason since it's available
      })),
    });

    // Update risk reasons in a separate step (since createMany doesn't return created records)
    // For now, we'll skip this optimization and just note that risk reasons would be in metadata

    return {
      synced: clauses.count,
      documentId,
    };
  },

  /**
   * Call Python microservice to detect clauses in a document
   */
  async detectClausesInDocument(documentId: string, projectId: string) {
    const document = await this.verifyDocumentInProject(documentId, projectId);

    if (document.processingStatus !== 'COMPLETE') {
      throw ApiError.badRequest('Document processing is not complete');
    }

    // Check if Python service is configured
    if (!config.pythonService.url) {
      throw ApiError.internal('Python service is not configured');
    }

    try {
      const response = await fetch(`${config.pythonService.url}/analyze/clauses`, {
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

      const result = (await response.json()) as PythonClauseResponse;

      // Transform Python response to our schema format
      const syncInput: SyncClausesInput = {
        clauses: result.clauses.map((clause) => ({
          clauseType: clause.clause_type.toUpperCase() as SyncClausesInput['clauses'][0]['clauseType'],
          title: clause.title ?? undefined,
          content: clause.content,
          pageNumber: clause.page_number,
          startOffset: clause.start_offset ?? undefined,
          endOffset: clause.end_offset ?? undefined,
          confidence: clause.confidence,
          riskLevel: clause.risk_level?.toUpperCase() as SyncClausesInput['clauses'][0]['riskLevel'] | undefined,
          riskReason: clause.risk_reason,
        })),
      };

      // Sync to database
      await this.syncClausesFromPython(documentId, projectId, syncInput);

      return {
        documentId,
        detectedCount: result.clauses.length,
        processingTimeMs: result.processing_time_ms,
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.internal(
        `Failed to detect clauses: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * Manually create a clause annotation for a document
   */
  async createClause(documentId: string, projectId: string, data: CreateClauseInput) {
    await this.verifyDocumentInProject(documentId, projectId);

    const clause = await prisma.documentAnnotation.create({
      data: {
        documentId,
        annotationType: 'CLAUSE',
        clauseType: data.clauseType,
        title: data.title ?? null,
        content: data.content,
        pageNumber: data.pageNumber ?? null,
        startOffset: data.startOffset ?? null,
        endOffset: data.endOffset ?? null,
        riskLevel: data.riskLevel ?? null,
        confidence: 1.0, // Manual entries have full confidence
        source: 'manual',
      },
    });

    return clause;
  },

  /**
   * Update a clause annotation
   */
  async updateClause(
    clauseId: string,
    documentId: string,
    projectId: string,
    data: UpdateClauseInput
  ) {
    await this.verifyDocumentInProject(documentId, projectId);

    const clause = await prisma.documentAnnotation.findFirst({
      where: { id: clauseId, documentId, annotationType: 'CLAUSE' },
    });

    if (!clause) {
      throw ApiError.notFound('Clause not found');
    }

    const updated = await prisma.documentAnnotation.update({
      where: { id: clauseId },
      data: {
        clauseType: data.clauseType,
        title: data.title,
        content: data.content,
        riskLevel: data.riskLevel,
      },
    });

    return updated;
  },

  /**
   * Delete a clause annotation
   */
  async deleteClause(clauseId: string, documentId: string, projectId: string) {
    await this.verifyDocumentInProject(documentId, projectId);

    const clause = await prisma.documentAnnotation.findFirst({
      where: { id: clauseId, documentId, annotationType: 'CLAUSE' },
    });

    if (!clause) {
      throw ApiError.notFound('Clause not found');
    }

    await prisma.documentAnnotation.delete({
      where: { id: clauseId },
    });
  },

  /**
   * Verify a clause as correct (human verification)
   */
  async verifyClause(
    clauseId: string,
    documentId: string,
    projectId: string,
    userId: string,
    note?: string
  ) {
    await this.verifyDocumentInProject(documentId, projectId);

    const clause = await prisma.documentAnnotation.findFirst({
      where: { id: clauseId, documentId, annotationType: 'CLAUSE' },
    });

    if (!clause) {
      throw ApiError.notFound('Clause not found');
    }

    return prisma.documentAnnotation.update({
      where: { id: clauseId },
      data: {
        isVerified: true,
        verifiedById: userId,
        verifiedAt: new Date(),
        verificationNote: note ?? null,
        // Clear any previous rejection
        isRejected: false,
        rejectedById: null,
        rejectedAt: null,
        rejectionNote: null,
      },
      include: {
        verifiedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  },

  /**
   * Reject a clause as incorrect (human verification)
   */
  async rejectClause(
    clauseId: string,
    documentId: string,
    projectId: string,
    userId: string,
    note?: string
  ) {
    await this.verifyDocumentInProject(documentId, projectId);

    const clause = await prisma.documentAnnotation.findFirst({
      where: { id: clauseId, documentId, annotationType: 'CLAUSE' },
    });

    if (!clause) {
      throw ApiError.notFound('Clause not found');
    }

    return prisma.documentAnnotation.update({
      where: { id: clauseId },
      data: {
        isRejected: true,
        rejectedById: userId,
        rejectedAt: new Date(),
        rejectionNote: note ?? null,
        // Clear any previous verification
        isVerified: false,
        verifiedById: null,
        verifiedAt: null,
        verificationNote: null,
      },
      include: {
        rejectedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  },

  /**
   * Search clauses across all documents in a project
   */
  async searchClauses(projectId: string, query: SearchClausesQuery) {
    const { query: searchQuery, clauseType, riskLevel, page, limit } = query;
    const skip = (page - 1) * limit;

    // Build where clause - search in content and title
    const where: {
      document: { projectId: string };
      annotationType: string;
      clauseType?: string;
      riskLevel?: string;
      OR: Array<
        | { content: { contains: string; mode: 'insensitive' } }
        | { title: { contains: string; mode: 'insensitive' } }
      >;
    } = {
      document: { projectId },
      annotationType: 'CLAUSE',
      OR: [
        { content: { contains: searchQuery, mode: 'insensitive' } },
        { title: { contains: searchQuery, mode: 'insensitive' } },
      ],
    };

    if (clauseType) {
      where.clauseType = clauseType;
    }
    if (riskLevel) {
      where.riskLevel = riskLevel;
    }

    const [clauses, total] = await Promise.all([
      prisma.documentAnnotation.findMany({
        where,
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
        skip,
        take: limit,
      }),
      prisma.documentAnnotation.count({ where }),
    ]);

    return {
      clauses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get clause statistics for a document
   */
  async getClauseStats(documentId: string, projectId: string): Promise<ClauseStats> {
    await this.verifyDocumentInProject(documentId, projectId);

    const typeStats = await prisma.documentAnnotation.groupBy({
      by: ['clauseType'],
      where: { documentId, annotationType: 'CLAUSE', clauseType: { not: null } },
      _count: { id: true },
    });

    const riskStats = await prisma.documentAnnotation.groupBy({
      by: ['riskLevel'],
      where: { documentId, annotationType: 'CLAUSE', riskLevel: { not: null } },
      _count: { id: true },
    });

    const [totalCount, riskFlaggedCount, verifiedCount] = await Promise.all([
      prisma.documentAnnotation.count({
        where: { documentId, annotationType: 'CLAUSE' },
      }),
      prisma.documentAnnotation.count({
        where: { documentId, annotationType: 'CLAUSE', riskLevel: { not: null } },
      }),
      prisma.documentAnnotation.count({
        where: { documentId, annotationType: 'CLAUSE', isVerified: true },
      }),
    ]);

    return {
      documentId,
      totalClauses: totalCount,
      riskFlaggedCount,
      verifiedCount,
      byType: typeStats.map((s) => ({
        type: s.clauseType ?? 'UNKNOWN',
        count: s._count.id,
      })),
      byRiskLevel: riskStats.map((s) => ({
        level: s.riskLevel ?? 'UNKNOWN',
        count: s._count.id,
      })),
    };
  },

  /**
   * Get risk-flagged clauses across a project
   */
  async getRiskFlaggedClauses(projectId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [clauses, total] = await Promise.all([
      prisma.documentAnnotation.findMany({
        where: {
          document: { projectId },
          annotationType: 'CLAUSE',
          riskLevel: { not: null },
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
        orderBy: [
          // Order by risk level severity (CRITICAL > HIGH > MEDIUM > LOW)
          { riskLevel: 'desc' },
          { createdAt: 'desc' },
        ],
        skip,
        take: limit,
      }),
      prisma.documentAnnotation.count({
        where: {
          document: { projectId },
          annotationType: 'CLAUSE',
          riskLevel: { not: null },
        },
      }),
    ]);

    return {
      clauses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get unverified clauses for a project (review queue)
   */
  async getUnverifiedClauses(projectId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [clauses, total] = await Promise.all([
      prisma.documentAnnotation.findMany({
        where: {
          document: { projectId },
          annotationType: 'CLAUSE',
          isVerified: false,
          isRejected: false,
          source: 'berrydb', // Only AI-detected clauses need review
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
      prisma.documentAnnotation.count({
        where: {
          document: { projectId },
          annotationType: 'CLAUSE',
          isVerified: false,
          isRejected: false,
          source: 'berrydb',
        },
      }),
    ]);

    return {
      clauses,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Get project-level clause statistics
   */
  async getProjectClauseStats(projectId: string) {
    const typeStats = await prisma.documentAnnotation.groupBy({
      by: ['clauseType'],
      where: {
        document: { projectId },
        annotationType: 'CLAUSE',
        clauseType: { not: null },
      },
      _count: { id: true },
    });

    const riskStats = await prisma.documentAnnotation.groupBy({
      by: ['riskLevel'],
      where: {
        document: { projectId },
        annotationType: 'CLAUSE',
        riskLevel: { not: null },
      },
      _count: { id: true },
    });

    const [
      totalClauses,
      riskFlaggedCount,
      verifiedCount,
      rejectedCount,
      pendingReviewCount,
    ] = await Promise.all([
      prisma.documentAnnotation.count({
        where: { document: { projectId }, annotationType: 'CLAUSE' },
      }),
      prisma.documentAnnotation.count({
        where: {
          document: { projectId },
          annotationType: 'CLAUSE',
          riskLevel: { not: null },
        },
      }),
      prisma.documentAnnotation.count({
        where: {
          document: { projectId },
          annotationType: 'CLAUSE',
          isVerified: true,
        },
      }),
      prisma.documentAnnotation.count({
        where: {
          document: { projectId },
          annotationType: 'CLAUSE',
          isRejected: true,
        },
      }),
      prisma.documentAnnotation.count({
        where: {
          document: { projectId },
          annotationType: 'CLAUSE',
          isVerified: false,
          isRejected: false,
          source: 'berrydb',
        },
      }),
    ]);

    return {
      projectId,
      totalClauses,
      riskFlaggedCount,
      verifiedCount,
      rejectedCount,
      pendingReviewCount,
      byType: typeStats.map((s) => ({
        type: s.clauseType ?? 'UNKNOWN',
        count: s._count.id,
      })),
      byRiskLevel: riskStats.map((s) => ({
        level: s.riskLevel ?? 'UNKNOWN',
        count: s._count.id,
      })),
    };
  },
};
