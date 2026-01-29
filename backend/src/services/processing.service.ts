/**
 * Document Processing Pipeline Service
 *
 * Handles the document processing workflow:
 * 1. Trigger BerryDB ingestion after S3 upload
 * 2. Track processing status
 * 3. Handle webhook callbacks from Python service
 * 4. Retry failed processing
 * 5. Store extracted entities and clauses
 */

import { prisma } from '../config/database';
import { config } from '../config';
import { DocumentStatus } from '@prisma/client';
import type { CallbackEntity, CallbackClause } from '../modules/processing/processing.validators';

interface IngestRequest {
  document_id: string;
  project_id: string;
  s3_key: string;
  filename: string;
  mime_type: string;
  callback_url?: string;
}

interface IngestResponse {
  document_id: string;
  berrydb_id: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message: string;
}

export interface ProcessingCallbackPayload {
  document_id: string;
  berrydb_id?: string;
  status: 'completed' | 'failed';
  document_type?: string;
  risk_level?: string;
  page_count?: number;
  error?: string;
  entities?: CallbackEntity[];
  clauses?: CallbackClause[];
}

/** Low confidence threshold for flagging items needing review */
const LOW_CONFIDENCE_THRESHOLD = 0.8;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5000;

export const processingService = {
  /**
   * Check if Python service is configured
   */
  isConfigured(): boolean {
    return Boolean(config.pythonService.url);
  },

  /**
   * Get callback URL for Python service to call when processing completes
   */
  getCallbackUrl(): string {
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${config.port}`;
    return `${backendUrl}/api/v1/processing/callback`;
  },

  /**
   * Trigger document processing via Python microservice
   */
  async triggerProcessing(documentId: string): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    if (document.processingStatus !== 'PENDING') {
      throw new Error(
        `Document ${documentId} is not in PENDING status (current: ${document.processingStatus})`
      );
    }

    // Update status to PROCESSING
    await prisma.document.update({
      where: { id: documentId },
      data: { processingStatus: 'PROCESSING' as DocumentStatus },
    });

    // If Python service is not configured, simulate processing
    if (!this.isConfigured()) {
      await this.simulateProcessing(documentId);
      return;
    }

    // Call Python microservice
    try {
      const request: IngestRequest = {
        document_id: document.id,
        project_id: document.projectId,
        s3_key: document.s3Key,
        filename: document.name,
        mime_type: document.mimeType,
        callback_url: this.getCallbackUrl(),
      };

      const response = await fetch(`${config.pythonService.url}/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Python service error: ${response.status} - ${errorText}`);
      }

      const result = (await response.json()) as IngestResponse;

      // Update berryDbId if provided
      if (result.berrydb_id) {
        await prisma.document.update({
          where: { id: documentId },
          data: { berryDbId: result.berrydb_id },
        });
      }
    } catch (error) {
      // On error, update status to FAILED and schedule retry
      await this.handleProcessingError(documentId, error);
    }
  },

  /**
   * Simulate processing when Python service is not available
   * This allows development/testing without external dependencies
   */
  async simulateProcessing(documentId: string): Promise<void> {
    // Simulate async processing delay
    setTimeout(async () => {
      try {
        await prisma.document.update({
          where: { id: documentId },
          data: {
            processingStatus: 'COMPLETE' as DocumentStatus,
            berryDbId: `mock-${documentId}`,
          },
        });
      } catch {
        // Document may have been deleted during processing
      }
    }, 1000);
  },

  /**
   * Handle processing completion callback from Python service
   */
  async handleCallback(payload: ProcessingCallbackPayload): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id: payload.document_id },
    });

    if (!document) {
      throw new Error(`Document not found: ${payload.document_id}`);
    }

    if (payload.status === 'completed') {
      // Update document with classification data
      await prisma.document.update({
        where: { id: payload.document_id },
        data: {
          processingStatus: 'COMPLETE' as DocumentStatus,
          berryDbId: payload.berrydb_id || document.berryDbId,
          documentType: payload.document_type,
          riskLevel: payload.risk_level,
          pageCount: payload.page_count,
        },
      });

      // Save entities if provided
      if (payload.entities && payload.entities.length > 0) {
        await this.saveEntities(payload.document_id, payload.entities);
      }

      // Save clauses if provided
      if (payload.clauses && payload.clauses.length > 0) {
        await this.saveClauses(payload.document_id, payload.clauses);
      }
    } else if (payload.status === 'failed') {
      await this.handleProcessingError(
        payload.document_id,
        new Error(payload.error || 'Processing failed')
      );
    }
  },

  /**
   * Save extracted entities to the database
   */
  async saveEntities(documentId: string, entities: CallbackEntity[]): Promise<void> {
    // Delete existing AI-extracted entities for this document
    await prisma.documentEntity.deleteMany({
      where: { documentId, source: 'berrydb' },
    });

    // Create new entities
    if (entities.length > 0) {
      await prisma.documentEntity.createMany({
        data: entities.map((entity) => ({
          documentId,
          text: entity.text,
          entityType: entity.entity_type.toUpperCase(),
          normalizedText: entity.normalized_value ?? null,
          pageNumber: entity.page_number ?? null,
          startOffset: entity.start_offset,
          endOffset: entity.end_offset,
          confidence: entity.confidence,
          source: 'berrydb',
          needsReview: entity.confidence < LOW_CONFIDENCE_THRESHOLD,
        })),
      });
    }
  },

  /**
   * Save detected clauses to the database
   */
  async saveClauses(documentId: string, clauses: CallbackClause[]): Promise<void> {
    // Delete existing AI-detected clauses for this document
    await prisma.documentAnnotation.deleteMany({
      where: { documentId, annotationType: 'CLAUSE', source: 'berrydb' },
    });

    // Create new clause annotations
    if (clauses.length > 0) {
      await prisma.documentAnnotation.createMany({
        data: clauses.map((clause) => ({
          documentId,
          annotationType: 'CLAUSE',
          clauseType: clause.clause_type.toUpperCase(),
          title: clause.title ?? null,
          content: clause.content,
          pageNumber: clause.page_number ?? null,
          startOffset: clause.start_offset ?? null,
          endOffset: clause.end_offset ?? null,
          confidence: clause.confidence,
          riskLevel: clause.risk_level?.toUpperCase() ?? null,
          source: 'berrydb',
        })),
      });
    }
  },

  /**
   * Handle processing errors and retry if appropriate
   */
  async handleProcessingError(documentId: string, error: unknown): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return;
    }

    const retryCount = (document.retryCount || 0) + 1;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (retryCount <= MAX_RETRIES) {
      // Schedule retry
      await prisma.document.update({
        where: { id: documentId },
        data: {
          retryCount,
          lastError: errorMessage,
        },
      });

      // Schedule retry after delay
      setTimeout(() => {
        this.retryProcessing(documentId).catch(() => {
          // Ignore retry errors - they will be handled in the retry
        });
      }, RETRY_DELAY_MS * retryCount);
    } else {
      // Max retries exceeded - mark as failed
      await prisma.document.update({
        where: { id: documentId },
        data: {
          processingStatus: 'FAILED' as DocumentStatus,
          retryCount,
          lastError: `Max retries exceeded. Last error: ${errorMessage}`,
        },
      });
    }
  },

  /**
   * Retry processing for a failed document
   */
  async retryProcessing(documentId: string): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      return;
    }

    // Only retry if still in PROCESSING status (not manually updated)
    if (document.processingStatus !== 'PROCESSING') {
      return;
    }

    // Reset to PENDING to trigger processing again
    await prisma.document.update({
      where: { id: documentId },
      data: { processingStatus: 'PENDING' as DocumentStatus },
    });

    // Trigger processing
    await this.triggerProcessing(documentId);
  },

  /**
   * Manually retry a failed document
   */
  async manualRetry(documentId: string): Promise<void> {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    if (document.processingStatus !== 'FAILED') {
      throw new Error(
        `Document ${documentId} is not in FAILED status (current: ${document.processingStatus})`
      );
    }

    // Reset status and retry count
    await prisma.document.update({
      where: { id: documentId },
      data: {
        processingStatus: 'PENDING' as DocumentStatus,
        retryCount: 0,
        lastError: null,
      },
    });

    // Trigger processing
    await this.triggerProcessing(documentId);
  },

  /**
   * Get processing status for a document
   */
  async getProcessingStatus(documentId: string) {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        processingStatus: true,
        berryDbId: true,
        retryCount: true,
        lastError: true,
      },
    });

    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }

    return {
      documentId: document.id,
      status: document.processingStatus,
      berryDbId: document.berryDbId,
      retryCount: document.retryCount || 0,
      lastError: document.lastError,
    };
  },

  /**
   * Get all documents pending processing
   */
  async getPendingDocuments(projectId?: string) {
    const where: { processingStatus: DocumentStatus; projectId?: string } = {
      processingStatus: 'PENDING' as DocumentStatus,
    };

    if (projectId) {
      where.projectId = projectId;
    }

    return prisma.document.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
  },

  /**
   * Get all failed documents
   */
  async getFailedDocuments(projectId?: string) {
    const where: { processingStatus: DocumentStatus; projectId?: string } = {
      processingStatus: 'FAILED' as DocumentStatus,
    };

    if (projectId) {
      where.projectId = projectId;
    }

    return prisma.document.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  },

  /**
   * Process all pending documents in a project
   */
  async processPendingDocuments(projectId: string): Promise<void> {
    const pendingDocs = await this.getPendingDocuments(projectId);

    for (const doc of pendingDocs) {
      try {
        await this.triggerProcessing(doc.id);
      } catch {
        // Continue processing other documents even if one fails
      }
    }
  },
};
