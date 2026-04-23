import { prisma } from '../../config/database';
import { Task, TaskStatus, Prisma } from '@prisma/client';
import { CreateTaskInput, UpdateTaskInput, TaskFilters } from './tasks.validators';
import { ApiError } from '../../utils/ApiError';
import { boardsService } from '../../services/boards.service';

/**
 * Verify every document the caller wants to attach to a task is in one of
 * the board's folders. Strict board-folder confinement — tasks never cross
 * board boundaries.
 */
const verifyDocumentsInBoardScope = async (
  projectId: string,
  boardId: string,
  documentIds: string[]
): Promise<void> => {
  if (!documentIds.length) return;
  // Default "All Documents" board covers the whole project, including
  // root-level (folderId=null) docs — no scope check needed.
  const board = await prisma.kanbanBoard.findUnique({
    where: { id: boardId },
    select: { isDefault: true },
  });
  if (board?.isDefault) return;
  const scopeFolderIds = await boardsService.expandedBoardFolderIds(
    boardId,
    projectId
  );
  if (scopeFolderIds.length === 0) return;
  const docs = await prisma.document.findMany({
    where: { id: { in: documentIds }, projectId },
    select: { id: true, name: true, folderId: true },
  });
  const outOfScope = docs.filter(
    (d) => !d.folderId || !scopeFolderIds.includes(d.folderId)
  );
  if (outOfScope.length > 0) {
    throw ApiError.badRequest(
      `Cannot attach ${outOfScope.length} document(s) — outside this board's folder scope: ${outOfScope
        .map((d) => d.name)
        .join(', ')}`
    );
  }
};

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
      comments: true,
      subtasks: true,
    },
  },
};

const taskDetailInclude = {
  ...taskInclude,
  comments: {
    include: {
      author: {
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  subtasks: {
    include: {
      assignee: {
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: { order: 'asc' as const },
  },
};

export const tasksService = {
  /**
   * Verify a task belongs to a project (IDOR protection)
   * @throws ApiError.notFound if task doesn't exist or doesn't belong to project
   */
  async verifyTaskInProject(taskId: string, projectId: string): Promise<Task> {
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId },
    });

    if (!task) {
      throw ApiError.notFound('Task not found in this project');
    }

    return task;
  },

  /**
   * Verify a tag belongs to a project (IDOR protection)
   * @throws ApiError.notFound if tag doesn't exist or doesn't belong to project
   */
  async verifyTagInProject(tagId: string, projectId: string): Promise<void> {
    const tag = await prisma.tag.findFirst({
      where: { id: tagId, projectId },
    });

    if (!tag) {
      throw ApiError.notFound('Tag not found in this project');
    }
  },

  /**
   * Get all tasks for a project with optional filters.
   * Pass `boardId` to scope to a single Kanban board.
   */
  async getProjectTasks(
    projectId: string,
    filters: TaskFilters & { boardId?: string } = {}
  ) {
    const where: Prisma.TaskWhereInput = { projectId };

    if (filters.boardId) {
      where.boardId = filters.boardId;
    }

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
      attachmentCount: task._count.attachments,
      commentCount: task._count.comments,
      subtaskCount: task._count.subtasks,
    }));
  },

  /**
   * Get tasks grouped by status for a Kanban board. Pass `boardId` to
   * scope to a single board (preferred). Omit for project-wide view.
   */
  async getTasksByStatus(projectId: string, boardId?: string) {
    const tasks = await this.getProjectTasks(projectId, { boardId });

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
   * Get a single task by ID with full details (comments, subtasks)
   */
  async getTaskById(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: taskDetailInclude,
    });

    if (!task) return null;

    return {
      ...task,
      attachmentCount: task._count.attachments,
      commentCount: task._count.comments,
      subtaskCount: task._count.subtasks,
    };
  },

  /**
   * Create a new task. `data.boardId` is REQUIRED in practice — if omitted,
   * the task lands on the project's default board.
   */
  async createTask(
    projectId: string,
    creatorId: string,
    data: CreateTaskInput
  ): Promise<Task> {
    const {
      assigneeIds,
      tagIds,
      assignedDate,
      dueDate,
      aiPrompt,
      attachedDocumentIds,
      boardId: explicitBoardId,
      ...taskData
    } = data;

    // Resolve boardId: explicit → validate in project; otherwise use default board.
    let boardId = explicitBoardId;
    if (boardId) {
      const board = await prisma.kanbanBoard.findFirst({
        where: { id: boardId, projectId },
        select: { id: true },
      });
      if (!board) {
        throw ApiError.badRequest('Board not found in this project');
      }
    } else {
      const defaultBoard = await prisma.kanbanBoard.findFirst({
        where: { projectId, isDefault: true },
        select: { id: true },
      });
      if (!defaultBoard) {
        throw ApiError.internal(
          'Project has no default Kanban board. Contact an admin.'
        );
      }
      boardId = defaultBoard.id;
    }

    // Enforce: attached documents must be within this board's folder scope.
    if (attachedDocumentIds && attachedDocumentIds.length > 0) {
      await verifyDocumentsInBoardScope(projectId, boardId, attachedDocumentIds);
    }

    const task = await prisma.task.create({
      data: {
        ...taskData,
        projectId,
        boardId,
        createdById: creatorId,
        assignedDate: assignedDate ? new Date(assignedDate) : null,
        dueDate: dueDate ? new Date(dueDate) : null,
        aiPrompt: aiPrompt ?? null,
        aiStatus: aiPrompt ? 'IDLE' : null,
        assignees: assigneeIds?.length
          ? { create: assigneeIds.map((userId) => ({ userId })) }
          : undefined,
        tags: tagIds?.length
          ? { create: tagIds.map((tagId) => ({ tagId })) }
          : undefined,
        attachments:
          attachedDocumentIds && attachedDocumentIds.length > 0
            ? {
                create: attachedDocumentIds.map((documentId) => ({
                  documentId,
                })),
              }
            : undefined,
      },
    });

    // eslint-disable-next-line no-console
    console.log(
      `[kanban] task created id=${task.id.slice(0, 8)} board=${boardId.slice(
        0,
        8
      )} project=${projectId.slice(0, 8)} title="${task.title.slice(0, 60)}" ` +
        `ai=${aiPrompt ? 'yes' : 'no'} attachments=${attachedDocumentIds?.length ?? 0}`
    );

    return task;
  },

  /**
   * Update a task
   */
  async updateTask(taskId: string, data: UpdateTaskInput): Promise<Task> {
    const { assignedDate, dueDate, attachedDocumentIds, aiPrompt, ...rest } = data;

    const updateData: Prisma.TaskUpdateInput = { ...rest };

    if (assignedDate !== undefined) {
      updateData.assignedDate = assignedDate ? new Date(assignedDate) : null;
    }

    if (dueDate !== undefined) {
      updateData.dueDate = dueDate ? new Date(dueDate) : null;
    }

    if (aiPrompt !== undefined) {
      updateData.aiPrompt = aiPrompt;
      if (aiPrompt && aiPrompt.length > 0) {
        const current = await prisma.task.findUnique({
          where: { id: taskId },
          select: { aiStatus: true },
        });
        if (!current?.aiStatus) updateData.aiStatus = 'IDLE';
      }
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
    });

    // Replace attachments if provided. Enforce board-folder confinement.
    if (attachedDocumentIds !== undefined) {
      if (attachedDocumentIds.length > 0) {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          select: { projectId: true, boardId: true },
        });
        if (task?.boardId) {
          await verifyDocumentsInBoardScope(
            task.projectId,
            task.boardId,
            attachedDocumentIds
          );
        }
      }
      await prisma.taskAttachment.deleteMany({ where: { taskId } });
      if (attachedDocumentIds.length > 0) {
        await prisma.taskAttachment.createMany({
          data: attachedDocumentIds.map((documentId) => ({
            taskId,
            documentId,
          })),
          skipDuplicates: true,
        });
      }
    }

    return updated;
  },

  /**
   * Update task status (for drag-and-drop)
   */
  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
    const task = await prisma.task.update({
      where: { id: taskId },
      data: { status },
    });
    // eslint-disable-next-line no-console
    console.log(
      `[kanban] task ${taskId.slice(0, 8)} status → ${status}`
    );
    return task;
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
   * Get a task with raw assignees structure (for API responses that need nested user)
   */
  async getTaskWithRawAssignees(taskId: string) {
    return prisma.task.findUnique({
      where: { id: taskId },
      include: taskInclude,
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
      throw ApiError.notFound('User is not a member of this project');
    }

    // Check if assignee already exists
    const existing = await prisma.taskAssignee.findUnique({
      where: { taskId_userId: { taskId, userId } },
    });
    if (existing) {
      throw ApiError.conflict('User is already assigned to this task');
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
    // Verify tag exists
    const tag = await prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag) {
      throw ApiError.notFound('Tag not found');
    }

    // Check if tag is already on task
    const existing = await prisma.taskTag.findUnique({
      where: { taskId_tagId: { taskId, tagId } },
    });
    if (existing) {
      throw ApiError.conflict('Tag is already added to this task');
    }

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
    // Check for duplicate tag name in the same project
    const existing = await prisma.tag.findFirst({
      where: { projectId, name },
    });
    if (existing) {
      throw ApiError.conflict('A tag with this name already exists in the project');
    }

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
