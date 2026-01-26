import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';

/**
 * Request ID middleware - adds unique ID to each request for tracing
 */
export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers['x-request-id'] as string) || uuidv4();
  (req as Request & { requestId?: string }).requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
};

/**
 * CSRF protection for state-changing requests
 * Requires X-Requested-With header for non-GET requests
 * This prevents simple form-based CSRF attacks
 */
export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];

  if (safeMethods.includes(req.method)) {
    return next();
  }

  const customHeader = req.headers['x-requested-with'];
  if (customHeader !== 'XMLHttpRequest') {
    return res.status(403).json({
      status: 'error',
      message: 'CSRF validation failed - X-Requested-With header required',
      code: 'CSRF_ERROR',
    });
  }

  next();
};

/**
 * Global rate limiter - applies to all routes
 * Set to 500 requests per 15 minutes to accommodate modern SPA usage
 * (multiple API calls per page, file uploads, etc.)
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Upload rate limiter - more permissive for document uploads
 * Each file upload requires multiple requests (initiate, confirm)
 */
export const uploadRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // allow 200 upload-related requests per 15 minutes
  message: {
    status: 'error',
    message: 'Too many upload requests, please try again later',
    code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for auth-related endpoints
 * Set to 50 requests per 15 minutes to allow for token refreshes
 * and normal app navigation that triggers auth checks
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  message: {
    status: 'error',
    message: 'Too many authentication attempts, please try again later',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for invitation token lookups
 * Slightly increased to allow multiple invitation views
 */
export const invitationRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 15, // limit each IP to 15 requests per minute
  message: {
    status: 'error',
    message: 'Too many requests, please try again later',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
