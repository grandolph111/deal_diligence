import { auth } from 'express-oauth2-jwt-bearer';
import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { verifySessionToken, devAuthAllowed } from '../utils/session-token';

// Auth0 JWT validation middleware
export const validateJwt = auth({
  audience: config.auth0.audience,
  issuerBaseURL: config.auth0.issuerBaseUrl,
  tokenSigningAlg: 'RS256',
});

/**
 * Accept a signed session token, a real Auth0 JWT, or — only behind an explicit
 * opt-in — the legacy unsigned dev token.
 *
 * The legacy `mock-dev-token-<userId>` format is a user id with a prefix, and
 * user ids are freely readable from member lists and task assignees. Accepting
 * it unconditionally meant anyone could authenticate as any user, including the
 * platform super-admin, with no password. It now requires ALLOW_DEV_AUTH=true,
 * which is never inferred from NODE_ENV — production runs NODE_ENV=development,
 * so an environment check would have left the bypass open exactly where it
 * mattered.
 */
const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next(ApiError.unauthorized('Missing authorization header'));
  }

  const token = authHeader.replace('Bearer ', '');

  // Signed credential session (POST /auth/dev-login).
  const claims = verifySessionToken(token);
  if (claims) {
    req.auth = {
      payload: { sub: `dev|user-id:${claims.userId}`, aud: config.auth0.audience },
    };
    return next();
  }

  if (token.startsWith('mock-dev-token-')) {
    if (!devAuthAllowed()) {
      return next(ApiError.unauthorized('Invalid or expired session'));
    }
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

/** @deprecated name retained for callers; use `authenticate`. */
const validateMockJwt = authenticate;

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
