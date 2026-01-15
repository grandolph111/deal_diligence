import { Request, Response } from 'express';
import { authService } from './auth.service';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

export const authController = {
  /**
   * GET /auth/me
   * Get current user (creates if first login)
   */
  getMe: asyncHandler(async (req: Request, res: Response) => {
    const auth0Id = req.auth?.payload.sub;
    const email = req.auth?.payload.email as string | undefined;
    const name = req.auth?.payload.name as string | undefined;
    const picture = req.auth?.payload.picture as string | undefined;

    if (!auth0Id) {
      throw ApiError.unauthorized('No user identifier in token');
    }

    const user = await authService.findOrCreateUser({
      sub: auth0Id,
      email,
      name,
      picture,
    });

    res.json({
      status: 'success',
      data: { user },
    });
  }),

  /**
   * PATCH /users/me
   * Update current user profile
   */
  updateMe: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const { name, avatarUrl } = req.body;

    const user = await authService.updateUser(req.user.id, {
      name,
      avatarUrl,
    });

    res.json({
      status: 'success',
      data: { user },
    });
  }),
};
