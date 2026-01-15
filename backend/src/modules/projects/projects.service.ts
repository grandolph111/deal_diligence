import { prisma } from '../../config/database';
import { Project, ProjectRole } from '@prisma/client';
import { CreateProjectInput, UpdateProjectInput } from './projects.validators';

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
};
