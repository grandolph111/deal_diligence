import { Request, Response } from 'express';
import { tasksService } from './tasks.service';
import {
  createTaskSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  taskFiltersSchema,
} from './tasks.validators';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

export const tasksController = {
  /**
   * GET /projects/:id/tasks
   * List all tasks with optional filters
   */
  listTasks: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params;
    const filters = taskFiltersSchema.parse(req.query);

    const tasks = await tasksService.getProjectTasks(projectId, filters);

    res.json({
      status: 'success',
      data: { tasks },
    });
  }),

  /**
   * GET /projects/:id/tasks/board
   * Get tasks grouped by status for Kanban board
   */
  getBoard: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params;

    const board = await tasksService.getTasksByStatus(projectId);

    res.json({
      status: 'success',
      data: { board },
    });
  }),

  /**
   * GET /projects/:id/tasks/:taskId
   * Get a single task
   */
  getTask: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;

    const task = await tasksService.getTaskById(taskId);

    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    res.json({
      status: 'success',
      data: { task },
    });
  }),

  /**
   * POST /projects/:id/tasks
   * Create a new task
   */
  createTask: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params;

    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const data = createTaskSchema.parse(req.body);
    const task = await tasksService.createTask(projectId, req.user.id, data);

    // Fetch the full task with relations
    const fullTask = await tasksService.getTaskById(task.id);

    res.status(201).json({
      status: 'success',
      data: { task: fullTask },
    });
  }),

  /**
   * PATCH /projects/:id/tasks/:taskId
   * Update a task
   */
  updateTask: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;

    const data = updateTaskSchema.parse(req.body);
    await tasksService.updateTask(taskId, data);

    // Fetch updated task with relations
    const task = await tasksService.getTaskById(taskId);

    res.json({
      status: 'success',
      data: { task },
    });
  }),

  /**
   * PATCH /projects/:id/tasks/:taskId/status
   * Update task status (for drag-and-drop)
   */
  updateTaskStatus: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;

    const { status } = updateTaskStatusSchema.parse(req.body);
    await tasksService.updateTaskStatus(taskId, status);

    // Fetch updated task with relations
    const task = await tasksService.getTaskById(taskId);

    res.json({
      status: 'success',
      data: { task },
    });
  }),

  /**
   * DELETE /projects/:id/tasks/:taskId
   * Delete a task
   */
  deleteTask: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;

    await tasksService.deleteTask(taskId);

    res.json({
      status: 'success',
      message: 'Task deleted successfully',
    });
  }),

  /**
   * POST /projects/:id/tasks/:taskId/assignees
   * Add an assignee to a task
   */
  addAssignee: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      throw ApiError.badRequest('userId is required');
    }

    const assignee = await tasksService.addAssignee(taskId, userId);

    res.status(201).json({
      status: 'success',
      data: { assignee: assignee.user },
    });
  }),

  /**
   * DELETE /projects/:id/tasks/:taskId/assignees/:userId
   * Remove an assignee from a task
   */
  removeAssignee: asyncHandler(async (req: Request, res: Response) => {
    const { taskId, userId } = req.params;

    await tasksService.removeAssignee(taskId, userId);

    res.json({
      status: 'success',
      message: 'Assignee removed successfully',
    });
  }),

  /**
   * POST /projects/:id/tasks/:taskId/tags
   * Add a tag to a task
   */
  addTag: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;
    const { tagId } = req.body;

    if (!tagId) {
      throw ApiError.badRequest('tagId is required');
    }

    await tasksService.addTag(taskId, tagId);

    res.status(201).json({
      status: 'success',
      message: 'Tag added successfully',
    });
  }),

  /**
   * DELETE /projects/:id/tasks/:taskId/tags/:tagId
   * Remove a tag from a task
   */
  removeTag: asyncHandler(async (req: Request, res: Response) => {
    const { taskId, tagId } = req.params;

    await tasksService.removeTag(taskId, tagId);

    res.json({
      status: 'success',
      message: 'Tag removed successfully',
    });
  }),

  /**
   * GET /projects/:id/tags
   * Get all tags for a project
   */
  listTags: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params;

    const tags = await tasksService.getProjectTags(projectId);

    res.json({
      status: 'success',
      data: {
        tags: tags.map((t) => ({
          ...t,
          taskCount: t._count.tasks,
        })),
      },
    });
  }),

  /**
   * POST /projects/:id/tags
   * Create a new tag
   */
  createTag: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params;
    const { name, color } = req.body;

    if (!name) {
      throw ApiError.badRequest('name is required');
    }

    const tag = await tasksService.createTag(projectId, name, color);

    res.status(201).json({
      status: 'success',
      data: { tag },
    });
  }),

  /**
   * DELETE /projects/:id/tags/:tagId
   * Delete a tag
   */
  deleteTag: asyncHandler(async (req: Request, res: Response) => {
    const { tagId } = req.params;

    await tasksService.deleteTag(tagId);

    res.json({
      status: 'success',
      message: 'Tag deleted successfully',
    });
  }),
};
