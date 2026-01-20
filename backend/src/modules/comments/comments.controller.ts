import { Request, Response } from 'express';
import { commentsService } from './comments.service';
import { createCommentSchema, updateCommentSchema } from './comments.validators';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

export const commentsController = {
  listComments: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;

    const comments = await commentsService.getTaskComments(taskId);
    res.json(comments);
  }),

  createComment: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params;

    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const data = createCommentSchema.parse(req.body);
    const comment = await commentsService.createComment(taskId, req.user.id, data);

    res.status(201).json(comment);
  }),

  updateComment: asyncHandler(async (req: Request, res: Response) => {
    const { commentId } = req.params;

    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const data = updateCommentSchema.parse(req.body);
    const comment = await commentsService.updateComment(commentId, req.user.id, data);

    res.json(comment);
  }),

  deleteComment: asyncHandler(async (req: Request, res: Response) => {
    const { commentId } = req.params;

    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const membership = req.projectMember;
    const isAdmin = membership?.role === 'OWNER' || membership?.role === 'ADMIN';

    await commentsService.deleteComment(commentId, req.user.id, isAdmin);

    res.status(204).send();
  }),
};
