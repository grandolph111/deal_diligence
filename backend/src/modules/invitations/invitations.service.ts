import { prisma } from '../../config/database';
import { PendingInvitation, ProjectMember, ProjectRole } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { config } from '../../config';
import { MemberPermissions } from './invitations.validators';

export interface CreateInvitationInput {
  email: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  permissions?: MemberPermissions;
}

export interface InvitationResult {
  type: 'existing_user' | 'pending_invitation';
  member?: ProjectMember;
  invitation?: PendingInvitation;
}

export const invitationsService = {
  /**
   * Create an invitation for a user to join a project.
   * If the user exists, add them directly as a member.
   * If not, create a pending invitation.
   */
  async createInvitation(
    projectId: string,
    inviterId: string,
    data: CreateInvitationInput
  ): Promise<InvitationResult> {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      // Check if already a member
      const existingMembership = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId: existingUser.id,
          },
        },
      });

      if (existingMembership) {
        throw ApiError.conflict('User is already a member of this project');
      }

      // Add as member directly
      const member = await prisma.projectMember.create({
        data: {
          projectId,
          userId: existingUser.id,
          role: data.role as ProjectRole,
          permissions: data.permissions || undefined,
          invitedBy: inviterId,
          acceptedAt: new Date(),
        },
      });

      return { type: 'existing_user', member };
    }

    // Check if there's already a pending invitation for this email
    const existingInvitation = await prisma.pendingInvitation.findUnique({
      where: {
        projectId_email: {
          projectId,
          email: data.email,
        },
      },
    });

    if (existingInvitation) {
      throw ApiError.conflict('An invitation for this email already exists');
    }

    // Create pending invitation
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.invitations.expiryDays);

    const invitation = await prisma.pendingInvitation.create({
      data: {
        projectId,
        email: data.email,
        role: data.role as ProjectRole,
        permissions: data.permissions || undefined,
        invitedBy: inviterId,
        expiresAt,
      },
    });

    return { type: 'pending_invitation', invitation };
  },

  /**
   * Create multiple invitations at once.
   * Returns results for each invitation (success or failure).
   */
  async createBulkInvitations(
    projectId: string,
    inviterId: string,
    invitations: CreateInvitationInput[]
  ): Promise<{
    added: ProjectMember[];
    pending: PendingInvitation[];
    failed: { email: string; reason: string }[];
  }> {
    const added: ProjectMember[] = [];
    const pending: PendingInvitation[] = [];
    const failed: { email: string; reason: string }[] = [];

    for (const invite of invitations) {
      try {
        const result = await this.createInvitation(projectId, inviterId, invite);

        if (result.type === 'existing_user' && result.member) {
          added.push(result.member);
        } else if (result.type === 'pending_invitation' && result.invitation) {
          pending.push(result.invitation);
        }
      } catch (error) {
        failed.push({
          email: invite.email,
          reason: error instanceof ApiError ? error.message : 'Unknown error',
        });
      }
    }

    return { added, pending, failed };
  },

  /**
   * Accept a pending invitation by token.
   * This is called when a user signs up via invitation link.
   */
  async acceptInvitation(token: string, userId: string): Promise<ProjectMember> {
    const invitation = await prisma.pendingInvitation.findUnique({
      where: { token },
      include: { project: true },
    });

    if (!invitation) {
      throw ApiError.notFound('Invitation not found or has expired');
    }

    if (invitation.acceptedAt) {
      throw ApiError.badRequest('Invitation has already been accepted');
    }

    if (invitation.expiresAt < new Date()) {
      throw ApiError.badRequest('Invitation has expired');
    }

    // Verify the user's email matches the invitation
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.email !== invitation.email) {
      throw ApiError.forbidden(
        'This invitation was sent to a different email address'
      );
    }

    // Check if user is already a member (in case they were added by other means)
    const existingMembership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: invitation.projectId,
          userId,
        },
      },
    });

    if (existingMembership) {
      // Mark invitation as accepted and return existing membership
      await prisma.pendingInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      return existingMembership;
    }

    // Create membership and mark invitation as accepted in a transaction
    const [member] = await prisma.$transaction([
      prisma.projectMember.create({
        data: {
          projectId: invitation.projectId,
          userId,
          role: invitation.role,
          permissions: invitation.permissions ?? undefined,
          invitedBy: invitation.invitedBy,
          acceptedAt: new Date(),
        },
      }),
      prisma.pendingInvitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      }),
    ]);

    return member;
  },

  /**
   * Get invitation by token (for preview before accepting)
   */
  async getInvitationByToken(token: string) {
    const invitation = await prisma.pendingInvitation.findUnique({
      where: { token },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
    });

    if (!invitation) {
      throw ApiError.notFound('Invitation not found');
    }

    if (invitation.acceptedAt) {
      throw ApiError.badRequest('Invitation has already been accepted');
    }

    if (invitation.expiresAt < new Date()) {
      throw ApiError.badRequest('Invitation has expired');
    }

    return invitation;
  },

  /**
   * List pending invitations for a user (by their email)
   */
  async listPendingInvitationsForUser(email: string) {
    return prisma.pendingInvitation.findMany({
      where: {
        email,
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: {
        project: {
          select: {
            id: true,
            name: true,
            description: true,
          },
        },
      },
      orderBy: { invitedAt: 'desc' },
    });
  },

  /**
   * List pending invitations for a project (for OWNER/ADMIN)
   */
  async listPendingInvitationsForProject(projectId: string) {
    return prisma.pendingInvitation.findMany({
      where: {
        projectId,
        acceptedAt: null,
      },
      orderBy: { invitedAt: 'desc' },
    });
  },

  /**
   * Cancel a pending invitation
   */
  async cancelInvitation(invitationId: string, projectId: string): Promise<void> {
    const invitation = await prisma.pendingInvitation.findFirst({
      where: { id: invitationId, projectId },
    });

    if (!invitation) {
      throw ApiError.notFound('Invitation not found');
    }

    if (invitation.acceptedAt) {
      throw ApiError.badRequest('Cannot cancel an accepted invitation');
    }

    await prisma.pendingInvitation.delete({
      where: { id: invitationId },
    });
  },

  /**
   * Resend invitation (updates expiration date)
   */
  async resendInvitation(invitationId: string, projectId: string): Promise<PendingInvitation> {
    const invitation = await prisma.pendingInvitation.findFirst({
      where: { id: invitationId, projectId },
    });

    if (!invitation) {
      throw ApiError.notFound('Invitation not found');
    }

    if (invitation.acceptedAt) {
      throw ApiError.badRequest('Cannot resend an accepted invitation');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.invitations.expiryDays);

    return prisma.pendingInvitation.update({
      where: { id: invitationId },
      data: { expiresAt },
    });
  },
};
