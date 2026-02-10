/// <reference path="./types/express.d.ts" />
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import {
  requestIdMiddleware,
  csrfProtection,
  globalRateLimiter,
  authRateLimiter,
} from './middleware/security';

// Import routes
import authRoutes from './modules/auth/auth.routes';
import projectRoutes from './modules/projects/projects.routes';
import memberRoutes from './modules/members/members.routes';
import taskRoutes from './modules/tasks/tasks.routes';
import tagRoutes from './modules/tasks/tags.routes';
import documentRoutes from './modules/documents/documents.routes';
import folderRoutes from './modules/folders/folders.routes';
import { auditRoutes } from './modules/audit/audit.routes';
import invitationRoutes from './modules/invitations/invitations.routes';
import projectInvitationRoutes from './modules/invitations/project-invitations.routes';
import commentRoutes from './modules/comments/comments.routes';
import subtaskRoutes from './modules/subtasks/subtasks.routes';
import taskDocumentsRoutes from './modules/task-documents/task-documents.routes';
import {
  processingWebhookRouter,
  processingProjectRouter,
} from './modules/processing/processing.routes';
import searchRoutes from './modules/search/search.routes';
import {
  documentEntitiesRouter,
  projectEntitiesRouter,
} from './modules/entities/entities.routes';
import {
  documentClassificationRouter,
  projectClassificationRouter,
} from './modules/classification/classification.routes';
import {
  documentClausesRouter,
  projectClausesRouter,
} from './modules/clauses/clauses.routes';
import { masterEntitiesRouter } from './modules/master-entities/master-entities.routes';
import {
  relationshipsRoutes,
  entityRelationshipsRouter,
  documentRelationshipsRouter,
} from './modules/relationships/relationships.routes';
import chatRoutes from './modules/chat/chat.routes';
import mockS3Routes from './routes/mock-s3.routes';

const app = express();

// Request ID middleware - add unique ID to each request for tracing
app.use(requestIdMiddleware);

// Security middleware with enhanced configuration
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

app.use(
  cors({
    origin: config.cors.frontendUrl,
    credentials: true,
  })
);

// Mock S3 routes for development (must be before body parsers to handle raw binary data)
// Only functional when S3 is in mock mode (no real S3 credentials)
app.use('/api/v1/mock-s3', mockS3Routes);

// Body parsing with size limits to prevent DoS
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Global rate limiting
app.use(globalRateLimiter);

// CSRF protection for state-changing requests
app.use(csrfProtection);

// Health check (no auth required, minimal info)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Detailed health check for infrastructure services
app.get('/health/detailed', async (req, res) => {
  const { s3Service } = await import('./services/s3.service');
  const { prisma } = await import('./config/database');

  const health: {
    status: 'ok' | 'degraded' | 'unhealthy';
    timestamp: string;
    services: Record<string, unknown>;
  } = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {},
  };

  // Check database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    health.services.database = { status: 'connected' };
  } catch (error) {
    health.services.database = {
      status: 'disconnected',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    health.status = 'unhealthy';
  }

  // Check S3 status
  const s3Status = await s3Service.getHealthStatus();
  health.services.s3 = s3Status;
  if (!s3Status.connected && s3Status.mode === 'real') {
    health.status = health.status === 'unhealthy' ? 'unhealthy' : 'degraded';
  }

  // Check Python microservice
  try {
    const pythonUrl = config.pythonService?.url || 'http://localhost:8000';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const pythonRes = await fetch(`${pythonUrl}/health`, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (pythonRes.ok) {
      const pythonHealth = (await pythonRes.json()) as { berrydb_configured?: boolean };
      health.services.pythonService = {
        status: 'connected',
        berrydb: pythonHealth.berrydb_configured ? 'configured' : 'not configured',
      };
    } else {
      health.services.pythonService = { status: 'error', code: pythonRes.status };
      health.status = health.status === 'unhealthy' ? 'unhealthy' : 'degraded';
    }
  } catch {
    health.services.pythonService = { status: 'unavailable' };
    health.status = health.status === 'unhealthy' ? 'unhealthy' : 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : health.status === 'degraded' ? 200 : 503;
  res.status(statusCode).json(health);
});

// API routes with appropriate rate limiting
app.use('/api/v1/auth', authRateLimiter, authRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/projects/:id/members', memberRoutes);
app.use('/api/v1/projects/:id/tasks', taskRoutes);
app.use('/api/v1/projects/:id/tags', tagRoutes);
app.use('/api/v1/projects/:id/documents', documentRoutes);
app.use('/api/v1/projects/:id/folders', folderRoutes);
app.use('/api/v1/projects/:id/audit-logs', auditRoutes);
app.use('/api/v1/projects/:id/invitations', projectInvitationRoutes);
app.use('/api/v1/invitations', invitationRoutes);
app.use('/api/v1/projects/:id/tasks/:taskId/comments', commentRoutes);
app.use('/api/v1/projects/:id/tasks/:taskId/subtasks', subtaskRoutes);
app.use('/api/v1/projects/:id/tasks/:taskId/documents', taskDocumentsRoutes);
app.use('/api/v1/processing', processingWebhookRouter);
app.use('/api/v1/projects/:id/processing', processingProjectRouter);
app.use('/api/v1/projects/:id/search', searchRoutes);
app.use('/api/v1/projects/:id/documents/:documentId/entities', documentEntitiesRouter);
app.use('/api/v1/projects/:id/entities', projectEntitiesRouter);
app.use(
  '/api/v1/projects/:id/documents/:documentId/classification',
  documentClassificationRouter
);
app.use('/api/v1/projects/:id/classification', projectClassificationRouter);
app.use(
  '/api/v1/projects/:id/documents/:documentId/clauses',
  documentClausesRouter
);
app.use('/api/v1/projects/:id/clauses', projectClausesRouter);
app.use('/api/v1/projects/:id/master-entities', masterEntitiesRouter);
app.use('/api/v1/projects/:id/relationships', relationshipsRoutes);
app.use(
  '/api/v1/projects/:id/entities/:entityId/relationships',
  entityRelationshipsRouter
);
app.use(
  '/api/v1/projects/:id/documents/:documentId/related',
  documentRelationshipsRouter
);
app.use('/api/v1/projects/:id/chat', chatRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
