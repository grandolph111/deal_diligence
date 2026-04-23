import { Request, Response } from 'express';
import { subtasksService } from './subtasks.service';
import {
  createSubtaskSchema,
  updateSubtaskSchema,
  reorderSubtasksSchema,
} from './subtasks.validators';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

export const subtasksController = {
  listSubtasks: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params as Record<string, string>;

    const subtasks = await subtasksService.getTaskSubtasks(taskId);
    res.json(subtasks);
  }),

  createSubtask: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params as Record<string, string>;

    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const data = createSubtaskSchema.parse(req.body);
    const subtask = await subtasksService.createSubtask(taskId, data);

    res.status(201).json(subtask);
  }),

  updateSubtask: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, subtaskId } = req.params as Record<string, string>;

    const data = updateSubtaskSchema.parse(req.body);
    const subtask = await subtasksService.updateSubtask(subtaskId, projectId, data);

    res.json(subtask);
  }),

  deleteSubtask: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, subtaskId } = req.params as Record<string, string>;

    await subtasksService.deleteSubtask(subtaskId, projectId);

    res.status(204).send();
  }),

  reorderSubtasks: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params as Record<string, string>;

    const { subtaskIds } = reorderSubtasksSchema.parse(req.body);
    const subtasks = await subtasksService.reorderSubtasks(taskId, subtaskIds);

    res.json(subtasks);
  }),
};
