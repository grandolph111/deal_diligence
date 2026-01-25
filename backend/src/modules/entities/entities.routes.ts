import { Router } from 'express';
import { entitiesController } from './entities.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireMinRole,
  requirePermission,
} from '../../middleware/permissions';

/**
 * Document entities routes
 * Mounted at /api/v1/projects/:id/documents/:documentId/entities
 */
export const documentEntitiesRouter = Router({ mergeParams: true });

// All routes require authentication and project membership
documentEntitiesRouter.use(requireAuth);
documentEntitiesRouter.use(loadProjectMembership);

// GET /documents/:documentId/entities - List entities for a document
documentEntitiesRouter.get(
  '/',
  requirePermission('canAccessVDR'),
  entitiesController.getDocumentEntities
);

// GET /documents/:documentId/entities/stats - Get entity statistics
documentEntitiesRouter.get(
  '/stats',
  requirePermission('canAccessVDR'),
  entitiesController.getEntityStats
);

// POST /documents/:documentId/entities/extract - Trigger entity extraction
documentEntitiesRouter.post(
  '/extract',
  requireMinRole('ADMIN'),
  entitiesController.extractEntities
);

// POST /documents/:documentId/entities/sync - Sync entities from Python service
documentEntitiesRouter.post(
  '/sync',
  requireMinRole('ADMIN'),
  entitiesController.syncEntities
);

// POST /documents/:documentId/entities - Create manual entity
documentEntitiesRouter.post(
  '/',
  requireMinRole('MEMBER'),
  entitiesController.createEntity
);

// GET /documents/:documentId/entities/:entityId - Get single entity
documentEntitiesRouter.get(
  '/:entityId',
  requirePermission('canAccessVDR'),
  entitiesController.getEntity
);

// PATCH /documents/:documentId/entities/:entityId - Update entity
documentEntitiesRouter.patch(
  '/:entityId',
  requireMinRole('MEMBER'),
  entitiesController.updateEntity
);

// DELETE /documents/:documentId/entities/:entityId - Delete entity
documentEntitiesRouter.delete(
  '/:entityId',
  requireMinRole('ADMIN'),
  entitiesController.deleteEntity
);

// POST /documents/:documentId/entities/:entityId/flag - Flag for review
documentEntitiesRouter.post(
  '/:entityId/flag',
  requireMinRole('MEMBER'),
  entitiesController.flagForReview
);

// POST /documents/:documentId/entities/:entityId/reviewed - Mark as reviewed
documentEntitiesRouter.post(
  '/:entityId/reviewed',
  requireMinRole('MEMBER'),
  entitiesController.markReviewed
);

/**
 * Project-level entity routes
 * Mounted at /api/v1/projects/:id/entities
 */
export const projectEntitiesRouter = Router({ mergeParams: true });

// All routes require authentication and project membership
projectEntitiesRouter.use(requireAuth);
projectEntitiesRouter.use(loadProjectMembership);

// GET /entities/search - Search entities across project
projectEntitiesRouter.get(
  '/search',
  requirePermission('canAccessVDR'),
  entitiesController.searchEntities
);

// GET /entities/needs-review - Get entities needing review
projectEntitiesRouter.get(
  '/needs-review',
  requirePermission('canAccessVDR'),
  entitiesController.getEntitiesNeedingReview
);
