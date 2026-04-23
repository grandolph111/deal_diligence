import { Router } from 'express';
import { playbookController } from './playbook.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireMinRole,
} from '../../middleware/permissions';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(loadProjectMembership);

router.get('/template', playbookController.template);
router.get('/', playbookController.get);
router.put('/', requireMinRole('ADMIN'), playbookController.save);
router.delete('/', requireMinRole('ADMIN'), playbookController.clear);

export default router;
