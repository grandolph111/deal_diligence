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
// Naming someone else's board is an admin act, so only admins need the roster.
router.get('/smes', requireMinRole('ADMIN'), boardsController.listSmes);
router.get('/:boardId', requirePermission('canAccessKanban'), boardsController.get);
// MEMBER is deliberate: a specialist may carve out their own board, which the
// service pins to them — they cannot name anyone else, so this cannot widen
// their access beyond the risk categories they already hold.
router.post(
  '/',
  requireMinRole('MEMBER'),
  requirePermission('canAccessKanban'),
  boardsController.create
);
router.patch('/:boardId', requireMinRole('ADMIN'), boardsController.update);
router.delete('/:boardId', requireMinRole('ADMIN'), boardsController.remove);

export default router;
