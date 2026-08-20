import { Router } from 'express';
import { libraryController } from './library.controller';
import { requireAuth } from '../../middleware/auth';
import { loadProjectMembership, requirePermission } from '../../middleware/permissions';

/**
 * Knowledge-library read routes.
 * Mounted at /api/v1/projects/:id/library
 */
export const libraryRoutes = Router({ mergeParams: true });

libraryRoutes.use(requireAuth);
libraryRoutes.use(loadProjectMembership);

// GET /library/toc — workstream → checklist item tree (the Data Room navigation)
libraryRoutes.get('/toc', requirePermission('canAccessVDR'), libraryController.getToc);

// GET /library/graph — tiered base graph (workstreams → items → sources + entities)
libraryRoutes.get('/graph', requirePermission('canAccessVDR'), libraryController.getGraph);

// GET /library/items/:itemId/evidence — provision nodes under one checklist item
libraryRoutes.get(
  '/items/:itemId/evidence',
  requirePermission('canAccessVDR'),
  libraryController.getItemEvidence
);

// POST /library/lint — run the gap-hunting pass (Sonnet), return findings
libraryRoutes.post('/lint', requirePermission('canAccessVDR'), libraryController.runLint);
