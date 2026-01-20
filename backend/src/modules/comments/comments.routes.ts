import { Router } from 'express';
import { commentsController } from './comments.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireMinRole,
  requirePermission,
} from '../../middleware/permissions';

const router = Router({ mergeParams: true });

router.use(requireAuth);
router.use(loadProjectMembership);

// GET /api/v1/projects/:id/tasks/:taskId/comments - List all comments
router.get(
  '/',
  requirePermission('canAccessKanban'),
  commentsController.listComments
);

// POST /api/v1/projects/:id/tasks/:taskId/comments - Create comment (MEMBER+)
router.post(
  '/',
  requireMinRole('MEMBER'),
  requirePermission('canAccessKanban'),
  commentsController.createComment
);

// PATCH /api/v1/projects/:id/tasks/:taskId/comments/:commentId - Update comment (author only)
router.patch(
  '/:commentId',
  requireMinRole('MEMBER'),
  commentsController.updateComment
);

// DELETE /api/v1/projects/:id/tasks/:taskId/comments/:commentId - Delete comment (author or ADMIN+)
router.delete(
  '/:commentId',
  requireMinRole('MEMBER'),
  commentsController.deleteComment
);

export default router;
