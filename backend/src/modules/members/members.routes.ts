import { Router } from 'express';
import { membersController } from './members.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireRole,
} from '../../middleware/permissions';

// mergeParams allows access to :id from parent router
const router = Router({ mergeParams: true });

// All routes require authentication and project membership
router.use(requireAuth);
router.use(loadProjectMembership);

// GET /api/v1/projects/:id/members - List all members
router.get('/', membersController.listMembers);

// POST /api/v1/projects/:id/members/invite - Invite a user (OWNER, ADMIN)
router.post(
  '/invite',
  requireRole('OWNER', 'ADMIN'),
  membersController.inviteMember
);

// POST /api/v1/projects/:id/members/leave - Leave project (any member except OWNER)
router.post('/leave', membersController.leaveProject);

// POST /api/v1/projects/:id/members/transfer-ownership - Transfer ownership (OWNER only)
router.post(
  '/transfer-ownership',
  requireRole('OWNER'),
  membersController.transferOwnership
);

// GET /api/v1/projects/:id/members/:memberId - Get a member
router.get('/:memberId', membersController.getMember);

// PATCH /api/v1/projects/:id/members/:memberId - Update member (OWNER, ADMIN)
router.patch(
  '/:memberId',
  requireRole('OWNER', 'ADMIN'),
  membersController.updateMember
);

// DELETE /api/v1/projects/:id/members/:memberId - Remove member (OWNER, ADMIN)
router.delete(
  '/:memberId',
  requireRole('OWNER', 'ADMIN'),
  membersController.removeMember
);

export default router;
