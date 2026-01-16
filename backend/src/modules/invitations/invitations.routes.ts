import { Router } from 'express';
import { invitationsController } from './invitations.controller';
import { requireAuth } from '../../middleware/auth';

const router = Router();

// GET /api/v1/invitations/pending - List user's pending invitations (authenticated)
router.get('/pending', requireAuth, invitationsController.listPendingForUser);

// Public route - get invitation by token (for preview)
router.get('/:token', invitationsController.getInvitationByToken);

// POST /api/v1/invitations/:token/accept - Accept an invitation (authenticated)
router.post('/:token/accept', requireAuth, invitationsController.acceptInvitation);

export default router;
