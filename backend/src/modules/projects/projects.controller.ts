import { Request, Response } from 'express';
import { projectsService } from './projects.service';
import { createProjectSchema, updateProjectSchema } from './projects.validators';
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

    res.json({
      status: 'success',
      data: { projects },
    });
  }),

  /**
   * GET /projects/:id
   * Get a single project
   */
  getProject: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    const project = await projectsService.getProjectById(id);

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    res.json({
      status: 'success',
      data: {
        project: {
          ...project,
          memberCount: project._count.members,
          taskCount: project._count.tasks,
          documentCount: project._count.documents,
        },
      },
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

    res.status(201).json({
      status: 'success',
      data: { project },
    });
  }),

  /**
   * PATCH /projects/:id
   * Update a project
   */
  updateProject: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const data = updateProjectSchema.parse(req.body);

    const project = await projectsService.updateProject(id, data);

    res.json({
      status: 'success',
      data: { project },
    });
  }),

  /**
   * DELETE /projects/:id
   * Delete a project (OWNER only)
   */
  deleteProject: asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    await projectsService.deleteProject(id);

    res.json({
      status: 'success',
      message: 'Project deleted successfully',
    });
  }),
};
