import { Request, Response } from 'express';
import { tasksService } from './tasks.service';
import { taskAiService } from './task-ai.service';
import {
  createTaskSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  taskFiltersSchema,
  addAssigneeSchema,
  addTagToTaskSchema,
  createTagSchema,
} from './tasks.validators';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

/**
 * If a status transition moves an AI-enabled task into IN_PROGRESS and it
 * hasn't already produced a report, fire the Claude run in the background.
 */
const maybeTriggerAiRun = async (
  taskId: string,
  actingUserId: string | undefined,
  nextStatus: string | undefined
) => {
  if (nextStatus !== 'IN_PROGRESS' || !actingUserId) return;
  const { prisma } = await import('../../config/database');
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { aiPrompt: true, aiStatus: true, aiReportS3Key: true },
  });
  if (!task?.aiPrompt) {
    // eslint-disable-next-line no-console
    console.log(
      `[task-ai ${taskId.slice(0, 8)}] IN_PROGRESS transition — no aiPrompt, not an AI task`
    );
    return;
  }
  if (task.aiStatus === 'RUNNING') {
    // eslint-disable-next-line no-console
    console.log(
      `[task-ai ${taskId.slice(0, 8)}] IN_PROGRESS transition — already RUNNING, skip`
    );
    return;
  }
  if (task.aiReportS3Key) {
    // eslint-disable-next-line no-console
    console.log(
      `[task-ai ${taskId.slice(0, 8)}] IN_PROGRESS transition — report already exists, skip`
    );
    return;
  }
  // eslint-disable-next-line no-console
  console.log(
    `[task-ai ${taskId.slice(0, 8)}] IN_PROGRESS transition — dispatching AI run`
  );
  taskAiService.runAiTask(taskId, actingUserId).catch((error) => {
    // eslint-disable-next-line no-console
    console.error(
      `[task-ai ${taskId.slice(0, 8)}] unhandled error from runAiTask:`,
      error
    );
  });
};

export const tasksController = {
  /**
   * GET /projects/:id/tasks
   * List all tasks with optional filters
   */
  listTasks: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;
    const filters = taskFiltersSchema.parse(req.query);
    const boardId =
      typeof req.query.boardId === 'string' ? req.query.boardId : undefined;

    const tasks = await tasksService.getProjectTasks(projectId, {
      ...filters,
      boardId,
    });

    res.json(tasks);
  }),

  /**
   * GET /projects/:id/tasks/board?boardId=<uuid>
   * Get tasks grouped by status for a Kanban board. Pass boardId to scope
   * to a specific board (recommended). Without boardId, returns all tasks
   * in the project.
   */
  getBoard: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;
    const boardId =
      typeof req.query.boardId === 'string' ? req.query.boardId : undefined;

    const board = await tasksService.getTasksByStatus(projectId, boardId);

    res.json(board);
  }),

  /**
   * GET /projects/:id/tasks/:taskId
   * Get a single task
   */
  getTask: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, taskId } = req.params as Record<string, string>;

    // Verify task belongs to this project (IDOR protection)
    await tasksService.verifyTaskInProject(taskId, projectId);

    const task = await tasksService.getTaskById(taskId);

    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    res.json(task);
  }),

  /**
   * POST /projects/:id/tasks
   * Create a new task
   */
  createTask: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;

    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const data = createTaskSchema.parse(req.body);
    const task = await tasksService.createTask(projectId, req.user.id, data);

    // Fetch the full task with relations
    const fullTask = await tasksService.getTaskById(task.id);

    res.status(201).json(fullTask);
  }),

  /**
   * PATCH /projects/:id/tasks/:taskId
   * Update a task
   */
  updateTask: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, taskId } = req.params as Record<string, string>;

    // Verify task belongs to this project (IDOR protection)
    await tasksService.verifyTaskInProject(taskId, projectId);

    const data = updateTaskSchema.parse(req.body);
    await tasksService.updateTask(taskId, data);

    await maybeTriggerAiRun(taskId as string, req.user?.id, data.status);

    // Fetch updated task with relations
    const task = await tasksService.getTaskById(taskId);

    res.json(task);
  }),

  /**
   * PATCH /projects/:id/tasks/:taskId/status
   * Update task status (for drag-and-drop)
   */
  updateTaskStatus: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, taskId } = req.params as Record<string, string>;

    // Verify task belongs to this project (IDOR protection)
    await tasksService.verifyTaskInProject(taskId, projectId);

    const { status } = updateTaskStatusSchema.parse(req.body);
    await tasksService.updateTaskStatus(taskId, status);

    await maybeTriggerAiRun(taskId as string, req.user?.id, status);

    // Fetch updated task with relations
    const task = await tasksService.getTaskById(taskId);

    res.json(task);
  }),

  /**
   * GET /projects/:id/tasks/:taskId/ai-report
   * Fetch the AI-generated risk report markdown for a task.
   */
  getAiReport: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, taskId } = req.params as Record<string, string>;
    await tasksService.verifyTaskInProject(taskId, projectId);
    const markdown = await taskAiService.getReportMarkdown(taskId as string);
    if (!markdown) throw ApiError.notFound('No AI report for this task');
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.send(markdown);
  }),

  /**
   * POST /projects/:id/tasks/:taskId/run-ai
   * Trigger the AI run immediately (no drag required).
   */
  runAi: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, taskId } = req.params as Record<string, string>;
    if (!req.user) throw ApiError.unauthorized('User not found');
    await tasksService.verifyTaskInProject(taskId, projectId);
    const { prisma } = await import('../../config/database');
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { aiPrompt: true, aiStatus: true, status: true },
    });
    if (!task?.aiPrompt) throw ApiError.badRequest('Task has no prompt — add one before running.');
    if (task.aiStatus === 'RUNNING') throw ApiError.badRequest('Task is already running.');

    if (task.status === 'TODO') {
      await tasksService.updateTaskStatus(taskId as string, 'IN_PROGRESS');
    }
    // eslint-disable-next-line no-console
    console.log(
      `[task-ai ${taskId.slice(0, 8)}] explicit runAi endpoint — dispatching`
    );
    taskAiService.runAiTask(taskId as string, req.user.id).catch((error) => {
      // eslint-disable-next-line no-console
      console.error(
        `[task-ai ${taskId.slice(0, 8)}] unhandled error from runAiTask:`,
        error
      );
    });
    res.json({ success: true });
  }),

  /**
   * POST /projects/:id/tasks/:taskId/ai-approve
   * Approve the report → move task to COMPLETE.
   */
  approveAi: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, taskId } = req.params as Record<string, string>;
    await tasksService.verifyTaskInProject(taskId, projectId);
    await tasksService.updateTaskStatus(taskId as string, 'COMPLETE');
    const task = await tasksService.getTaskById(taskId as string);
    res.json(task);
  }),

  /**
   * POST /projects/:id/tasks/:taskId/ai-request-changes
   * Reject the draft, clear the report, move back to IN_PROGRESS for re-run.
   */
  requestAiChanges: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, taskId } = req.params as Record<string, string>;
    await tasksService.verifyTaskInProject(taskId, projectId);
    const { prisma } = await import('../../config/database');
    await prisma.task.update({
      where: { id: taskId },
      data: {
        aiStatus: 'IDLE',
        aiReportS3Key: null,
        aiReportSummary: null,
        aiCompletedAt: null,
        aiError: null,
        status: 'IN_PROGRESS',
      },
    });
    const task = await tasksService.getTaskById(taskId as string);
    res.json(task);
  }),

  /**
   * DELETE /projects/:id/tasks/:taskId
   * Delete a task
   */
  deleteTask: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, taskId } = req.params as Record<string, string>;

    // Verify task belongs to this project (IDOR protection)
    await tasksService.verifyTaskInProject(taskId, projectId);

    await tasksService.deleteTask(taskId);

    res.status(204).send();
  }),

  /**
   * POST /projects/:id/tasks/:taskId/assignees
   * Add an assignee to a task
   */
  addAssignee: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, taskId } = req.params as Record<string, string>;

    // Verify task belongs to this project (IDOR protection)
    await tasksService.verifyTaskInProject(taskId, projectId);

    const { userId } = addAssigneeSchema.parse(req.body);

    await tasksService.addAssignee(taskId, userId);

    // Return the task with assignees
    const task = await tasksService.getTaskWithRawAssignees(taskId);

    res.status(201).json(task);
  }),

  /**
   * DELETE /projects/:id/tasks/:taskId/assignees/:userId
   * Remove an assignee from a task
   */
  removeAssignee: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, taskId, userId } = req.params as Record<string, string>;

    // Verify task belongs to this project (IDOR protection)
    await tasksService.verifyTaskInProject(taskId, projectId);

    await tasksService.removeAssignee(taskId, userId);

    res.json({ message: 'Assignee removed successfully' });
  }),

  /**
   * POST /projects/:id/tasks/:taskId/tags
   * Add a tag to a task
   */
  addTag: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, taskId } = req.params as Record<string, string>;

    // Verify task belongs to this project (IDOR protection)
    await tasksService.verifyTaskInProject(taskId, projectId);

    const { tagId } = addTagToTaskSchema.parse(req.body);

    // Verify tag belongs to this project (IDOR protection)
    await tasksService.verifyTagInProject(tagId, projectId);

    await tasksService.addTag(taskId, tagId);

    // Return the task with tags
    const task = await tasksService.getTaskWithRawAssignees(taskId);

    res.status(201).json(task);
  }),

  /**
   * DELETE /projects/:id/tasks/:taskId/tags/:tagId
   * Remove a tag from a task
   */
  removeTag: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, taskId, tagId } = req.params as Record<string, string>;

    // Verify task belongs to this project (IDOR protection)
    await tasksService.verifyTaskInProject(taskId, projectId);

    // Verify tag belongs to this project (IDOR protection)
    await tasksService.verifyTagInProject(tagId, projectId);

    await tasksService.removeTag(taskId, tagId);

    res.json({ message: 'Tag removed successfully' });
  }),

  /**
   * GET /projects/:id/tags
   * Get all tags for a project
   */
  listTags: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;

    const tags = await tasksService.getProjectTags(projectId);

    res.json(
      tags.map((t) => ({
        ...t,
        taskCount: t._count.tasks,
      }))
    );
  }),

  /**
   * POST /projects/:id/tags
   * Create a new tag
   */
  createTag: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;

    const { name, color } = createTagSchema.parse(req.body);

    const tag = await tasksService.createTag(projectId, name, color);

    res.status(201).json(tag);
  }),

  /**
   * DELETE /projects/:id/tags/:tagId
   * Delete a tag
   */
  deleteTag: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, tagId } = req.params as Record<string, string>;

    // Verify tag belongs to this project (IDOR protection)
    await tasksService.verifyTagInProject(tagId, projectId);

    await tasksService.deleteTag(tagId);

    res.status(204).send();
  }),
};
