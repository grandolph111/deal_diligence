import { prisma } from '../../config/database';
import { CreateSubtaskInput, UpdateSubtaskInput } from './subtasks.validators';
import { ApiError } from '../../utils/ApiError';

const subtaskInclude = {
  assignee: {
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
    },
  },
};

export const subtasksService = {
  async getTaskSubtasks(taskId: string) {
    return prisma.subtask.findMany({
      where: { taskId },
      include: subtaskInclude,
      orderBy: { order: 'asc' },
    });
  },

  async getSubtaskById(subtaskId: string) {
    return prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: subtaskInclude,
    });
  },

  async createSubtask(taskId: string, data: CreateSubtaskInput) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    if (data.assigneeId) {
      const membership = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId: task.projectId,
            userId: data.assigneeId,
          },
        },
      });
      if (!membership) {
        throw ApiError.notFound('Assignee is not a member of this project');
      }
    }

    const maxOrder = await prisma.subtask.aggregate({
      where: { taskId },
      _max: { order: true },
    });

    return prisma.subtask.create({
      data: {
        taskId,
        title: data.title,
        description: data.description,
        status: data.status,
        assigneeId: data.assigneeId,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        order: (maxOrder._max.order ?? -1) + 1,
      },
      include: subtaskInclude,
    });
  },

  async updateSubtask(subtaskId: string, projectId: string, data: UpdateSubtaskInput) {
    const subtask = await prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: { task: true },
    });

    if (!subtask) {
      throw ApiError.notFound('Subtask not found');
    }

    // Verify subtask belongs to this project (IDOR protection)
    if (subtask.task.projectId !== projectId) {
      throw ApiError.notFound('Subtask not found in this project');
    }

    if (data.assigneeId) {
      const membership = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId: data.assigneeId,
          },
        },
      });
      if (!membership) {
        throw ApiError.notFound('Assignee is not a member of this project');
      }
    }

    const updateData: Record<string, unknown> = {};

    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.assigneeId !== undefined) updateData.assigneeId = data.assigneeId;
    if (data.dueDate !== undefined) {
      updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    }

    return prisma.subtask.update({
      where: { id: subtaskId },
      data: updateData,
      include: subtaskInclude,
    });
  },

  async deleteSubtask(subtaskId: string, projectId: string) {
    const subtask = await prisma.subtask.findUnique({
      where: { id: subtaskId },
      include: { task: true },
    });

    if (!subtask) {
      throw ApiError.notFound('Subtask not found');
    }

    // Verify subtask belongs to this project (IDOR protection)
    if (subtask.task.projectId !== projectId) {
      throw ApiError.notFound('Subtask not found in this project');
    }

    await prisma.subtask.delete({
      where: { id: subtaskId },
    });
  },

  async reorderSubtasks(taskId: string, subtaskIds: string[]) {
    const existingSubtasks = await prisma.subtask.findMany({
      where: { taskId },
      select: { id: true },
    });

    const existingIds = new Set(existingSubtasks.map((s) => s.id));
    for (const id of subtaskIds) {
      if (!existingIds.has(id)) {
        throw ApiError.badRequest(`Subtask ${id} does not belong to this task`);
      }
    }

    await prisma.$transaction(
      subtaskIds.map((id, index) =>
        prisma.subtask.update({
          where: { id },
          data: { order: index },
        })
      )
    );

    return this.getTaskSubtasks(taskId);
  },

  async getSubtaskCountForTask(taskId: string): Promise<{ total: number; completed: number }> {
    const [total, completed] = await Promise.all([
      prisma.subtask.count({ where: { taskId } }),
      prisma.subtask.count({ where: { taskId, status: 'COMPLETE' } }),
    ]);
    return { total, completed };
  },
};
