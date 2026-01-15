import { prisma } from '../../config/database';
import { Task, TaskStatus, Prisma } from '@prisma/client';
import { CreateTaskInput, UpdateTaskInput, TaskFilters } from './tasks.validators';
import { ApiError } from '../../utils/ApiError';

const taskInclude = {
  assignees: {
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
  },
  tags: {
    include: {
      tag: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
    },
  },
  _count: {
    select: {
      attachments: true,
    },
  },
};

export const tasksService = {
  /**
   * Get all tasks for a project with optional filters
   */
  async getProjectTasks(projectId: string, filters: TaskFilters = {}) {
    const where: Prisma.TaskWhereInput = { projectId };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.priority) {
      where.priority = filters.priority;
    }

    if (filters.assigneeId) {
      where.assignees = {
        some: { userId: filters.assigneeId },
      };
    }

    if (filters.tagId) {
      where.tags = {
        some: { tagId: filters.tagId },
      };
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    if (filters.dueBefore) {
      where.dueDate = {
        ...((where.dueDate as Prisma.DateTimeNullableFilter) || {}),
        lte: new Date(filters.dueBefore),
      };
    }

    if (filters.dueAfter) {
      where.dueDate = {
        ...((where.dueDate as Prisma.DateTimeNullableFilter) || {}),
        gte: new Date(filters.dueAfter),
      };
    }

    const tasks = await prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    });

    return tasks.map((task) => ({
      ...task,
      assignees: task.assignees.map((a) => a.user),
      tags: task.tags.map((t) => t.tag),
      attachmentCount: task._count.attachments,
    }));
  },

  /**
   * Get tasks grouped by status (for Kanban board)
   */
  async getTasksByStatus(projectId: string) {
    const tasks = await this.getProjectTasks(projectId);

    const grouped = {
      TODO: [] as typeof tasks,
      IN_PROGRESS: [] as typeof tasks,
      IN_REVIEW: [] as typeof tasks,
      COMPLETE: [] as typeof tasks,
    };

    for (const task of tasks) {
      grouped[task.status].push(task);
    }

    return grouped;
  },

  /**
   * Get a single task by ID
   */
  async getTaskById(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: taskInclude,
    });

    if (!task) return null;

    return {
      ...task,
      assignees: task.assignees.map((a) => a.user),
      tags: task.tags.map((t) => t.tag),
      attachmentCount: task._count.attachments,
    };
  },

  /**
   * Create a new task
   */
  async createTask(
    projectId: string,
    creatorId: string,
    data: CreateTaskInput
  ): Promise<Task> {
    const { assigneeIds, tagIds, assignedDate, dueDate, ...taskData } = data;

    const task = await prisma.task.create({
      data: {
        ...taskData,
        projectId,
        createdById: creatorId,
        assignedDate: assignedDate ? new Date(assignedDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        assignees: assigneeIds?.length
          ? {
              create: assigneeIds.map((userId) => ({ userId })),
            }
          : undefined,
        tags: tagIds?.length
          ? {
              create: tagIds.map((tagId) => ({ tagId })),
            }
          : undefined,
      },
    });

    return task;
  },

  /**
   * Update a task
   */
  async updateTask(taskId: string, data: UpdateTaskInput): Promise<Task> {
    const { assignedDate, dueDate, ...rest } = data;

    const updateData: Prisma.TaskUpdateInput = { ...rest };

    if (assignedDate !== undefined) {
      updateData.assignedDate = assignedDate ? new Date(assignedDate) : null;
    }

    if (dueDate !== undefined) {
      updateData.dueDate = dueDate ? new Date(dueDate) : null;
    }

    return prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });
  },

  /**
   * Update task status (for drag-and-drop)
   */
  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
    return prisma.task.update({
      where: { id: taskId },
      data: { status },
    });
  },

  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<void> {
    await prisma.task.delete({
      where: { id: taskId },
    });
  },

  /**
   * Add an assignee to a task
   */
  async addAssignee(taskId: string, userId: string) {
    // Verify task exists
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    // Verify user is a project member
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId: task.projectId,
          userId,
        },
      },
    });

    if (!membership) {
      throw ApiError.badRequest('User is not a member of this project');
    }

    return prisma.taskAssignee.create({
      data: { taskId, userId },
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
   * Remove an assignee from a task
   */
  async removeAssignee(taskId: string, userId: string): Promise<void> {
    await prisma.taskAssignee.delete({
      where: {
        taskId_userId: {
          taskId,
          userId,
        },
      },
    });
  },

  /**
   * Add a tag to a task
   */
  async addTag(taskId: string, tagId: string) {
    return prisma.taskTag.create({
      data: { taskId, tagId },
    });
  },

  /**
   * Remove a tag from a task
   */
  async removeTag(taskId: string, tagId: string): Promise<void> {
    await prisma.taskTag.delete({
      where: {
        taskId_tagId: {
          taskId,
          tagId,
        },
      },
    });
  },

  /**
   * Get all tags for a project
   */
  async getProjectTags(projectId: string) {
    return prisma.tag.findMany({
      where: { projectId },
      include: {
        _count: {
          select: { tasks: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Create a new tag
   */
  async createTag(projectId: string, name: string, color?: string) {
    return prisma.tag.create({
      data: {
        projectId,
        name,
        color: color || '#6B7280',
      },
    });
  },

  /**
   * Delete a tag
   */
  async deleteTag(tagId: string): Promise<void> {
    await prisma.tag.delete({
      where: { id: tagId },
    });
  },
};
