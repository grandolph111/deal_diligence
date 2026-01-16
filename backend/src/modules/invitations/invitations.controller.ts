import { Request, Response } from 'express';
import { invitationsService } from './invitations.service';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

export const invitationsController = {
  /**
   * GET /invitations/pending
   * List pending invitations for the authenticated user
   */
  listPendingForUser: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const invitations = await invitationsService.listPendingInvitationsForUser(
      req.user.email
    );

    res.json({ invitations });
  }),

  /**
   * GET /invitations/:token
   * Get invitation details by token (for preview before accepting)
   */
  getInvitationByToken: asyncHandler(async (req: Request, res: Response) => {
    const token = req.params.token as string;

    const invitation = await invitationsService.getInvitationByToken(token);

    res.json(invitation);
  }),

  /**
   * POST /invitations/:token/accept
   * Accept an invitation
   */
  acceptInvitation: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const token = req.params.token as string;

    const member = await invitationsService.acceptInvitation(token, req.user.id);

    res.json({
      message: 'Invitation accepted successfully',
      member,
    });
  }),

  /**
   * GET /projects/:id/invitations
   * List pending invitations for a project (OWNER/ADMIN only)
   */
  listPendingForProject: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;

    const invitations = await invitationsService.listPendingInvitationsForProject(
      projectId
    );

    res.json({ invitations });
  }),

  /**
   * DELETE /projects/:id/invitations/:invitationId
   * Cancel a pending invitation (OWNER/ADMIN only)
   */
  cancelInvitation: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const invitationId = req.params.invitationId as string;

    await invitationsService.cancelInvitation(invitationId, projectId);

    res.status(204).send();
  }),

  /**
   * POST /projects/:id/invitations/:invitationId/resend
   * Resend an invitation (extends expiration)
   */
  resendInvitation: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const invitationId = req.params.invitationId as string;

    const invitation = await invitationsService.resendInvitation(
      invitationId,
      projectId
    );

    res.json(invitation);
  }),
};
