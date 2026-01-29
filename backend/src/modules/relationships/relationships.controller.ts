import { Request, Response } from 'express';
import { relationshipsService } from './relationships.service';
import {
  listRelationshipsQuerySchema,
  createRelationshipSchema,
  updateRelationshipSchema,
  syncRelationshipsSchema,
} from './relationships.validators';
import { asyncHandler } from '../../utils/asyncHandler';

export const relationshipsController = {
  /**
   * List relationships for a project
   * GET /projects/:id/relationships
   */
  listRelationships: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const query = listRelationshipsQuerySchema.parse(req.query);

    const result = await relationshipsService.listRelationships(projectId, query);
    res.json(result);
  }),

  /**
   * Get a single relationship by ID
   * GET /projects/:id/relationships/:relationshipId
   */
  getRelationship: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const relationshipId = req.params.relationshipId as string;

    const relationship = await relationshipsService.getRelationshipById(
      relationshipId,
      projectId
    );
    res.json(relationship);
  }),

  /**
   * Get relationships for a specific entity
   * GET /projects/:id/entities/:entityId/relationships
   */
  getEntityRelationships: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const entityId = req.params.entityId as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const result = await relationshipsService.getEntityRelationships(
      entityId,
      projectId,
      page,
      limit
    );
    res.json(result);
  }),

  /**
   * Create a relationship manually
   * POST /projects/:id/relationships
   */
  createRelationship: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const data = createRelationshipSchema.parse(req.body);

    const relationship = await relationshipsService.createRelationship(projectId, data);
    res.status(201).json(relationship);
  }),

  /**
   * Update a relationship
   * PATCH /projects/:id/relationships/:relationshipId
   */
  updateRelationship: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const relationshipId = req.params.relationshipId as string;
    const data = updateRelationshipSchema.parse(req.body);

    const relationship = await relationshipsService.updateRelationship(
      relationshipId,
      projectId,
      data
    );
    res.json(relationship);
  }),

  /**
   * Delete a relationship
   * DELETE /projects/:id/relationships/:relationshipId
   */
  deleteRelationship: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const relationshipId = req.params.relationshipId as string;

    await relationshipsService.deleteRelationship(relationshipId, projectId);
    res.status(204).send();
  }),

  /**
   * Extract relationships from a document
   * POST /projects/:id/documents/:documentId/relationships/extract
   */
  extractRelationships: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;

    const result = await relationshipsService.extractRelationships(documentId, projectId);
    res.json(result);
  }),

  /**
   * Sync relationships from extraction results
   * POST /projects/:id/relationships/sync
   */
  syncRelationships: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const data = syncRelationshipsSchema.parse(req.body);

    const stats = await relationshipsService.syncRelationships(projectId, data);
    res.json(stats);
  }),

  /**
   * Get related documents for a document
   * GET /projects/:id/documents/:documentId/related
   */
  getRelatedDocuments: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const result = await relationshipsService.getRelatedDocuments(
      documentId,
      projectId,
      page,
      limit
    );
    res.json(result);
  }),

  /**
   * Get relationship statistics for a project
   * GET /projects/:id/relationships/stats
   */
  getRelationshipStats: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;

    const stats = await relationshipsService.getRelationshipStats(projectId);
    res.json(stats);
  }),
};
