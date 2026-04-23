import { Request, Response } from 'express';
import { documentsService } from './documents.service';
import {
  initiateUploadSchema,
  initiateMultipleUploadsSchema,
  confirmUploadSchema,
  confirmMultipleUploadsSchema,
  listDocumentsQuerySchema,
  moveDocumentSchema,
} from './documents.validators';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

export const documentsController = {
  /**
   * GET /projects/:id/documents
   * List documents in a project
   */
  listDocuments: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const query = listDocumentsQuerySchema.parse(req.query);

    const result = await documentsService.listDocuments(projectId, query);

    res.json(result);
  }),

  /**
   * GET /projects/:id/documents/:documentId
   * Get a single document with optional download URL
   * Query params: includeDownloadUrl=true or download=true
   */
  getDocument: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    // Support both query parameter names for backward compatibility
    const includeDownloadUrl =
      req.query.includeDownloadUrl === 'true' || req.query.download === 'true';

    if (includeDownloadUrl) {
      const document = await documentsService.getDocumentWithDownloadUrl(
        documentId,
        projectId
      );
      return res.json(document);
    }

    const document = await documentsService.getDocumentById(documentId, projectId);
    res.json(document);
  }),

  /**
   * GET /projects/:id/documents/:documentId/fact-sheet
   * Return the extracted fact-sheet markdown for this document.
   */
  getFactSheet: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const markdown = await documentsService.getFactSheetMarkdown(documentId, projectId);
    res.type('text/markdown').send(markdown);
  }),

  /**
   * POST /projects/:id/documents/initiate-upload
   * Initiate a single document upload
   */
  initiateUpload: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const projectId = req.params.id as string;
    const data = initiateUploadSchema.parse(req.body);

    const result = await documentsService.initiateUpload(
      projectId,
      req.user.id,
      data
    );

    res.status(201).json(result);
  }),

  /**
   * POST /projects/:id/documents/initiate-multiple-uploads
   * Initiate multiple document uploads
   */
  initiateMultipleUploads: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const projectId = req.params.id as string;
    const { documents } = initiateMultipleUploadsSchema.parse(req.body);

    const results = await documentsService.initiateMultipleUploads(
      projectId,
      req.user.id,
      documents
    );

    res.status(201).json({ documents: results });
  }),

  /**
   * POST /projects/:id/documents/confirm-upload
   * Confirm a single document upload is complete
   */
  confirmUpload: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { documentId } = confirmUploadSchema.parse(req.body);

    const document = await documentsService.confirmUpload(documentId, projectId);

    res.json(document);
  }),

  /**
   * POST /projects/:id/documents/confirm-multiple-uploads
   * Confirm multiple document uploads are complete
   */
  confirmMultipleUploads: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { documentIds } = confirmMultipleUploadsSchema.parse(req.body);

    const result = await documentsService.confirmMultipleUploads(
      documentIds,
      projectId
    );

    res.json(result);
  }),

  /**
   * DELETE /projects/:id/documents/:documentId
   * Delete a document
   */
  deleteDocument: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;

    await documentsService.deleteDocument(documentId, projectId);

    res.status(204).send();
  }),

  /**
   * PATCH /projects/:id/documents/:documentId/move
   * Move a document to a different folder
   */
  moveDocument: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const { folderId } = moveDocumentSchema.parse(req.body);

    const document = await documentsService.moveDocument(documentId, projectId, folderId);

    res.json(document);
  }),
};
