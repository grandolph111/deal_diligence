import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { dashboardService } from './dashboard.service';

export const dashboardController = {
  getDashboard: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    if (!req.user) throw ApiError.unauthorized('User not found');
    const dashboard = await dashboardService.getProjectDashboard(
      projectId,
      req.user.id
    );
    res.json(dashboard);
  }),
};
