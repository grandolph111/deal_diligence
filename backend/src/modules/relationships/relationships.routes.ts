import { Router } from 'express';
import { relationshipsController } from './relationships.controller';
import { requireAuth } from '../../middleware/auth';
import { loadProjectMembership, requireMinRole } from '../../middleware/permissions';

/**
 * Relationships routes for entity relationship mapping
 * Mounted at /api/v1/projects/:id/relationships
 */
export const relationshipsRoutes = Router({ mergeParams: true });

// All routes require authentication and project membership
relationshipsRoutes.use(requireAuth);
relationshipsRoutes.use(loadProjectMembership);

// GET /relationships - list relationships
relationshipsRoutes.get('/', requireMinRole('MEMBER'), relationshipsController.listRelationships);

// GET /relationships/stats - get relationship statistics
relationshipsRoutes.get('/stats', requireMinRole('MEMBER'), relationshipsController.getRelationshipStats);

// POST /relationships - create relationship manually (ADMIN+)
relationshipsRoutes.post('/', requireMinRole('ADMIN'), relationshipsController.createRelationship);

// POST /relationships/sync - sync relationships from extraction (ADMIN+)
relationshipsRoutes.post('/sync', requireMinRole('ADMIN'), relationshipsController.syncRelationships);

// POST /relationships/extract - extract relationships from document (ADMIN+)
// IMPORTANT: Must be before /:relationshipId routes to avoid matching 'extract' as param
relationshipsRoutes.post('/extract', requireMinRole('ADMIN'), relationshipsController.extractRelationships);

// GET /relationships/:relationshipId - get single relationship
relationshipsRoutes.get('/:relationshipId', requireMinRole('MEMBER'), relationshipsController.getRelationship);

// PATCH /relationships/:relationshipId - update relationship (ADMIN+)
relationshipsRoutes.patch('/:relationshipId', requireMinRole('ADMIN'), relationshipsController.updateRelationship);

// DELETE /relationships/:relationshipId - delete relationship (ADMIN+)
relationshipsRoutes.delete('/:relationshipId', requireMinRole('ADMIN'), relationshipsController.deleteRelationship);

/**
 * Entity relationships routes
 * Mounted at /api/v1/projects/:id/entities/:entityId/relationships
 */
export const entityRelationshipsRouter = Router({ mergeParams: true });

entityRelationshipsRouter.use(requireAuth);
entityRelationshipsRouter.use(loadProjectMembership);

// GET /relationships - get relationships for entity
entityRelationshipsRouter.get('/', requireMinRole('MEMBER'), relationshipsController.getEntityRelationships);

/**
 * Document relationships routes
 * Mounted at /api/v1/projects/:id/documents/:documentId/related
 */
export const documentRelationshipsRouter = Router({ mergeParams: true });

documentRelationshipsRouter.use(requireAuth);
documentRelationshipsRouter.use(loadProjectMembership);

// POST /extract - extract relationships from document (ADMIN+)
documentRelationshipsRouter.post('/extract', requireMinRole('ADMIN'), relationshipsController.extractRelationships);

// GET / - get related documents
documentRelationshipsRouter.get('/', requireMinRole('MEMBER'), relationshipsController.getRelatedDocuments);
