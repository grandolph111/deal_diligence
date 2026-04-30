import { Request, Response } from 'express';
import { authService } from './auth.service';
import { updateMeSchema, devLoginSchema } from './auth.validators';
import { changePasswordSchema } from '../companies/companies.validators';
import { companyMembersService } from '../companies/company-members.service';
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
    // Dev-creds path: attachUser has already resolved req.user from the
    // mock-dev-token-<userId> bearer. Return it directly.
    if (req.user) {
      res.json(req.user);
      return;
    }

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

    const data = updateMeSchema.parse(req.body);

    const user = await authService.updateUser(req.user.id, data);

    res.json(user);
  }),

  /**
   * POST /auth/dev-login
   * Hardcoded-creds login for the prototype. Returns a mock bearer token
   * tied to a seeded user + that user's profile so the frontend can route
   * to the right tier (super admin vs. customer admin vs. member).
   */
  devLogin: asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = devLoginSchema.parse(req.body);
    const result = await authService.devLogin(email, password);
    if (!result) {
      throw ApiError.unauthorized('Invalid email or password');
    }
    res.json(result);
  }),

  /**
   * PATCH /auth/me/password
   * Self-service change password (dev-creds prototype).
   */
  changeOwnPassword: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await companyMembersService.changeOwnPassword(
      req.user.id,
      currentPassword,
      newPassword
    );
    res.status(204).end();
  }),
};
