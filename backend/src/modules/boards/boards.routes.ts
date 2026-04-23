import { Router } from 'express';
import { boardsController } from './boards.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireMinRole,
  requirePermission,
} from '../../middleware/permissions';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(loadProjectMembership);

router.get('/', requirePermission('canAccessKanban'), boardsController.list);
router.get('/:boardId', requirePermission('canAccessKanban'), boardsController.get);
router.post('/', requireMinRole('ADMIN'), boardsController.create);
router.patch('/:boardId', requireMinRole('ADMIN'), boardsController.update);
router.delete('/:boardId', requireMinRole('ADMIN'), boardsController.remove);

export default router;
