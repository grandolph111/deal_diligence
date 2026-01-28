import { Request, Response } from 'express';
import { clausesService } from './clauses.service';
import {
  listClausesQuerySchema,
  searchClausesQuerySchema,
  syncClausesSchema,
  createClauseSchema,
  updateClauseSchema,
} from './clauses.validators';
import { asyncHandler } from '../../utils/asyncHandler';

export const clausesController = {
  /**
   * GET /projects/:id/documents/:documentId/clauses
   * Get clauses detected in a document
   */
  getDocumentClauses: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const query = listClausesQuerySchema.parse(req.query);

    const result = await clausesService.getDocumentClauses(documentId, projectId, query);

    res.json(result);
  }),

  /**
   * GET /projects/:id/documents/:documentId/clauses/:clauseId
   * Get a single clause by ID
   */
  getClause: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const clauseId = req.params.clauseId as string;

    const clause = await clausesService.getClauseById(clauseId, documentId, projectId);

    res.json(clause);
  }),

  /**
   * GET /projects/:id/documents/:documentId/clauses/stats
   * Get clause statistics for a document
   */
  getClauseStats: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;

    const stats = await clausesService.getClauseStats(documentId, projectId);

    res.json(stats);
  }),

  /**
   * POST /projects/:id/documents/:documentId/clauses/detect
   * Trigger clause detection for a document via Python microservice
   */
  detectClauses: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;

    const result = await clausesService.detectClausesInDocument(documentId, projectId);

    res.json(result);
  }),

  /**
   * POST /projects/:id/documents/:documentId/clauses/sync
   * Sync clauses from Python microservice (webhook callback)
   */
  syncClauses: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const data = syncClausesSchema.parse(req.body);

    const result = await clausesService.syncClausesFromPython(documentId, projectId, data);

    res.json(result);
  }),

  /**
   * POST /projects/:id/documents/:documentId/clauses
   * Manually create a clause annotation
   */
  createClause: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const data = createClauseSchema.parse(req.body);

    const clause = await clausesService.createClause(documentId, projectId, data);

    res.status(201).json(clause);
  }),

  /**
   * PATCH /projects/:id/documents/:documentId/clauses/:clauseId
   * Update a clause annotation
   */
  updateClause: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const clauseId = req.params.clauseId as string;
    const data = updateClauseSchema.parse(req.body);

    const clause = await clausesService.updateClause(clauseId, documentId, projectId, data);

    res.json(clause);
  }),

  /**
   * DELETE /projects/:id/documents/:documentId/clauses/:clauseId
   * Delete a clause annotation
   */
  deleteClause: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const clauseId = req.params.clauseId as string;

    await clausesService.deleteClause(clauseId, documentId, projectId);

    res.status(204).send();
  }),

  /**
   * POST /projects/:id/documents/:documentId/clauses/:clauseId/verify
   * Verify a clause as correct (human verification)
   */
  verifyClause: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const clauseId = req.params.clauseId as string;
    const userId = req.user!.id;
    const { note } = req.body as { note?: string };

    const clause = await clausesService.verifyClause(
      clauseId,
      documentId,
      projectId,
      userId,
      note
    );

    res.json(clause);
  }),

  /**
   * POST /projects/:id/documents/:documentId/clauses/:clauseId/reject
   * Reject a clause as incorrect (human verification)
   */
  rejectClause: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const clauseId = req.params.clauseId as string;
    const userId = req.user!.id;
    const { note } = req.body as { note?: string };

    const clause = await clausesService.rejectClause(
      clauseId,
      documentId,
      projectId,
      userId,
      note
    );

    res.json(clause);
  }),

  /**
   * GET /projects/:id/clauses/search
   * Search clauses across all documents in a project
   */
  searchClauses: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const query = searchClausesQuerySchema.parse(req.query);

    const result = await clausesService.searchClauses(projectId, query);

    res.json(result);
  }),

  /**
   * GET /projects/:id/clauses/risk-flagged
   * Get all risk-flagged clauses in a project
   */
  getRiskFlaggedClauses: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await clausesService.getRiskFlaggedClauses(projectId, page, limit);

    res.json(result);
  }),

  /**
   * GET /projects/:id/clauses/unverified
   * Get all unverified clauses in a project (review queue)
   */
  getUnverifiedClauses: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await clausesService.getUnverifiedClauses(projectId, page, limit);

    res.json(result);
  }),

  /**
   * GET /projects/:id/clauses/stats
   * Get project-level clause statistics
   */
  getProjectClauseStats: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;

    const stats = await clausesService.getProjectClauseStats(projectId);

    res.json(stats);
  }),
};
