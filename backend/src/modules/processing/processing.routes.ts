/**
 * Processing Pipeline Routes
 */

import { Router } from 'express';
import { processingController } from './processing.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireMinRole,
  requirePermission,
} from '../../middleware/permissions';

// Routes that don't require project context (webhook)
export const processingWebhookRouter = Router();

// Webhook callback from Python service - no auth required (internal only)
// In production, this should be secured with a shared secret
processingWebhookRouter.post('/callback', processingController.handleCallback);

// Routes that require project context
export const processingProjectRouter = Router({ mergeParams: true });

// All routes require authentication
processingProjectRouter.use(requireAuth);
processingProjectRouter.use(loadProjectMembership);

// GET /api/v1/projects/:id/processing/status/:documentId
processingProjectRouter.get(
  '/status/:documentId',
  requirePermission('canAccessVDR'),
  processingController.getStatus
);

// POST /api/v1/projects/:id/processing/retry
processingProjectRouter.post(
  '/retry',
  requireMinRole('ADMIN'),
  processingController.retryDocument
);

// GET /api/v1/projects/:id/processing/pending
processingProjectRouter.get(
  '/pending',
  requireMinRole('ADMIN'),
  processingController.getPendingDocuments
);

// GET /api/v1/projects/:id/processing/failed
processingProjectRouter.get(
  '/failed',
  requireMinRole('ADMIN'),
  processingController.getFailedDocuments
);

// POST /api/v1/projects/:id/processing/process-all
processingProjectRouter.post(
  '/process-all',
  requireMinRole('ADMIN'),
  processingController.processAllPending
);
