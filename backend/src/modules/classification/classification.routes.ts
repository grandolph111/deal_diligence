import { Router } from 'express';
import { classificationController } from './classification.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireMinRole,
  requirePermission,
} from '../../middleware/permissions';

/**
 * Document-level classification routes
 * Mounted at /projects/:id/documents/:documentId/classification
 */
export const documentClassificationRouter = Router({ mergeParams: true });

// All routes require authentication and project membership
documentClassificationRouter.use(requireAuth);
documentClassificationRouter.use(loadProjectMembership);

// GET - Get current classification for a document
documentClassificationRouter.get(
  '/',
  requirePermission('canAccessVDR'),
  classificationController.getClassification
);

// POST - Trigger AI classification
documentClassificationRouter.post(
  '/classify',
  requireMinRole('ADMIN'),
  classificationController.classifyViaAI
);

// PUT - Manually classify (override)
documentClassificationRouter.put(
  '/',
  requireMinRole('MEMBER'),
  classificationController.classifyManually
);

// POST - Sync classification from Python service
documentClassificationRouter.post(
  '/sync',
  requireMinRole('ADMIN'),
  classificationController.syncClassification
);

// DELETE - Clear classification
documentClassificationRouter.delete(
  '/',
  requireMinRole('ADMIN'),
  classificationController.clearClassification
);

/**
 * Project-level classification routes
 * Mounted at /projects/:id/classification
 */
export const projectClassificationRouter = Router({ mergeParams: true });

// All routes require authentication and project membership
projectClassificationRouter.use(requireAuth);
projectClassificationRouter.use(loadProjectMembership);

// GET - Classification statistics for the project
projectClassificationRouter.get(
  '/stats',
  requirePermission('canAccessVDR'),
  classificationController.getProjectStats
);

// GET - List documents by classification
projectClassificationRouter.get(
  '/documents',
  requirePermission('canAccessVDR'),
  classificationController.listByClassification
);

// GET - List unclassified documents
projectClassificationRouter.get(
  '/unclassified',
  requirePermission('canAccessVDR'),
  classificationController.listUnclassified
);

// POST - Batch classify documents
projectClassificationRouter.post(
  '/batch',
  requireMinRole('ADMIN'),
  classificationController.batchClassify
);
