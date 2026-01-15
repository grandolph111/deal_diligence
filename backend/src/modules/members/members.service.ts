import { prisma } from '../../config/database';
import { ProjectMember, ProjectRole } from '@prisma/client';
import { InviteMemberInput, UpdateMemberInput } from './members.validators';
import { ApiError } from '../../utils/ApiError';

export const membersService = {
  /**
   * Get all members of a project
   */
  async getProjectMembers(projectId: string) {
    return prisma.projectMember.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: [
        { role: 'asc' }, // OWNER first
        { invitedAt: 'asc' },
      ],
    });
  },

  /**
   * Get a single member by ID
   */
  async getMemberById(memberId: string) {
    return prisma.projectMember.findUnique({
      where: { id: memberId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
    });
  },

  /**
   * Invite a user to a project by email
   */
  async inviteMember(
    projectId: string,
    inviterId: string,
    data: InviteMemberInput
  ): Promise<ProjectMember> {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw ApiError.notFound(
        'User not found. They must sign up before being invited.'
      );
    }

    // Check if already a member
    const existingMembership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: user.id,
        },
      },
    });

    if (existingMembership) {
      throw ApiError.conflict('User is already a member of this project');
    }

    // Cannot invite as OWNER
    if (data.role === ProjectRole.OWNER) {
      throw ApiError.badRequest('Cannot invite users as OWNER');
    }

    return prisma.projectMember.create({
      data: {
        projectId,
        userId: user.id,
        role: data.role,
        permissions: data.permissions,
        invitedBy: inviterId,
        acceptedAt: new Date(), // Auto-accept for now; can change to require acceptance
      },
    });
  },

  /**
   * Update a member's role or permissions
   */
  async updateMember(
    memberId: string,
    data: UpdateMemberInput,
    currentUserRole: ProjectRole
  ): Promise<ProjectMember> {
    const member = await prisma.projectMember.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw ApiError.notFound('Member not found');
    }

    // Cannot change OWNER role
    if (member.role === ProjectRole.OWNER) {
      throw ApiError.forbidden('Cannot modify the project owner');
    }

    // Cannot promote to OWNER
    if (data.role === ProjectRole.OWNER) {
      throw ApiError.forbidden('Cannot promote member to OWNER');
    }

    // ADMIN cannot change another ADMIN's role
    if (
      currentUserRole === ProjectRole.ADMIN &&
      member.role === ProjectRole.ADMIN &&
      data.role
    ) {
      throw ApiError.forbidden('Admins cannot modify other admins');
    }

    return prisma.projectMember.update({
      where: { id: memberId },
      data: {
        role: data.role,
        permissions: data.permissions ?? member.permissions,
      },
    });
  },

  /**
   * Remove a member from a project
   */
  async removeMember(
    memberId: string,
    currentUserRole: ProjectRole
  ): Promise<void> {
    const member = await prisma.projectMember.findUnique({
      where: { id: memberId },
    });

    if (!member) {
      throw ApiError.notFound('Member not found');
    }

    // Cannot remove OWNER
    if (member.role === ProjectRole.OWNER) {
      throw ApiError.forbidden('Cannot remove the project owner');
    }

    // ADMIN cannot remove another ADMIN
    if (
      currentUserRole === ProjectRole.ADMIN &&
      member.role === ProjectRole.ADMIN
    ) {
      throw ApiError.forbidden('Admins cannot remove other admins');
    }

    await prisma.projectMember.delete({
      where: { id: memberId },
    });
  },

  /**
   * Leave a project (self-removal)
   */
  async leaveProject(projectId: string, userId: string): Promise<void> {
    const member = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!member) {
      throw ApiError.notFound('Membership not found');
    }

    // OWNER cannot leave - must transfer ownership first
    if (member.role === ProjectRole.OWNER) {
      throw ApiError.forbidden(
        'Project owner cannot leave. Transfer ownership first.'
      );
    }

    await prisma.projectMember.delete({
      where: { id: member.id },
    });
  },

  /**
   * Transfer project ownership
   */
  async transferOwnership(
    projectId: string,
    currentOwnerId: string,
    newOwnerId: string
  ): Promise<void> {
    // Verify current owner
    const currentOwner = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: currentOwnerId,
        },
      },
    });

    if (!currentOwner || currentOwner.role !== ProjectRole.OWNER) {
      throw ApiError.forbidden('Only the owner can transfer ownership');
    }

    // Verify new owner is a member
    const newOwner = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: newOwnerId,
        },
      },
    });

    if (!newOwner) {
      throw ApiError.notFound('New owner must be a project member');
    }

    // Transfer ownership in a transaction
    await prisma.$transaction([
      // Demote current owner to ADMIN
      prisma.projectMember.update({
        where: { id: currentOwner.id },
        data: { role: ProjectRole.ADMIN },
      }),
      // Promote new owner
      prisma.projectMember.update({
        where: { id: newOwner.id },
        data: { role: ProjectRole.OWNER },
      }),
    ]);
  },
};
