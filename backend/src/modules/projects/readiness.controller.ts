import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { readinessService } from './readiness.service';

export const readinessController = {
  getReadiness: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    if (!req.user) throw ApiError.unauthorized('User not found');
    const readiness = await readinessService.getProjectReadiness(
      projectId,
      req.user.id
    );
    res.json(readiness);
  }),
};
