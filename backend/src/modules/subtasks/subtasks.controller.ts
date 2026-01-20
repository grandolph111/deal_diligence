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
    const { taskId } = req.params;

    const subtasks = await subtasksService.getTaskSubtasks(taskId);
    res.json(subtasks);
  }),

  createSubtask: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;

    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const data = createSubtaskSchema.parse(req.body);
    const subtask = await subtasksService.createSubtask(taskId, data);

    res.status(201).json(subtask);
  }),

  updateSubtask: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, subtaskId } = req.params;

    const data = updateSubtaskSchema.parse(req.body);
    const subtask = await subtasksService.updateSubtask(subtaskId, projectId, data);

    res.json(subtask);
  }),

  deleteSubtask: asyncHandler(async (req: Request, res: Response) => {
    const { subtaskId } = req.params;

    await subtasksService.deleteSubtask(subtaskId);

    res.status(204).send();
  }),

  reorderSubtasks: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;

    const { subtaskIds } = reorderSubtasksSchema.parse(req.body);
    const subtasks = await subtasksService.reorderSubtasks(taskId, subtaskIds);

    res.json(subtasks);
  }),
};
