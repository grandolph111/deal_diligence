import { Request, Response } from 'express';
import { classificationService } from './classification.service';
import {
  classifyDocumentSchema,
  syncClassificationSchema,
  listByClassificationQuerySchema,
} from './classification.validators';
import { asyncHandler } from '../../utils/asyncHandler';

export const classificationController = {
  /**
   * Get classification for a document
   * GET /projects/:id/documents/:documentId/classification
   */
  getClassification: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;

    const classification = await classificationService.getDocumentClassification(
      documentId,
      projectId
    );

    res.json(classification);
  }),

  /**
   * Trigger AI classification for a document
   * POST /projects/:id/documents/:documentId/classification/classify
   */
  classifyViaAI: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;

    const result = await classificationService.classifyViaAI(documentId, projectId);

    res.json(result);
  }),

  /**
   * Manually classify a document (override)
   * PUT /projects/:id/documents/:documentId/classification
   */
  classifyManually: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const input = classifyDocumentSchema.parse(req.body);

    const document = await classificationService.classifyManually(
      documentId,
      projectId,
      input
    );

    res.json({
      documentId: document.id,
      documentType: document.documentType,
      riskLevel: document.riskLevel,
    });
  }),

  /**
   * Sync classification from Python microservice
   * POST /projects/:id/documents/:documentId/classification/sync
   */
  syncClassification: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const input = syncClassificationSchema.parse(req.body);

    const document = await classificationService.syncClassification(
      documentId,
      projectId,
      input
    );

    res.json({
      documentId: document.id,
      documentType: document.documentType,
      riskLevel: document.riskLevel,
      language: document.language,
      currency: document.currency,
      region: document.region,
    });
  }),

  /**
   * Clear classification for a document
   * DELETE /projects/:id/documents/:documentId/classification
   */
  clearClassification: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;

    await classificationService.clearClassification(documentId, projectId);

    res.status(204).send();
  }),

  /**
   * Get classification statistics for a project
   * GET /projects/:id/classification/stats
   */
  getProjectStats: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;

    const stats = await classificationService.getProjectStats(projectId);

    res.json(stats);
  }),

  /**
   * List documents by classification
   * GET /projects/:id/classification/documents
   */
  listByClassification: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { documentType, riskLevel, page, limit } = listByClassificationQuerySchema.parse(
      req.query
    );

    const result = await classificationService.listByClassification(
      projectId,
      documentType,
      riskLevel,
      page,
      limit
    );

    res.json(result);
  }),

  /**
   * List unclassified documents
   * GET /projects/:id/classification/unclassified
   */
  listUnclassified: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { page, limit } = listByClassificationQuerySchema.parse(req.query);

    const result = await classificationService.listUnclassified(projectId, page, limit);

    res.json(result);
  }),

  /**
   * Batch classify documents
   * POST /projects/:id/classification/batch
   */
  batchClassify: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { documentIds } = req.body as { documentIds: string[] };

    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      res.status(400).json({ error: 'documentIds array is required' });
      return;
    }

    if (documentIds.length > 50) {
      res.status(400).json({ error: 'Maximum 50 documents per batch' });
      return;
    }

    const result = await classificationService.batchClassify(projectId, documentIds);

    res.json(result);
  }),
};
