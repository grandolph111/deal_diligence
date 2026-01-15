import { Request, Response } from 'express';
import { membersService } from './members.service';
import { inviteMemberSchema, updateMemberSchema } from './members.validators';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

export const membersController = {
  /**
   * GET /projects/:id/members
   * List all members of a project
   */
  listMembers: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params;

    const members = await membersService.getProjectMembers(projectId);

    res.json({
      status: 'success',
      data: { members },
    });
  }),

  /**
   * POST /projects/:id/members/invite
   * Invite a user to the project
   */
  inviteMember: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params;

    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const data = inviteMemberSchema.parse(req.body);
    const member = await membersService.inviteMember(
      projectId,
      req.user.id,
      data
    );

    res.status(201).json({
      status: 'success',
      data: { member },
    });
  }),

  /**
   * GET /projects/:id/members/:memberId
   * Get a single member
   */
  getMember: asyncHandler(async (req: Request, res: Response) => {
    const { memberId } = req.params;

    const member = await membersService.getMemberById(memberId);

    if (!member) {
      throw ApiError.notFound('Member not found');
    }

    res.json({
      status: 'success',
      data: { member },
    });
  }),

  /**
   * PATCH /projects/:id/members/:memberId
   * Update a member's role or permissions
   */
  updateMember: asyncHandler(async (req: Request, res: Response) => {
    const { memberId } = req.params;

    if (!req.projectMember) {
      throw ApiError.forbidden('Project membership required');
    }

    const data = updateMemberSchema.parse(req.body);
    const member = await membersService.updateMember(
      memberId,
      data,
      req.projectMember.role
    );

    res.json({
      status: 'success',
      data: { member },
    });
  }),

  /**
   * DELETE /projects/:id/members/:memberId
   * Remove a member from the project
   */
  removeMember: asyncHandler(async (req: Request, res: Response) => {
    const { memberId } = req.params;

    if (!req.projectMember) {
      throw ApiError.forbidden('Project membership required');
    }

    await membersService.removeMember(memberId, req.projectMember.role);

    res.json({
      status: 'success',
      message: 'Member removed successfully',
    });
  }),

  /**
   * POST /projects/:id/members/leave
   * Leave a project
   */
  leaveProject: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params;

    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    await membersService.leaveProject(projectId, req.user.id);

    res.json({
      status: 'success',
      message: 'Left project successfully',
    });
  }),

  /**
   * POST /projects/:id/members/transfer-ownership
   * Transfer project ownership to another member
   */
  transferOwnership: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params;
    const { newOwnerId } = req.body;

    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    if (!newOwnerId) {
      throw ApiError.badRequest('newOwnerId is required');
    }

    await membersService.transferOwnership(projectId, req.user.id, newOwnerId);

    res.json({
      status: 'success',
      message: 'Ownership transferred successfully',
    });
  }),
};
