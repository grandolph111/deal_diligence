import { prisma } from '../../config/database';
import { Document, DocumentStatus } from '@prisma/client';
import { s3Service } from '../../services/s3.service';
import { ApiError } from '../../utils/ApiError';
import { InitiateUploadInput, ListDocumentsQuery } from './documents.validators';

export interface DocumentUploadResult {
  documentId: string;
  filename: string;
  uploadUrl: string;
  s3Key: string;
  expiresAt: Date;
}

export const documentsService = {
  /**
   * List documents in a project with optional filtering
   */
  async listDocuments(projectId: string, query: ListDocumentsQuery) {
    const { documentType, status, page, limit } = query;
    const skip = (page - 1) * limit;

    const where = {
      projectId,
      ...(documentType && { documentType }),
      ...(status && { processingStatus: status as DocumentStatus }),
    };

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
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
   * Get a document by ID
   */
  async getDocumentById(documentId: string, projectId: string) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    return document;
  },

  /**
   * Get a document with download URL
   */
  async getDocumentWithDownloadUrl(documentId: string, projectId: string) {
    const document = await this.getDocumentById(documentId, projectId);

    if (document.processingStatus !== 'COMPLETE') {
      throw ApiError.badRequest('Document is not ready for download');
    }

    const { downloadUrl, expiresAt } = await s3Service.generatePresignedDownloadUrl(
      document.s3Key
    );

    return {
      ...document,
      downloadUrl,
      downloadUrlExpiresAt: expiresAt,
    };
  },

  /**
   * Initiate a document upload - creates record and returns presigned URL
   */
  async initiateUpload(
    projectId: string,
    uploadedById: string,
    data: InitiateUploadInput
  ): Promise<DocumentUploadResult> {
    if (!s3Service.isConfigured()) {
      throw ApiError.internal('S3 is not configured');
    }

    // Create document record with PENDING status
    const document = await prisma.document.create({
      data: {
        projectId,
        name: data.filename,
        s3Key: '', // Will be set after generating presigned URL
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        documentType: data.documentType,
        uploadedById,
        processingStatus: 'PENDING',
      },
    });

    // Generate presigned URL
    const { uploadUrl, s3Key, expiresAt } = await s3Service.generatePresignedUploadUrl(
      projectId,
      document.id,
      data.filename,
      data.mimeType
    );

    // Update document with S3 key
    await prisma.document.update({
      where: { id: document.id },
      data: { s3Key },
    });

    return {
      documentId: document.id,
      filename: data.filename,
      uploadUrl,
      s3Key,
      expiresAt,
    };
  },

  /**
   * Initiate multiple document uploads
   */
  async initiateMultipleUploads(
    projectId: string,
    uploadedById: string,
    documents: InitiateUploadInput[]
  ): Promise<DocumentUploadResult[]> {
    const results: DocumentUploadResult[] = [];

    for (const doc of documents) {
      const result = await this.initiateUpload(projectId, uploadedById, doc);
      results.push(result);
    }

    return results;
  },

  /**
   * Confirm upload complete - marks document as ready for processing
   */
  async confirmUpload(documentId: string, projectId: string): Promise<Document> {
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    if (document.processingStatus !== 'PENDING') {
      throw ApiError.badRequest('Document upload already confirmed');
    }

    return prisma.document.update({
      where: { id: documentId },
      data: { processingStatus: 'COMPLETE' },
    });
  },

  /**
   * Confirm multiple uploads complete
   */
  async confirmMultipleUploads(
    documentIds: string[],
    projectId: string
  ): Promise<{ confirmed: string[]; failed: { id: string; reason: string }[] }> {
    const confirmed: string[] = [];
    const failed: { id: string; reason: string }[] = [];

    for (const documentId of documentIds) {
      try {
        await this.confirmUpload(documentId, projectId);
        confirmed.push(documentId);
      } catch (error) {
        failed.push({
          id: documentId,
          reason: error instanceof ApiError ? error.message : 'Unknown error',
        });
      }
    }

    return { confirmed, failed };
  },

  /**
   * Delete a document
   */
  async deleteDocument(documentId: string, projectId: string): Promise<void> {
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    // Delete from S3 if it exists
    if (document.s3Key) {
      try {
        await s3Service.deleteObject(document.s3Key);
      } catch {
        // Log but don't fail if S3 deletion fails
        console.error(`Failed to delete S3 object: ${document.s3Key}`);
      }
    }

    // Delete from database
    await prisma.document.delete({
      where: { id: documentId },
    });
  },
};
