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

// GET /library/toc — risk category → checklist item tree (the Data Room navigation)
libraryRoutes.get('/toc', requirePermission('canAccessVDR'), libraryController.getToc);

// GET /library/map — the deal map: root → risk categories → documents + peer links
libraryRoutes.get('/map', requirePermission('canAccessVDR'), libraryController.getDealMap);

// GET /library/graph — base graph (risk categories → sources + entities)
libraryRoutes.get('/graph', requirePermission('canAccessVDR'), libraryController.getGraph);

// GET /library/items/:riskCategoryId/evidence — provision nodes under one checklist item
libraryRoutes.get(
  '/items/:riskCategoryId/evidence',
  requirePermission('canAccessVDR'),
  libraryController.getCategoryEvidence
);

// GET /library/documents/:documentId/backlinks — checklist items, peer docs,
// entities and notes that connect to one document
libraryRoutes.get(
  '/documents/:documentId/backlinks',
  requirePermission('canAccessVDR'),
  libraryController.getDocumentBacklinks
);

// GET /library/clauses/:clauseType/compare — every instance of one clause type
libraryRoutes.get(
  '/clauses/:clauseType/compare',
  requirePermission('canAccessVDR'),
  libraryController.compareClause
);

// POST /library/notes/suggest — checklist items a set of cited docs speaks to
libraryRoutes.post(
  '/notes/suggest',
  requirePermission('canAccessVDR'),
  libraryController.suggestNoteCategories
);

// POST /library/notes — file an answer back into the library
libraryRoutes.post('/notes', requirePermission('canAccessVDR'), libraryController.createNote);

// POST /library/lint — run the gap-hunting pass (Sonnet), return findings
libraryRoutes.post('/lint', requirePermission('canAccessVDR'), libraryController.runLint);
