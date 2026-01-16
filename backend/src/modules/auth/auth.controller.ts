import { Request, Response } from 'express';
import { authService } from './auth.service';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

// Auth0 custom claims namespace (must match Auth0 Action)
const AUTH0_NAMESPACE = 'https://api.dealdiligence.ai';

export const authController = {
  /**
   * GET /auth/me
   * Get current user (creates if first login)
   */
  getMe: asyncHandler(async (req: Request, res: Response) => {
    const auth0Id = req.auth?.payload.sub;
    // Read from namespaced custom claims (set by Auth0 Action)
    const email = req.auth?.payload[`${AUTH0_NAMESPACE}/email`] as string | undefined;
    const name = req.auth?.payload[`${AUTH0_NAMESPACE}/name`] as string | undefined;
    const picture = req.auth?.payload[`${AUTH0_NAMESPACE}/picture`] as string | undefined;

    if (!auth0Id) {
      throw ApiError.unauthorized('No user identifier in token');
    }

    const user = await authService.findOrCreateUser({
      sub: auth0Id,
      email,
      name,
      picture,
    });

    res.json(user);
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

    res.json(user);
  }),
};
