import { Router } from 'express';
import { subtasksController } from './subtasks.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireMinRole,
  requirePermission,
} from '../../middleware/permissions';

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(loadProjectMembership);

// GET /api/v1/projects/:id/tasks/:taskId/subtasks - List all subtasks
router.get(
  '/',
  requirePermission('canAccessKanban'),
  subtasksController.listSubtasks
);

// POST /api/v1/projects/:id/tasks/:taskId/subtasks - Create subtask (MEMBER+)
router.post(
  '/',
  requireMinRole('MEMBER'),
  requirePermission('canAccessKanban'),
  subtasksController.createSubtask
);

// PATCH /api/v1/projects/:id/tasks/:taskId/subtasks/reorder - Reorder subtasks (MEMBER+)
router.patch(
  '/reorder',
  requireMinRole('MEMBER'),
  subtasksController.reorderSubtasks
);

// PATCH /api/v1/projects/:id/tasks/:taskId/subtasks/:subtaskId - Update subtask (MEMBER+)
router.patch(
  '/:subtaskId',
  requireMinRole('MEMBER'),
  subtasksController.updateSubtask
);

// DELETE /api/v1/projects/:id/tasks/:taskId/subtasks/:subtaskId - Delete subtask (MEMBER+)
router.delete(
  '/:subtaskId',
  requireMinRole('MEMBER'),
  subtasksController.deleteSubtask
);

export default router;
