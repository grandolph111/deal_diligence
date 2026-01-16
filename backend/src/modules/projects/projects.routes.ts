import { Router } from 'express';
import { projectsController } from './projects.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireRole,
} from '../../middleware/permissions';

const router = Router();

// All routes require authentication
router.use(requireAuth);

// GET /api/v1/projects - List user's projects
router.get('/', projectsController.listProjects);

// POST /api/v1/projects - Create a new project
router.post('/', projectsController.createProject);

// POST /api/v1/projects/create-workflow - Create project with invites and documents
router.post('/create-workflow', projectsController.createProjectWorkflow);

// Routes that require project membership
router.use('/:id', loadProjectMembership);

// GET /api/v1/projects/:id - Get project details
router.get('/:id', projectsController.getProject);

// PATCH /api/v1/projects/:id - Update project (OWNER, ADMIN only)
router.patch(
  '/:id',
  requireRole('OWNER', 'ADMIN'),
  projectsController.updateProject
);

// DELETE /api/v1/projects/:id - Delete project (OWNER only)
router.delete(
  '/:id',
  requireRole('OWNER'),
  projectsController.deleteProject
);

export default router;
