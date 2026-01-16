import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

// Import routes
import authRoutes from './modules/auth/auth.routes';
import projectRoutes from './modules/projects/projects.routes';
import memberRoutes from './modules/members/members.routes';
import taskRoutes from './modules/tasks/tasks.routes';
import tagRoutes from './modules/tasks/tags.routes';
import documentRoutes from './modules/documents/documents.routes';
import invitationRoutes from './modules/invitations/invitations.routes';
import projectInvitationRoutes from './modules/invitations/project-invitations.routes';

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: config.cors.frontendUrl,
    credentials: true,
  })
);

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/projects/:id/members', memberRoutes);
app.use('/api/v1/projects/:id/tasks', taskRoutes);
app.use('/api/v1/projects/:id/tags', tagRoutes);
app.use('/api/v1/projects/:id/documents', documentRoutes);
app.use('/api/v1/projects/:id/invitations', projectInvitationRoutes);
app.use('/api/v1/invitations', invitationRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
