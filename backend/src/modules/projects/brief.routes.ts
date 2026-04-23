import { Router } from 'express';
import { briefController } from './brief.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireMinRole,
} from '../../middleware/permissions';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(loadProjectMembership);

router.get('/', briefController.get);
router.put('/sections/:sectionId', briefController.saveHumanSection);
router.post('/rebuild', requireMinRole('ADMIN'), briefController.rebuild);

export default router;
