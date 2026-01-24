import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../utils/ApiError';
import { config } from '../config';

interface ErrorResponse {
  status: 'error';
  message: string;
  error: string;  // Alias for message for API compatibility
  code?: string;
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  let statusCode = 500;
  let message = 'Internal server error';
  let code: string | undefined;

  // Handle ApiError
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
  }

  // Handle Prisma errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        statusCode = 409;
        message = 'A record with this value already exists';
        code = 'DUPLICATE_ENTRY';
        break;
      case 'P2025':
        statusCode = 404;
        message = 'Record not found';
        code = 'NOT_FOUND';
        break;
      case 'P2003':
        statusCode = 400;
        message = 'Invalid reference - related record not found';
        code = 'INVALID_REFERENCE';
        break;
      default:
        code = err.code;
    }
  }

  // Handle Auth0/JWT errors
  if (err.name === 'UnauthorizedError' || err.name === 'InvalidTokenError') {
    statusCode = 401;
    message = 'Invalid or expired token';
    code = 'INVALID_TOKEN';
  }

  // Handle validation errors (from Zod)
  if (err.name === 'ZodError') {
    statusCode = 400;
    message = 'Validation error';
    code = 'VALIDATION_ERROR';
  }

  // Log error server-side only (never expose stack to client)
  if (config.isDev) {
    console.error('Error:', {
      message: err.message,
      stack: err.stack,
      statusCode,
      requestId: (req as Request & { requestId?: string }).requestId,
    });
  }

  const response: ErrorResponse = {
    status: 'error',
    message,
    error: message,  // Alias for compatibility
    code,
  };

  // Never include stack trace in response, even in development
  res.status(statusCode).json(response);
};

// 404 handler for unknown routes
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    status: 'error',
    message: `Route ${req.method} ${req.path} not found`,
    code: 'ROUTE_NOT_FOUND',
  });
};
