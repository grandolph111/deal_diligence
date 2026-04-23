import { Request, Response } from 'express';
import { projectsService } from './projects.service';
import {
  createProjectSchema,
  updateProjectSchema,
  createProjectWorkflowSchema,
  archiveProjectSchema,
  transferOwnershipSchema,
} from './projects.validators';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

export const projectsController = {
  /**
   * GET /projects
   * List all projects for the current user
   */
  listProjects: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const projects = await projectsService.getUserProjects(req.user.id);

    res.json(projects);
  }),

  /**
   * GET /projects/:id
   * Get a single project
   */
  getProject: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as Record<string, string>;

    const project = await projectsService.getProjectById(id);

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    res.json({
      ...project,
      memberCount: project._count.members,
      taskCount: project._count.tasks,
      documentCount: project._count.documents,
    });
  }),

  /**
   * POST /projects
   * Create a new project
   */
  createProject: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const data = createProjectSchema.parse(req.body);
    const project = await projectsService.createProject(data, req.user.id);

    res.status(201).json(project);
  }),

  /**
   * PATCH /projects/:id
   * Update a project
   */
  updateProject: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as Record<string, string>;
    const data = updateProjectSchema.parse(req.body);

    const project = await projectsService.updateProject(id, data);

    res.json(project);
  }),

  /**
   * DELETE /projects/:id
   * Delete a project (OWNER only)
   */
  deleteProject: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as Record<string, string>;

    await projectsService.deleteProject(id);

    res.status(204).send();
  }),

  /**
   * POST /projects/create-workflow
   * Create a project with optional invites and document uploads
   */
  createProjectWorkflow: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const data = createProjectWorkflowSchema.parse(req.body);
    const result = await projectsService.createProjectWorkflow(data, req.user.id);

    res.status(201).json(result);
  }),

  /**
   * POST /projects/:id/archive
   * Archive or unarchive a project (OWNER/ADMIN only)
   */
  archiveProject: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params as Record<string, string>;
    const data = archiveProjectSchema.parse(req.body);

    const project = await projectsService.archiveProject(id, data);

    res.json(project);
  }),

  /**
   * POST /projects/:id/transfer-ownership
   * Transfer project ownership to another member (OWNER only)
   */
  transferOwnership: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const { id } = req.params as Record<string, string>;
    const data = transferOwnershipSchema.parse(req.body);

    await projectsService.transferOwnership(id, req.user.id, data);

    res.json({ message: 'Ownership transferred successfully' });
  }),
};
