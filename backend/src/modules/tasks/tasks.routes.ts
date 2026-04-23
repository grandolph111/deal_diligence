import { Router } from 'express';
import { tasksController } from './tasks.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireRole,
  requireMinRole,
  requirePermission,
} from '../../middleware/permissions';

// mergeParams allows access to :id from parent router
const router = Router({ mergeParams: true });

// All routes require authentication and project membership
router.use(requireAuth);
router.use(loadProjectMembership);

// ============================================
// TASKS
// ============================================

// GET /api/v1/projects/:id/tasks - List all tasks
router.get('/', requirePermission('canAccessKanban'), tasksController.listTasks);

// GET /api/v1/projects/:id/tasks/board - Get Kanban board view
router.get(
  '/board',
  requirePermission('canAccessKanban'),
  tasksController.getBoard
);

// POST /api/v1/projects/:id/tasks - Create task (OWNER, ADMIN, MEMBER)
router.post(
  '/',
  requireMinRole('MEMBER'),
  requirePermission('canAccessKanban'),
  tasksController.createTask
);

// GET /api/v1/projects/:id/tasks/:taskId - Get task details
router.get(
  '/:taskId',
  requirePermission('canAccessKanban'),
  tasksController.getTask
);

// GET /api/v1/projects/:id/tasks/:taskId/ai-report - Get the AI risk report markdown
router.get(
  '/:taskId/ai-report',
  requirePermission('canAccessKanban'),
  tasksController.getAiReport
);

// POST /api/v1/projects/:id/tasks/:taskId/run-ai - Trigger AI run immediately
router.post(
  '/:taskId/run-ai',
  requireMinRole('MEMBER'),
  requirePermission('canAccessKanban'),
  tasksController.runAi
);

// POST /api/v1/projects/:id/tasks/:taskId/ai-approve - Approve report → COMPLETE
router.post(
  '/:taskId/ai-approve',
  requireMinRole('MEMBER'),
  requirePermission('canAccessKanban'),
  tasksController.approveAi
);

// POST /api/v1/projects/:id/tasks/:taskId/ai-request-changes - Reject draft, reset AI state
router.post(
  '/:taskId/ai-request-changes',
  requireMinRole('MEMBER'),
  requirePermission('canAccessKanban'),
  tasksController.requestAiChanges
);

// PATCH /api/v1/projects/:id/tasks/:taskId - Update task (OWNER, ADMIN, MEMBER)
router.patch(
  '/:taskId',
  requireMinRole('MEMBER'),
  tasksController.updateTask
);

// PATCH /api/v1/projects/:id/tasks/:taskId/status - Update task status
router.patch(
  '/:taskId/status',
  requireMinRole('MEMBER'),
  tasksController.updateTaskStatus
);

// DELETE /api/v1/projects/:id/tasks/:taskId - Delete task (OWNER, ADMIN, MEMBER)
router.delete(
  '/:taskId',
  requireMinRole('MEMBER'),
  tasksController.deleteTask
);

// ============================================
// TASK ASSIGNEES
// ============================================

// POST /api/v1/projects/:id/tasks/:taskId/assignees - Add assignee
router.post(
  '/:taskId/assignees',
  requireMinRole('MEMBER'),
  tasksController.addAssignee
);

// DELETE /api/v1/projects/:id/tasks/:taskId/assignees/:userId - Remove assignee
router.delete(
  '/:taskId/assignees/:userId',
  requireMinRole('MEMBER'),
  tasksController.removeAssignee
);

// ============================================
// TASK TAGS
// ============================================

// POST /api/v1/projects/:id/tasks/:taskId/tags - Add tag to task
router.post('/:taskId/tags', requireMinRole('MEMBER'), tasksController.addTag);

// DELETE /api/v1/projects/:id/tasks/:taskId/tags/:tagId - Remove tag from task
router.delete(
  '/:taskId/tags/:tagId',
  requireMinRole('MEMBER'),
  tasksController.removeTag
);

export default router;
