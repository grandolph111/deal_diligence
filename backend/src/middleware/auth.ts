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
export const requireAuth = [validateJwt, attachUser];
