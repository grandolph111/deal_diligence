/**
 * Processing Pipeline Routes (admin inspection + retry only).
 * Extraction runs synchronously on upload confirmation — no webhook needed.
 */

import { Router } from 'express';
import { processingController } from './processing.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireMinRole,
  requirePermission,
} from '../../middleware/permissions';

// Routes that require project context
export const processingProjectRouter = Router({ mergeParams: true });

processingProjectRouter.use(requireAuth);
processingProjectRouter.use(loadProjectMembership);

processingProjectRouter.get(
  '/status/:documentId',
  requirePermission('canAccessVDR'),
  processingController.getStatus
);

processingProjectRouter.post(
  '/retry',
  requireMinRole('ADMIN'),
  processingController.retryDocument
);

processingProjectRouter.get(
  '/pending',
  requireMinRole('ADMIN'),
  processingController.getPendingDocuments
);

processingProjectRouter.get(
  '/failed',
  requireMinRole('ADMIN'),
  processingController.getFailedDocuments
);

processingProjectRouter.post(
  '/process-all',
  requireMinRole('ADMIN'),
  processingController.processAllPending
);
