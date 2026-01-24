import { prisma } from '../../config/database';
import { Project, ProjectRole, ProjectMember, PendingInvitation } from '@prisma/client';
import {
  CreateProjectInput,
  UpdateProjectInput,
  CreateProjectWorkflowInput,
  InviteInput,
  DocumentUploadInput,
  ArchiveProjectInput,
  TransferOwnershipInput,
} from './projects.validators';
import { invitationsService } from '../invitations/invitations.service';
import { documentsService, DocumentUploadResult } from '../documents/documents.service';
import { s3Service } from '../../services/s3.service';
import { ApiError } from '../../utils/ApiError';

export const projectsService = {
  /**
   * Get all projects for a user
   */
  async getUserProjects(userId: string) {
    const memberships = await prisma.projectMember.findMany({
      where: { userId },
      include: {
        project: {
          include: {
            _count: {
              select: {
                members: true,
                tasks: true,
                documents: true,
              },
            },
          },
        },
      },
      orderBy: {
        project: {
          updatedAt: 'desc',
        },
      },
    });

    return memberships.map((m) => ({
      ...m.project,
      role: m.role,
      memberCount: m.project._count.members,
      taskCount: m.project._count.tasks,
      documentCount: m.project._count.documents,
    }));
  },

  /**
   * Get a single project by ID
   */
  async getProjectById(projectId: string) {
    return prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: {
          select: {
            members: true,
            tasks: true,
            documents: true,
          },
        },
      },
    });
  },

  /**
   * Create a new project and set creator as OWNER
   */
  async createProject(
    data: CreateProjectInput,
    creatorId: string
  ): Promise<Project> {
    return prisma.project.create({
      data: {
        name: data.name,
        description: data.description,
        members: {
          create: {
            userId: creatorId,
            role: ProjectRole.OWNER,
            acceptedAt: new Date(),
          },
        },
      },
    });
  },

  /**
   * Update a project
   */
  async updateProject(
    projectId: string,
    data: UpdateProjectInput
  ): Promise<Project> {
    return prisma.project.update({
      where: { id: projectId },
      data,
    });
  },

  /**
   * Delete a project
   */
  async deleteProject(projectId: string): Promise<void> {
    await prisma.project.delete({
      where: { id: projectId },
    });
  },

  /**
   * Check if user is a member of the project
   */
  async isUserMember(projectId: string, userId: string): Promise<boolean> {
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });
    return !!membership;
  },

  /**
   * Get user's role in a project
   */
  async getUserRole(
    projectId: string,
    userId: string
  ): Promise<ProjectRole | null> {
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });
    return membership?.role ?? null;
  },

  /**
   * Create a project with optional invites and document upload requests.
   * This is the main workflow endpoint for creating a new project.
   */
  async createProjectWorkflow(
    data: CreateProjectWorkflowInput,
    creatorId: string
  ): Promise<{
    project: Project;
    members: {
      added: ProjectMember[];
      pending: PendingInvitation[];
      failed: { email: string; reason: string }[];
    };
    documents: {
      uploads: DocumentUploadResult[];
      failed: { filename: string; reason: string }[];
    };
  }> {
    // Step 1: Create project with creator as OWNER (transactional)
    const project = await prisma.project.create({
      data: {
        name: data.project.name,
        description: data.project.description,
        members: {
          create: {
            userId: creatorId,
            role: ProjectRole.OWNER,
            acceptedAt: new Date(),
          },
        },
      },
    });

    // Step 2: Process invites (best-effort)
    const membersResult = {
      added: [] as ProjectMember[],
      pending: [] as PendingInvitation[],
      failed: [] as { email: string; reason: string }[],
    };

    if (data.invites && data.invites.length > 0) {
      const inviteResult = await invitationsService.createBulkInvitations(
        project.id,
        creatorId,
        data.invites.map((invite) => ({
          email: invite.email,
          role: invite.role,
          permissions: invite.permissions,
        }))
      );

      membersResult.added = inviteResult.added;
      membersResult.pending = inviteResult.pending;
      membersResult.failed = inviteResult.failed;
    }

    // Step 3: Generate presigned URLs for documents (best-effort)
    const documentsResult = {
      uploads: [] as DocumentUploadResult[],
      failed: [] as { filename: string; reason: string }[],
    };

    if (data.documents && data.documents.length > 0) {
      // Check if S3 is configured
      if (!s3Service.isConfigured()) {
        documentsResult.failed = data.documents.map((doc) => ({
          filename: doc.filename,
          reason: 'S3 is not configured',
        }));
      } else {
        for (const doc of data.documents) {
          try {
            const uploadResult = await documentsService.initiateUpload(
              project.id,
              creatorId,
              {
                filename: doc.filename,
                mimeType: doc.mimeType,
                sizeBytes: doc.sizeBytes,
                documentType: doc.documentType,
              }
            );
            documentsResult.uploads.push(uploadResult);
          } catch (error) {
            documentsResult.failed.push({
              filename: doc.filename,
              reason: error instanceof Error ? error.message : 'Unknown error',
            });
          }
        }
      }
    }

    return {
      project,
      members: membersResult,
      documents: documentsResult,
    };
  },

  /**
   * Archive or unarchive a project
   */
  async archiveProject(
    projectId: string,
    data: ArchiveProjectInput
  ): Promise<Project> {
    return prisma.project.update({
      where: { id: projectId },
      data: {
        isArchived: data.isArchived,
        archivedAt: data.isArchived ? new Date() : null,
      },
    });
  },

  /**
   * Transfer project ownership to another member
   */
  async transferOwnership(
    projectId: string,
    currentOwnerId: string,
    data: TransferOwnershipInput
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
          userId: data.newOwnerId,
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
