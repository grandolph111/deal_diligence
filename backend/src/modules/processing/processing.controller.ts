/**
 * Processing Pipeline Controller
 *
 * Handles webhook callbacks from Python microservice
 * and provides endpoints for managing document processing.
 */

import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  processingService,
  ProcessingCallbackPayload,
} from '../../services/processing.service';
import {
  processingCallbackSchema,
  retryDocumentSchema,
} from './processing.validators';
import { ApiError } from '../../utils/ApiError';

export const processingController = {
  /**
   * POST /api/v1/processing/callback
   * Webhook endpoint for Python microservice to call when processing completes
   */
  handleCallback: asyncHandler(async (req: Request, res: Response) => {
    const payload = processingCallbackSchema.parse(req.body) as ProcessingCallbackPayload;

    await processingService.handleCallback(payload);

    res.json({ success: true });
  }),

  /**
   * GET /api/v1/projects/:id/processing/status/:documentId
   * Get processing status for a document
   */
  getStatus: asyncHandler(async (req: Request, res: Response) => {
    const documentId = req.params.documentId as string;

    const status = await processingService.getProcessingStatus(documentId);

    res.json(status);
  }),

  /**
   * POST /api/v1/projects/:id/processing/retry
   * Manually retry a failed document
   */
  retryDocument: asyncHandler(async (req: Request, res: Response) => {
    const { documentId } = retryDocumentSchema.parse(req.body);

    // Get document to verify it exists
    const status = await processingService.getProcessingStatus(documentId);

    if (!status) {
      throw ApiError.notFound('Document not found');
    }

    await processingService.manualRetry(documentId);

    res.json({ success: true, message: 'Document queued for reprocessing' });
  }),

  /**
   * GET /api/v1/projects/:id/processing/pending
   * Get all pending documents in a project
   */
  getPendingDocuments: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;

    const documents = await processingService.getPendingDocuments(projectId);

    res.json({ documents });
  }),

  /**
   * GET /api/v1/projects/:id/processing/failed
   * Get all failed documents in a project
   */
  getFailedDocuments: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;

    const documents = await processingService.getFailedDocuments(projectId);

    res.json({ documents });
  }),

  /**
   * POST /api/v1/projects/:id/processing/process-all
   * Process all pending documents in a project
   */
  processAllPending: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;

    await processingService.processPendingDocuments(projectId);

    res.json({ success: true, message: 'Processing started for all pending documents' });
  }),
};
