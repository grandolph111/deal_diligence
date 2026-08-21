import { prisma } from '../../config/database';
import { Document, DocumentStatus } from '@prisma/client';
import { s3Service } from '../../services/s3.service';
import { deleteParsedPages } from '../../services/parsed-page-cache.service';
import { ApiError } from '../../utils/ApiError';
import { InitiateUploadInput, ListDocumentsQuery } from './documents.validators';
import { foldersService } from '../folders/folders.service';
import { extractionService } from '../../services/extraction.service';
import { extractionQueue } from '../../services/extraction-queue.service';
import { libraryWriterService } from '../../services/library-writer.service';
import { triageService } from '../../services/triage.service';
import { resolveProjectScope } from '../../services/scope.service';
import { EVIDENCE_TYPES, primaryRiskCategoryByDocument } from '../library/library.service';

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
  /**
   * Assert the caller may see this document.
   *
   * `requirePermission('canAccessVDR')` is a boolean flag — it says whether a
   * member may open the data room at all, not which documents they may open.
   * Without this check a member scoped to one risk category could fetch any
   * document in the deal by id, including its fact sheet and a presigned S3
   * URL for the raw source. The list endpoint scoped correctly; the
   * single-document path did not.
   */
  async assertDocumentInScope(documentId: string, projectId: string, userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, platformRole: true, companyId: true },
    });
    if (!user) throw ApiError.unauthorized('User not found');

    const scope = await resolveProjectScope(user, projectId);
    if (scope.isFullAccess) return;

    const allowed = await this.allowedDocumentIds(projectId, scope);
    if (allowed === null || allowed.has(documentId)) return;

    // 404 rather than 403: whether a document exists in a deal the caller
    // cannot fully see is itself information.
    throw ApiError.notFound('Document not found');
  },

  async getDocumentById(documentId: string, projectId: string, userId?: string) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });

    if (!document) {
      throw ApiError.notFound('Document not found');
    }

    if (userId) await this.assertDocumentInScope(documentId, projectId, userId);

    return document;
  },

  /**
   * Get the extracted fact-sheet markdown for a document.
   * Returns the raw markdown string. Throws 404 if no extraction has run yet.
   */
  async getFactSheetMarkdown(
    documentId: string,
    projectId: string,
    userId?: string
  ): Promise<string> {
    const document = await this.getDocumentById(documentId, projectId, userId);
    if (!document.extractionS3Key) {
      throw ApiError.notFound(
        'No extraction available yet. This document has not completed processing.'
      );
    }
    try {
      return await s3Service.getObjectText(document.extractionS3Key);
    } catch {
      throw ApiError.notFound('Extraction file not found in storage.');
    }
  },

  /**
   * Get a document with download URL
   * Note: Download is allowed regardless of processing status since file is in S3
   * Processing only extracts metadata (document type, risk level, etc.)
   */
  async getDocumentWithDownloadUrl(documentId: string, projectId: string, userId?: string) {
    const document = await this.getDocumentById(documentId, projectId, userId);

    // Ensure document has an S3 key (upload was completed)
    if (!document.s3Key) {
      throw ApiError.badRequest('Document upload not completed');
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
    // Allow uploads if S3 is configured OR in mock mode (development)
    if (!s3Service.isConfigured() && !s3Service.isMockMode()) {
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

    // Triage before extraction: assign priority tier + extraction depth + de-dup.
    // Decides how deeply/expensively this document is read and its queue order.
    try {
      const t = await triageService.triage(documentId);
      await prisma.document.update({
        where: { id: documentId },
        data: {
          priority: t.priority,
          priorityReason: t.priorityReason,
          extractionDepth: t.extractionDepth,
          contentHash: t.contentHash,
          duplicateOfId: t.duplicateOfId,
        },
      });
    } catch (error) {
      console.error(`Triage failed for document ${documentId}:`, error);
    }

    // Enqueue for extraction. The durable, priority-ordered queue claims the doc
    // by priority (P0 first) and processes it under a concurrency cap.
    extractionQueue.notify();

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

    // Drop the cached page parse alongside the source. It is ETag-guarded so a
    // stale entry could not be served anyway, but leaving derived copies of a
    // deleted document's full text in object storage is not a defensible
    // position for a diligence platform.
    await deleteParsedPages(documentId);

    // Delete from database
    await prisma.document.delete({
      where: { id: documentId },
    });

    // Clean up the document's knowledge-library nodes (no FK cascade — plain
    // column). Fire-and-forget so delete stays fast; reconcile refreshes status.
    if (libraryWriterService.isEnabled()) {
      libraryWriterService
        .removeDocument(projectId, documentId)
        .catch((e: unknown) =>
          console.error('[library] removeDocument failed:', e instanceof Error ? e.message : e)
        );
    }
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
   * Distinct documents supplying evidence to the given risk categories.
   * Omitting both returns every document that has any evidence at all.
   */
  /**
   * Documents whose PRIMARY risk category is one of the given ones.
   *
   * Navigation places each document once, so the tree's counts and the list it
   * opens have to agree; filtering on "has any evidence here" would show a
   * contract under a branch its node does not live in.
   */
  /**
   * The document ids a scope admits, or null for full access — mirrors the
   * library's own scoping so placement and visibility stay in step.
   */
  async allowedDocumentIds(
    projectId: string,
    scope: { isFullAccess: boolean; allowedRiskCategoryIds: string[] }
  ): Promise<Set<string> | null> {
    if (scope.isFullAccess) return null;
    if (scope.allowedRiskCategoryIds.length === 0) return new Set();
    const rows = await prisma.libraryNode.findMany({
      where: {
        projectId,
        type: { in: [...EVIDENCE_TYPES] },
        riskCategoryId: { in: scope.allowedRiskCategoryIds },
        sourceDocumentId: { not: null },
      },
      select: { sourceDocumentId: true },
      distinct: ['sourceDocumentId'],
    });
    return new Set(rows.map((r) => r.sourceDocumentId as string));
  },

  async documentIdsInRiskCategories(
    projectId: string,
    riskCategoryIds: string[],
    allowed: Set<string> | null,
    granted: Set<string> | null
  ): Promise<string[]> {
    const placement = await primaryRiskCategoryByDocument(projectId, allowed, granted);
    const wanted = new Set(riskCategoryIds);
    return [...placement.entries()].filter(([, ws]) => wanted.has(ws)).map(([id]) => id);
  },

  async documentIdsWithEvidence(
    projectId: string,
    filter: { riskCategoryIds?: string[]; itemId?: string } = {}
  ): Promise<string[]> {
    const rows = await prisma.libraryNode.findMany({
      where: {
        projectId,
        type: { in: [...EVIDENCE_TYPES] },
        sourceDocumentId: { not: null },
        ...(filter.riskCategoryIds ? { riskCategoryId: { in: filter.riskCategoryIds } } : {}),
        ...(filter.itemId ? { itemId: filter.itemId } : {}),
      },
      select: { sourceDocumentId: true },
      distinct: ['sourceDocumentId'],
    });
    return rows.map((r) => r.sourceDocumentId as string);
  },

  /**
   * Documents carrying no evidence — queued, still processing, or failed
   * extraction. These belong to no risk category, so the tree would drop them
   * entirely without an explicit bucket.
   */
  async documentIdsWithoutEvidence(projectId: string): Promise<string[]> {
    const [all, withEvidence] = await Promise.all([
      prisma.document.findMany({ where: { projectId }, select: { id: true } }),
      this.documentIdsWithEvidence(projectId),
    ]);
    const filed = new Set(withEvidence);
    return all.map((d) => d.id).filter((id) => !filed.has(id));
  },

  /**
   * List documents accessible to a user, scoped and filtered by checklist
   * risk category.
   *
   * A document is reachable through every risk category it supplies evidence to,
   * so `riskCategoryId`/`itemId` are filters over the evidence graph rather than
   * a column on Document. `unfiled` selects the complement: documents carrying
   * no evidence at all, which no risk category filter could ever surface.
   */
  async listAccessibleDocuments(
    projectId: string,
    userId: string,
    query: ListDocumentsQuery
  ) {
    const { riskCategoryId, itemId, unfiled, documentType, status, page, limit } = query;
    const skip = (page - 1) * limit;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, platformRole: true, companyId: true },
    });
    if (!user) throw ApiError.unauthorized('User not found');

    const scope = await resolveProjectScope(user, projectId);

    const empty = {
      documents: [] as never[],
      pagination: { page, limit, total: 0, totalPages: 0 },
    };

    // Zero-grant SMEs and non-members see nothing.
    if (!scope.isFullAccess && scope.allowedRiskCategoryIds.length === 0) return empty;

    if (!scope.isFullAccess && riskCategoryId && !scope.allowedRiskCategoryIds.includes(riskCategoryId)) {
      throw ApiError.forbidden('You do not have access to this risk category');
    }

    // Narrow to an explicit id set whenever scope or filters constrain which
    // documents qualify; null means "no id constraint".
    let idFilter: string[] | null = null;

    if (unfiled) {
      // Unfiled is a full-access notion — a document with no evidence sits in
      // no risk category, so no grant can reach it.
      if (!scope.isFullAccess) return empty;
      idFilter = await this.documentIdsWithoutEvidence(projectId);
    } else {
      const granted = scope.isFullAccess ? null : new Set(scope.allowedRiskCategoryIds);
      if (itemId) {
        // An explicit checklist item still means "documents with evidence here",
        // which is the right reading for a question rather than a container.
        idFilter = await this.documentIdsWithEvidence(projectId, { itemId });
      } else {
        const filterRiskCategories = riskCategoryId
          ? [riskCategoryId]
          : scope.isFullAccess
            ? null
            : scope.allowedRiskCategoryIds;
        if (filterRiskCategories) {
          // Placement, not evidence — so the branch matches its count and the
          // map node sits in the same place the list shows it.
          idFilter = await this.documentIdsInRiskCategories(
            projectId,
            filterRiskCategories,
            await this.allowedDocumentIds(projectId, scope),
            granted
          );
        }
      }
    }

    if (idFilter !== null && idFilter.length === 0) return empty;

    const where: {
      projectId: string;
      id?: { in: string[] };
      documentType?: string;
      processingStatus?: DocumentStatus;
    } = { projectId };

    if (idFilter !== null) where.id = { in: idFilter };

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
   * Get all accessible folder IDs including descendants.
   * Delegates to scope.service.ts (single source of truth).
   */
  async getAccessibleFolderIds(
    projectId: string,
    restrictedFolders: string[]
  ): Promise<string[]> {
    const { expandFoldersToDescendants } = await import('../../services/scope.service');
    return expandFoldersToDescendants(projectId, restrictedFolders);
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
