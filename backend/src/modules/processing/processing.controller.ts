/**
 * Processing Pipeline Controller
 *
 * Admin-facing endpoints for inspecting and retrying document extraction.
 * The pipeline itself is synchronous (Node → Claude), so no webhook callback
 * exists anymore. Extraction is triggered on upload confirmation.
 */

import { Request, Response } from 'express';
import { prisma } from '../../config/database';
import { asyncHandler } from '../../utils/asyncHandler';
import { extractionService } from '../../services/extraction.service';
import { retryDocumentSchema } from './processing.validators';
import { ApiError } from '../../utils/ApiError';

export const processingController = {
  getStatus: asyncHandler(async (req: Request, res: Response) => {
    const documentId = req.params.documentId as string;
    const status = await extractionService.getStatus(documentId);
    res.json(status);
  }),

  retryDocument: asyncHandler(async (req: Request, res: Response) => {
    const { documentId } = retryDocumentSchema.parse(req.body);
    const status = await extractionService.getStatus(documentId).catch(() => null);
    if (!status) throw ApiError.notFound('Document not found');
    await extractionService.manualRetry(documentId);
    res.json({ success: true, message: 'Document queued for reprocessing' });
  }),

  getPendingDocuments: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documents = await prisma.document.findMany({
      where: { projectId, processingStatus: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ documents });
  }),

  getFailedDocuments: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documents = await prisma.document.findMany({
      where: { projectId, processingStatus: 'FAILED' },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ documents });
  }),

  processAllPending: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const pending = await prisma.document.findMany({
      where: { projectId, processingStatus: 'PENDING' },
      select: { id: true },
    });
    for (const doc of pending) {
      extractionService.triggerExtraction(doc.id).catch(() => undefined);
    }
    res.json({
      success: true,
      message: `Extraction triggered for ${pending.length} pending documents`,
    });
  }),
};
