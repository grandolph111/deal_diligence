import { prisma } from '../../config/database';
import { config } from '../../config';
import { ApiError } from '../../utils/ApiError';
import {
  ClassifyDocumentInput,
  SyncClassificationInput,
  ClassificationStats,
  ClassificationResult,
  DocumentType,
  RiskLevel,
} from './classification.validators';

interface PythonClassifyResponse {
  document_id: string;
  document_type: string;
  document_type_confidence: number;
  risk_level?: string;
  risk_level_confidence?: number;
  language?: string;
  currency?: string;
  region?: string;
}

export const classificationService = {
  /**
   * Verify document exists and belongs to project (IDOR protection)
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
   * Get current classification for a document
   */
  async getDocumentClassification(documentId: string, projectId: string) {
    const document = await this.verifyDocumentInProject(documentId, projectId);

    return {
      documentId: document.id,
      documentType: document.documentType,
      riskLevel: document.riskLevel,
      language: document.language,
      currency: document.currency,
      region: document.region,
      processingStatus: document.processingStatus,
    };
  },

  /**
   * Classify a document by calling the Python microservice
   */
  async classifyViaAI(documentId: string, projectId: string): Promise<ClassificationResult> {
    const document = await this.verifyDocumentInProject(documentId, projectId);

    // Check if Python service is configured
    if (!config.pythonService.url) {
      throw ApiError.internal('Classification service not configured');
    }

    try {
      const response = await fetch(`${config.pythonService.url}/analyze/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: document.id,
          project_id: projectId,
          s3_key: document.s3Key,
          filename: document.name,
          mime_type: document.mimeType,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Classification service error: ${response.status} - ${errorText}`);
      }

      const result = (await response.json()) as PythonClassifyResponse;

      // Map to our classification result format
      const classification: ClassificationResult = {
        documentId: document.id,
        documentType: this.normalizeDocumentType(result.document_type),
        documentTypeConfidence: result.document_type_confidence,
        riskLevel: result.risk_level
          ? this.normalizeRiskLevel(result.risk_level)
          : undefined,
        riskLevelConfidence: result.risk_level_confidence,
        language: result.language,
        currency: result.currency,
        region: result.region,
      };

      // Save classification to database
      await this.syncClassification(documentId, projectId, {
        documentType: classification.documentType,
        documentTypeConfidence: classification.documentTypeConfidence,
        riskLevel: classification.riskLevel,
        riskLevelConfidence: classification.riskLevelConfidence,
        language: classification.language,
        currency: classification.currency,
        region: classification.region,
      });

      return classification;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.internal(
        `Failed to classify document: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  },

  /**
   * Normalize document type from Python service to our enum
   */
  normalizeDocumentType(type: string): DocumentType {
    const normalized = type.toUpperCase();
    const validTypes: DocumentType[] = [
      'CONTRACT',
      'FINANCIAL',
      'LEGAL',
      'CORPORATE',
      'TECHNICAL',
      'TAX',
      'HR',
      'IP',
      'COMMERCIAL',
      'OPERATIONAL',
      'OTHER',
    ];

    return validTypes.includes(normalized as DocumentType)
      ? (normalized as DocumentType)
      : 'OTHER';
  },

  /**
   * Normalize risk level from Python service to our enum
   */
  normalizeRiskLevel(level: string): RiskLevel {
    const normalized = level.toUpperCase();
    const validLevels: RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

    return validLevels.includes(normalized as RiskLevel) ? (normalized as RiskLevel) : 'LOW';
  },

  /**
   * Sync classification from Python microservice to PostgreSQL
   */
  async syncClassification(
    documentId: string,
    projectId: string,
    input: SyncClassificationInput
  ) {
    await this.verifyDocumentInProject(documentId, projectId);

    return prisma.document.update({
      where: { id: documentId },
      data: {
        documentType: input.documentType,
        riskLevel: input.riskLevel,
        language: input.language,
        currency: input.currency,
        region: input.region,
      },
    });
  },

  /**
   * Manually classify a document (override AI classification)
   */
  async classifyManually(
    documentId: string,
    projectId: string,
    input: ClassifyDocumentInput
  ) {
    await this.verifyDocumentInProject(documentId, projectId);

    return prisma.document.update({
      where: { id: documentId },
      data: {
        documentType: input.documentType,
        riskLevel: input.riskLevel,
      },
    });
  },

  /**
   * Clear classification for a document
   */
  async clearClassification(documentId: string, projectId: string) {
    await this.verifyDocumentInProject(documentId, projectId);

    return prisma.document.update({
      where: { id: documentId },
      data: {
        documentType: null,
        riskLevel: null,
      },
    });
  },

  /**
   * Get classification statistics for a project
   */
  async getProjectStats(projectId: string): Promise<ClassificationStats> {
    // Count total and classified documents
    const [total, classified, byType, byRisk] = await Promise.all([
      prisma.document.count({ where: { projectId } }),
      prisma.document.count({
        where: { projectId, documentType: { not: null } },
      }),
      prisma.document.groupBy({
        by: ['documentType'],
        where: { projectId, documentType: { not: null } },
        _count: { id: true },
      }),
      prisma.document.groupBy({
        by: ['riskLevel'],
        where: { projectId, riskLevel: { not: null } },
        _count: { id: true },
      }),
    ]);

    // Convert grouped results to records
    const byTypeRecord: Record<string, number> = {};
    for (const item of byType) {
      if (item.documentType) {
        byTypeRecord[item.documentType] = item._count.id;
      }
    }

    const byRiskRecord: Record<string, number> = {};
    for (const item of byRisk) {
      if (item.riskLevel) {
        byRiskRecord[item.riskLevel] = item._count.id;
      }
    }

    return {
      totalDocuments: total,
      classifiedDocuments: classified,
      unclassifiedDocuments: total - classified,
      byType: byTypeRecord,
      byRiskLevel: byRiskRecord,
    };
  },

  /**
   * List documents by classification
   */
  async listByClassification(
    projectId: string,
    documentType?: string,
    riskLevel?: string,
    page: number = 1,
    limit: number = 20
  ) {
    const skip = (page - 1) * limit;

    const where: {
      projectId: string;
      documentType?: string | { not: null };
      riskLevel?: string;
    } = { projectId };

    if (documentType) {
      where.documentType = documentType;
    }
    if (riskLevel) {
      where.riskLevel = riskLevel;
    }

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        select: {
          id: true,
          name: true,
          documentType: true,
          riskLevel: true,
          processingStatus: true,
          createdAt: true,
          folder: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.document.count({ where }),
    ]);

    return {
      documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * List unclassified documents
   */
  async listUnclassified(projectId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const where = {
      projectId,
      documentType: null,
      processingStatus: 'COMPLETE' as const,
    };

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        select: {
          id: true,
          name: true,
          mimeType: true,
          processingStatus: true,
          createdAt: true,
          folder: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.document.count({ where }),
    ]);

    return {
      documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  /**
   * Batch classify multiple documents
   */
  async batchClassify(
    projectId: string,
    documentIds: string[]
  ): Promise<{ success: string[]; failed: { id: string; error: string }[] }> {
    const success: string[] = [];
    const failed: { id: string; error: string }[] = [];

    for (const documentId of documentIds) {
      try {
        await this.classifyViaAI(documentId, projectId);
        success.push(documentId);
      } catch (error) {
        failed.push({
          id: documentId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { success, failed };
  },
};
