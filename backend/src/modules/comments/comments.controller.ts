import { Request, Response } from 'express';
import { commentsService } from './comments.service';
import { createCommentSchema, updateCommentSchema } from './comments.validators';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

export const commentsController = {
  listComments: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params as Record<string, string>;

    const comments = await commentsService.getTaskComments(taskId);
    res.json(comments);
  }),

  createComment: asyncHandler(async (req: Request, res: Response) => {
    const { taskId } = req.params as Record<string, string>;

    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const data = createCommentSchema.parse(req.body);
    const comment = await commentsService.createComment(taskId, req.user.id, data);

    res.status(201).json(comment);
  }),

  updateComment: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, commentId } = req.params as Record<string, string>;

    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const data = updateCommentSchema.parse(req.body);
    const comment = await commentsService.updateComment(
      commentId,
      req.user.id,
      projectId,
      data
    );

    res.json(comment);
  }),

  deleteComment: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, commentId } = req.params as Record<string, string>;

    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const membership = req.projectMember;
    const isAdmin = membership?.role === 'OWNER' || membership?.role === 'ADMIN';

    await commentsService.deleteComment(commentId, req.user.id, projectId, isAdmin);

    res.status(204).send();
  }),
};
