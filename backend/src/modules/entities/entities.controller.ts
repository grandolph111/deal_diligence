import { Request, Response } from 'express';
import { entitiesService } from './entities.service';
import {
  listEntitiesQuerySchema,
  searchEntitiesQuerySchema,
  syncEntitiesSchema,
  createEntitySchema,
  updateEntitySchema,
} from './entities.validators';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

export const entitiesController = {
  /**
   * GET /projects/:id/documents/:documentId/entities
   * Get entities extracted from a document
   */
  getDocumentEntities: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const query = listEntitiesQuerySchema.parse(req.query);

    const result = await entitiesService.getDocumentEntities(documentId, projectId, query);

    res.json(result);
  }),

  /**
   * GET /projects/:id/documents/:documentId/entities/:entityId
   * Get a single entity by ID
   */
  getEntity: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const entityId = req.params.entityId as string;

    const entity = await entitiesService.getEntityById(entityId, documentId, projectId);

    res.json(entity);
  }),

  /**
   * GET /projects/:id/documents/:documentId/entities/stats
   * Get entity statistics for a document
   */
  getEntityStats: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;

    const stats = await entitiesService.getEntityStats(documentId, projectId);

    res.json(stats);
  }),

  /**
   * POST /projects/:id/documents/:documentId/entities/extract
   * Trigger entity extraction for a document via Python microservice
   */
  extractEntities: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;

    const result = await entitiesService.extractEntitiesFromDocument(documentId, projectId);

    res.json(result);
  }),

  /**
   * POST /projects/:id/documents/:documentId/entities/sync
   * Sync entities from Python microservice (webhook callback)
   */
  syncEntities: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const data = syncEntitiesSchema.parse(req.body);

    const result = await entitiesService.syncEntitiesFromPython(documentId, projectId, data);

    res.json(result);
  }),

  /**
   * POST /projects/:id/documents/:documentId/entities
   * Manually create an entity
   */
  createEntity: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const data = createEntitySchema.parse(req.body);

    const entity = await entitiesService.createEntity(documentId, projectId, data);

    res.status(201).json(entity);
  }),

  /**
   * PATCH /projects/:id/documents/:documentId/entities/:entityId
   * Update an entity (e.g., after human review)
   */
  updateEntity: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const entityId = req.params.entityId as string;
    const data = updateEntitySchema.parse(req.body);

    const entity = await entitiesService.updateEntity(entityId, documentId, projectId, data);

    res.json(entity);
  }),

  /**
   * DELETE /projects/:id/documents/:documentId/entities/:entityId
   * Delete an entity
   */
  deleteEntity: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const entityId = req.params.entityId as string;

    await entitiesService.deleteEntity(entityId, documentId, projectId);

    res.status(204).send();
  }),

  /**
   * POST /projects/:id/documents/:documentId/entities/:entityId/flag
   * Flag an entity as needing review
   */
  flagForReview: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const entityId = req.params.entityId as string;

    const entity = await entitiesService.flagEntityForReview(entityId, documentId, projectId);

    res.json(entity);
  }),

  /**
   * POST /projects/:id/documents/:documentId/entities/:entityId/reviewed
   * Mark an entity as reviewed
   */
  markReviewed: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const entityId = req.params.entityId as string;

    const entity = await entitiesService.markEntityReviewed(entityId, documentId, projectId);

    res.json(entity);
  }),

  /**
   * GET /projects/:id/entities/search
   * Search entities across all documents in a project
   */
  searchEntities: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const query = searchEntitiesQuerySchema.parse(req.query);

    const result = await entitiesService.searchEntities(projectId, query);

    res.json(result);
  }),

  /**
   * GET /projects/:id/entities/needs-review
   * Get all entities needing review in a project
   */
  getEntitiesNeedingReview: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await entitiesService.getEntitiesNeedingReview(projectId, page, limit);

    res.json(result);
  }),
};
