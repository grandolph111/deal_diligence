import { Router } from 'express';
import { clausesController } from './clauses.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireMinRole,
  requirePermission,
} from '../../middleware/permissions';

/**
 * Document clauses routes
 * Mounted at /api/v1/projects/:id/documents/:documentId/clauses
 */
export const documentClausesRouter = Router({ mergeParams: true });

// All routes require authentication and project membership
documentClausesRouter.use(requireAuth);
documentClausesRouter.use(loadProjectMembership);

// GET /documents/:documentId/clauses - List clauses for a document
documentClausesRouter.get(
  '/',
  requirePermission('canAccessVDR'),
  clausesController.getDocumentClauses
);

// GET /documents/:documentId/clauses/stats - Get clause statistics
documentClausesRouter.get(
  '/stats',
  requirePermission('canAccessVDR'),
  clausesController.getClauseStats
);

// POST /documents/:documentId/clauses/detect - Trigger clause detection
documentClausesRouter.post(
  '/detect',
  requireMinRole('ADMIN'),
  clausesController.detectClauses
);

// POST /documents/:documentId/clauses/sync - Sync clauses from Python service
documentClausesRouter.post(
  '/sync',
  requireMinRole('ADMIN'),
  clausesController.syncClauses
);

// POST /documents/:documentId/clauses - Create manual clause
documentClausesRouter.post(
  '/',
  requireMinRole('MEMBER'),
  clausesController.createClause
);

// GET /documents/:documentId/clauses/:clauseId - Get single clause
documentClausesRouter.get(
  '/:clauseId',
  requirePermission('canAccessVDR'),
  clausesController.getClause
);

// PATCH /documents/:documentId/clauses/:clauseId - Update clause
documentClausesRouter.patch(
  '/:clauseId',
  requireMinRole('MEMBER'),
  clausesController.updateClause
);

// DELETE /documents/:documentId/clauses/:clauseId - Delete clause
documentClausesRouter.delete(
  '/:clauseId',
  requireMinRole('ADMIN'),
  clausesController.deleteClause
);

// POST /documents/:documentId/clauses/:clauseId/verify - Verify clause
documentClausesRouter.post(
  '/:clauseId/verify',
  requireMinRole('MEMBER'),
  clausesController.verifyClause
);

// POST /documents/:documentId/clauses/:clauseId/reject - Reject clause
documentClausesRouter.post(
  '/:clauseId/reject',
  requireMinRole('MEMBER'),
  clausesController.rejectClause
);

/**
 * Project-level clause routes
 * Mounted at /api/v1/projects/:id/clauses
 */
export const projectClausesRouter = Router({ mergeParams: true });

// All routes require authentication and project membership
projectClausesRouter.use(requireAuth);
projectClausesRouter.use(loadProjectMembership);

// GET /clauses/search - Search clauses across project
projectClausesRouter.get(
  '/search',
  requirePermission('canAccessVDR'),
  clausesController.searchClauses
);

// GET /clauses/risk-flagged - Get risk-flagged clauses
projectClausesRouter.get(
  '/risk-flagged',
  requirePermission('canAccessVDR'),
  clausesController.getRiskFlaggedClauses
);

// GET /clauses/unverified - Get unverified clauses (review queue)
projectClausesRouter.get(
  '/unverified',
  requirePermission('canAccessVDR'),
  clausesController.getUnverifiedClauses
);

// GET /clauses/stats - Get project-level clause statistics
projectClausesRouter.get(
  '/stats',
  requirePermission('canAccessVDR'),
  clausesController.getProjectClauseStats
);
