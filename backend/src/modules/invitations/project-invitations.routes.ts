import { Router } from 'express';
import { invitationsController } from './invitations.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireRole,
} from '../../middleware/permissions';

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(requireAuth);

// Load project membership for all routes
router.use(loadProjectMembership);

// GET /api/v1/projects/:projectId/invitations - List pending invitations (OWNER/ADMIN)
router.get(
  '/',
  requireRole('OWNER', 'ADMIN'),
  invitationsController.listPendingForProject
);

// POST /api/v1/projects/:projectId/invitations - Create an invitation (OWNER/ADMIN)
router.post(
  '/',
  requireRole('OWNER', 'ADMIN'),
  invitationsController.createProjectInvitation
);

// DELETE /api/v1/projects/:projectId/invitations/:invitationId - Cancel invitation (OWNER/ADMIN)
router.delete(
  '/:invitationId',
  requireRole('OWNER', 'ADMIN'),
  invitationsController.cancelInvitation
);

// POST /api/v1/projects/:projectId/invitations/:invitationId/resend - Resend invitation (OWNER/ADMIN)
router.post(
  '/:invitationId/resend',
  requireRole('OWNER', 'ADMIN'),
  invitationsController.resendInvitation
);

export default router;
