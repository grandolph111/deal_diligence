import { Router } from 'express';
import { masterEntitiesController } from './master-entities.controller';
import { requireAuth } from '../../middleware/auth';
import { loadProjectMembership, requireMinRole } from '../../middleware/permissions';

/**
 * Master entities routes for entity deduplication and knowledge graph
 * Mounted at /api/v1/projects/:id/master-entities
 */
export const masterEntitiesRouter = Router({ mergeParams: true });

// All routes require authentication and project membership
masterEntitiesRouter.use(requireAuth);
masterEntitiesRouter.use(loadProjectMembership);

// GET /master-entities - List all master entities
masterEntitiesRouter.get('/', requireMinRole('MEMBER'), masterEntitiesController.listMasterEntities);

// GET /master-entities/duplicates - Find potential duplicates
masterEntitiesRouter.get(
  '/duplicates',
  requireMinRole('ADMIN'),
  masterEntitiesController.findDuplicates
);

// POST /master-entities/deduplicate - Run deduplication
masterEntitiesRouter.post(
  '/deduplicate',
  requireMinRole('ADMIN'),
  masterEntitiesController.runDeduplication
);

// POST /master-entities/merge - Merge entities
masterEntitiesRouter.post('/merge', requireMinRole('ADMIN'), masterEntitiesController.mergeEntities);

// POST /master-entities - Create master entity manually
masterEntitiesRouter.post('/', requireMinRole('ADMIN'), masterEntitiesController.createMasterEntity);

// GET /master-entities/:entityId - Get single master entity
masterEntitiesRouter.get(
  '/:entityId',
  requireMinRole('MEMBER'),
  masterEntitiesController.getMasterEntity
);

// PATCH /master-entities/:entityId - Update master entity
masterEntitiesRouter.patch(
  '/:entityId',
  requireMinRole('ADMIN'),
  masterEntitiesController.updateMasterEntity
);

// DELETE /master-entities/:entityId - Delete master entity
masterEntitiesRouter.delete(
  '/:entityId',
  requireMinRole('ADMIN'),
  masterEntitiesController.deleteMasterEntity
);

// GET /master-entities/:entityId/documents - Get documents for entity
masterEntitiesRouter.get(
  '/:entityId/documents',
  requireMinRole('MEMBER'),
  masterEntitiesController.getMasterEntityDocuments
);

// POST /master-entities/:entityId/split - Split entity
masterEntitiesRouter.post(
  '/:entityId/split',
  requireMinRole('ADMIN'),
  masterEntitiesController.splitEntity
);
