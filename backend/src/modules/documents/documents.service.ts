import { prisma } from '../../config/database';
import { Document, DocumentStatus } from '@prisma/client';
import { s3Service } from '../../services/s3.service';
import { ApiError } from '../../utils/ApiError';
import { InitiateUploadInput, ListDocumentsQuery } from './documents.validators';
import { foldersService } from '../folders/folders.service';
import { processingService } from '../../services/processing.service';

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
    const { folderId, documentType, status, page, limit } = query;
    const skip = (page - 1) * limit;

    // Build where clause with folder filter
    const where: {
      projectId: string;
      folderId?: string | null;
      documentType?: string;
      processingStatus?: DocumentStatus;
    } = {
      projectId,
    };

    // Filter by folderId - can be null for root-level documents
    if (folderId !== undefined) {
      where.folderId = folderId === 'null' ? null : folderId;
    }
    if (documentType) {
      where.documentType = documentType;
    }
    if (status) {
      where.processingStatus = status as DocumentStatus;
    }

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: {
          folder: {
            select: { id: true, name: true, isViewOnly: true },
          },
          uploadedBy: {
            select: { id: true, name: true, email: true },
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

    // If folderId is provided, verify it belongs to the project
    if (data.folderId) {
      await foldersService.verifyFolderInProject(data.folderId, projectId);
    }

    // Create document record with PENDING status
    const document = await prisma.document.create({
      data: {
        projectId,
        name: data.filename,
        s3Key: '', // Will be set after generating presigned URL
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        folderId: data.folderId ?? null,
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
   * Confirm upload complete - triggers document processing pipeline
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

    // Trigger processing pipeline (async - does not wait for completion)
    // Processing will update status to PROCESSING -> COMPLETE/FAILED
    processingService.triggerProcessing(documentId).catch((error) => {
      // Log error but don't fail the request - processing can be retried
      // eslint-disable-next-line no-console
      console.error(`Failed to trigger processing for document ${documentId}:`, error);
    });

    // Return the document (still in PENDING status, processing runs async)
    return document;
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
        // eslint-disable-next-line no-console
        console.error(`Failed to delete S3 object: ${document.s3Key}`);
      }
    }

    // Delete from database
    await prisma.document.delete({
      where: { id: documentId },
    });
  },

  /**
   * Move a document to a different folder
   */
  async moveDocument(
    documentId: string,
    projectId: string,
    folderId: string | null
  ): Promise<Document> {
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    // If moving to a folder, verify it belongs to the project
    if (folderId) {
      await foldersService.verifyFolderInProject(folderId, projectId);
    }

    // Update the document's folder
    return prisma.document.update({
      where: { id: documentId },
      data: { folderId },
      include: {
        folder: {
          select: { id: true, name: true, isViewOnly: true },
        },
      },
    });
  },

  /**
   * List documents accessible to a user (respecting folder permissions)
   */
  async listAccessibleDocuments(
    projectId: string,
    userId: string,
    query: ListDocumentsQuery
  ) {
    const { folderId, documentType, status, page, limit } = query;
    const skip = (page - 1) * limit;

    // Get user's membership to check restrictions
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!membership) {
      throw ApiError.forbidden('Not a member of this project');
    }

    // Build where clause
    const where: {
      projectId: string;
      folderId?: string | null | { in: string[] };
      documentType?: string;
      processingStatus?: DocumentStatus;
    } = {
      projectId,
    };

    // OWNER and ADMIN have full access
    const isFullAccess = membership.role === 'OWNER' || membership.role === 'ADMIN';
    const permissions = membership.permissions as Record<string, unknown> | null;
    const restrictedFolders = permissions?.restrictedFolders as string[] | undefined;

    // If user has folder restrictions, only show documents in those folders
    if (!isFullAccess && restrictedFolders && restrictedFolders.length > 0) {
      // If requesting a specific folder, verify they have access
      if (folderId && folderId !== 'null') {
        const hasAccess = await foldersService.userHasFolderAccess(folderId, userId, projectId);
        if (!hasAccess) {
          throw ApiError.forbidden('You do not have access to this folder');
        }
        where.folderId = folderId;
      } else {
        // Get all accessible folder IDs (including descendants)
        const accessibleFolderIds = await this.getAccessibleFolderIds(projectId, restrictedFolders);
        where.folderId = { in: accessibleFolderIds };
      }
    } else if (folderId !== undefined) {
      // No restrictions, apply folder filter if provided
      where.folderId = folderId === 'null' ? null : folderId;
    }

    if (documentType) {
      where.documentType = documentType;
    }
    if (status) {
      where.processingStatus = status as DocumentStatus;
    }

    const [documents, total] = await Promise.all([
      prisma.document.findMany({
        where,
        include: {
          folder: {
            select: { id: true, name: true, isViewOnly: true },
          },
          uploadedBy: {
            select: { id: true, name: true, email: true },
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
   * Get all accessible folder IDs including descendants
   */
  async getAccessibleFolderIds(
    projectId: string,
    restrictedFolders: string[]
  ): Promise<string[]> {
    const accessibleIds = new Set<string>(restrictedFolders);

    // Get all folders in the project
    const allFolders = await prisma.folder.findMany({
      where: { projectId },
      select: { id: true, parentId: true },
    });

    // Build parent-to-children map
    const childrenMap = new Map<string | null, string[]>();
    for (const folder of allFolders) {
      const children = childrenMap.get(folder.parentId) || [];
      children.push(folder.id);
      childrenMap.set(folder.parentId, children);
    }

    // Add all descendants of restricted folders
    const addDescendants = (folderId: string) => {
      const children = childrenMap.get(folderId) || [];
      for (const childId of children) {
        accessibleIds.add(childId);
        addDescendants(childId);
      }
    };

    for (const folderId of restrictedFolders) {
      addDescendants(folderId);
    }

    return Array.from(accessibleIds);
  },

  /**
   * Check if user has access to a specific document
   */
  async userHasDocumentAccess(
    documentId: string,
    userId: string,
    projectId: string
  ): Promise<boolean> {
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });

    if (!document) {
      return false;
    }

    // If document is in a folder, check folder access
    if (document.folderId) {
      return foldersService.userHasFolderAccess(document.folderId, userId, projectId);
    }

    // Root-level documents are accessible if user has VDR access
    return true;
  },
};
