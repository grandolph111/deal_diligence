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

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
