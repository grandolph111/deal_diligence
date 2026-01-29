import { Request, Response } from 'express';
import { masterEntitiesService } from './master-entities.service';
import {
  listMasterEntitiesQuerySchema,
  findDuplicatesQuerySchema,
  mergeEntitiesSchema,
  splitEntitySchema,
  createMasterEntitySchema,
  updateMasterEntitySchema,
} from './master-entities.validators';
import { asyncHandler } from '../../utils/asyncHandler';
import { z } from 'zod';

export const masterEntitiesController = {
  /**
   * GET /projects/:id/master-entities
   * List all master entities in a project
   */
  listMasterEntities: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const query = listMasterEntitiesQuerySchema.parse(req.query);

    const result = await masterEntitiesService.listMasterEntities(projectId, query);

    res.json(result);
  }),

  /**
   * GET /projects/:id/master-entities/:entityId
   * Get a single master entity with its document mentions
   */
  getMasterEntity: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const entityId = req.params.entityId as string;

    const entity = await masterEntitiesService.getMasterEntityById(entityId, projectId);

    res.json(entity);
  }),

  /**
   * POST /projects/:id/master-entities
   * Create a master entity manually
   */
  createMasterEntity: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const data = createMasterEntitySchema.parse(req.body);

    const entity = await masterEntitiesService.createMasterEntity(projectId, data);

    res.status(201).json(entity);
  }),

  /**
   * PATCH /projects/:id/master-entities/:entityId
   * Update a master entity
   */
  updateMasterEntity: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const entityId = req.params.entityId as string;
    const data = updateMasterEntitySchema.parse(req.body);

    const entity = await masterEntitiesService.updateMasterEntity(entityId, projectId, data);

    res.json(entity);
  }),

  /**
   * DELETE /projects/:id/master-entities/:entityId
   * Delete a master entity (unlinks document entities)
   */
  deleteMasterEntity: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const entityId = req.params.entityId as string;

    await masterEntitiesService.deleteMasterEntity(entityId, projectId);

    res.status(204).send();
  }),

  /**
   * GET /projects/:id/master-entities/:entityId/documents
   * Get all documents associated with a master entity
   */
  getMasterEntityDocuments: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const entityId = req.params.entityId as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await masterEntitiesService.getMasterEntityDocuments(
      entityId,
      projectId,
      page,
      limit
    );

    res.json(result);
  }),

  /**
   * POST /projects/:id/master-entities/deduplicate
   * Run deduplication on unlinked document entities
   */
  runDeduplication: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const threshold = parseFloat(req.body.threshold) || undefined;
    const entityType = req.body.entityType;

    const stats = await masterEntitiesService.runDeduplication(projectId, entityType, threshold);

    res.json({
      message: 'Deduplication completed',
      stats,
    });
  }),

  /**
   * GET /projects/:id/master-entities/duplicates
   * Find potential duplicate master entities
   */
  findDuplicates: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const query = findDuplicatesQuerySchema.parse(req.query);

    const result = await masterEntitiesService.findPotentialDuplicates(projectId, query);

    res.json(result);
  }),

  /**
   * POST /projects/:id/master-entities/merge
   * Merge multiple master entities into one
   */
  mergeEntities: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const data = mergeEntitiesSchema.parse(req.body);

    const result = await masterEntitiesService.mergeEntities(projectId, data);

    res.json({
      message: 'Entities merged successfully',
      entity: result,
    });
  }),

  /**
   * POST /projects/:id/master-entities/:entityId/split
   * Split document entities from a master entity into a new one
   */
  splitEntity: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const entityId = req.params.entityId as string;
    const data = splitEntitySchema.parse(req.body);

    const result = await masterEntitiesService.splitEntity(entityId, projectId, data);

    res.json({
      message: 'Entity split successfully',
      entity: result,
    });
  }),
};
