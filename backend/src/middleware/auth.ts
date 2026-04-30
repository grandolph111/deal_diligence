import { auth } from 'express-oauth2-jwt-bearer';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';

// Auth0 JWT validation middleware
export const validateJwt = auth({
  audience: config.auth0.audience,
  issuerBaseURL: config.auth0.issuerBaseUrl,
  tokenSigningAlg: 'RS256',
});

// Mock JWT validation for development
const validateMockJwt = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(ApiError.unauthorized('Missing authorization header'));
  }

  const token = authHeader.replace('Bearer ', '');

  // Check if it's a mock token. Prefix:`mock-dev-token-<userId>`
  // emitted by POST /auth/dev-login. The old format (no suffix, just a
  // timestamp) is treated as the legacy single-dev-user fallback.
  if (token.startsWith('mock-dev-token-')) {
    const suffix = token.substring('mock-dev-token-'.length);
    const looksLikeUserId = /^[0-9a-f-]{8,}$/i.test(suffix);
    req.auth = {
      payload: {
        sub: looksLikeUserId ? `dev|user-id:${suffix}` : 'dev_user|mock',
        aud: config.auth0.audience,
      },
    };
    return next();
  }

  // Otherwise try real Auth0 validation
  validateJwt(req, res, next);
};

// Attach user to request after JWT validation
export const attachUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const auth0Id = req.auth?.payload.sub;

    if (!auth0Id) {
      throw ApiError.unauthorized('No user identifier in token');
    }

    // Dev-creds login: token carries a real user id from the seeded table.
    if (auth0Id.startsWith('dev|user-id:')) {
      const userId = auth0Id.substring('dev|user-id:'.length);
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) {
        throw ApiError.unauthorized('Dev user not found');
      }
      req.user = user;
      return next();
    }

    // Check if it's a mock user
    if (auth0Id === 'dev_user|mock') {
      // Create or get mock user
      let user = await prisma.user.findUnique({
        where: { auth0Id },
      });

      if (!user) {
        user = await prisma.user.create({
          data: {
            auth0Id,
            email: 'dev@example.com',
            name: 'Dev User',
          },
        });
      }

      req.user = user;
      return next();
    }

    const user = await prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) {
      // User will be created via /auth/me endpoint on first request
      // For now, just continue without user attached
      return next();
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

// Combined middleware for routes that require authentication
export const requireAuth = [validateMockJwt, attachUser];
