import { Router } from 'express';
import { tasksController } from './tasks.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireMinRole,
  requirePermission,
} from '../../middleware/permissions';

// mergeParams allows access to :id from parent router
const router = Router({ mergeParams: true });

// All routes require authentication and project membership
router.use(requireAuth);
router.use(loadProjectMembership);

// GET /api/v1/projects/:id/tags - List all project tags
router.get('/', requirePermission('canAccessKanban'), tasksController.listTags);

// POST /api/v1/projects/:id/tags - Create a tag
router.post('/', requireMinRole('MEMBER'), tasksController.createTag);

// DELETE /api/v1/projects/:id/tags/:tagId - Delete a tag
router.delete('/:tagId', requireMinRole('ADMIN'), tasksController.deleteTag);

export default router;
