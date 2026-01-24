import { Router } from 'express';
import { taskDocumentsController } from './task-documents.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireMinRole,
  requirePermission,
} from '../../middleware/permissions';

// mergeParams allows access to :id and :taskId from parent routers
const router = Router({ mergeParams: true });

// All routes require authentication and project membership
router.use(requireAuth);
router.use(loadProjectMembership);

// ============================================
// TASK-DOCUMENT LINKING
// ============================================

// GET /api/v1/projects/:id/tasks/:taskId/documents - List linked documents
// Requires Kanban access (to see task details) OR VDR access (to see documents)
router.get(
  '/',
  requirePermission('canAccessKanban'),
  taskDocumentsController.listDocuments
);

// POST /api/v1/projects/:id/tasks/:taskId/documents - Link document to task
// Requires MEMBER role or higher
router.post(
  '/',
  requireMinRole('MEMBER'),
  taskDocumentsController.linkDocument
);

// DELETE /api/v1/projects/:id/tasks/:taskId/documents/:documentId - Unlink document
// Requires MEMBER role or higher
router.delete(
  '/:documentId',
  requireMinRole('MEMBER'),
  taskDocumentsController.unlinkDocument
);

export default router;
