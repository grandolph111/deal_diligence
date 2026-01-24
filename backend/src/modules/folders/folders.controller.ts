import { Request, Response } from 'express';
import { foldersService } from './folders.service';
import {
  createFolderSchema,
  updateFolderSchema,
  moveFolderSchema,
} from './folders.validators';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

export const foldersController = {
  /**
   * GET /projects/:id/folders
   * List all folders as a tree structure
   */
  listFolders: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const { format } = req.query;

    if (format === 'flat') {
      const folders = await foldersService.getProjectFolders(projectId);
      res.json(folders);
    } else {
      const tree = await foldersService.getProjectFolderTree(projectId);
      res.json(tree);
    }
  }),

  /**
   * GET /projects/:id/folders/:folderId
   * Get a single folder with its children
   */
  getFolder: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const folderId = req.params.folderId as string;

    // Verify folder belongs to this project (IDOR protection)
    await foldersService.verifyFolderInProject(folderId, projectId);

    const folder = await foldersService.getFolderById(folderId);

    if (!folder) {
      throw ApiError.notFound('Folder not found');
    }

    res.json(folder);
  }),

  /**
   * GET /projects/:id/folders/:folderId/path
   * Get the folder path (breadcrumb) from root to folder
   */
  getFolderPath: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const folderId = req.params.folderId as string;

    // Verify folder belongs to this project (IDOR protection)
    await foldersService.verifyFolderInProject(folderId, projectId);

    const path = await foldersService.getFolderPath(folderId);

    res.json(path);
  }),

  /**
   * POST /projects/:id/folders
   * Create a new folder
   */
  createFolder: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;

    const data = createFolderSchema.parse(req.body);
    const folder = await foldersService.createFolder(projectId, data);

    res.status(201).json(folder);
  }),

  /**
   * PATCH /projects/:id/folders/:folderId
   * Update a folder (rename or change view-only status)
   */
  updateFolder: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const folderId = req.params.folderId as string;

    // Verify folder belongs to this project (IDOR protection)
    await foldersService.verifyFolderInProject(folderId, projectId);

    const data = updateFolderSchema.parse(req.body);

    if (Object.keys(data).length === 0) {
      throw ApiError.badRequest('No fields to update');
    }

    const folder = await foldersService.updateFolder(folderId, data);

    res.json(folder);
  }),

  /**
   * PATCH /projects/:id/folders/:folderId/move
   * Move a folder to a new parent
   */
  moveFolder: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const folderId = req.params.folderId as string;

    // Verify folder belongs to this project (IDOR protection)
    await foldersService.verifyFolderInProject(folderId, projectId);

    const { parentId } = moveFolderSchema.parse(req.body);
    const folder = await foldersService.moveFolder(folderId, projectId, parentId);

    res.json(folder);
  }),

  /**
   * DELETE /projects/:id/folders/:folderId
   * Delete an empty folder
   */
  deleteFolder: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const folderId = req.params.folderId as string;

    // Verify folder belongs to this project (IDOR protection)
    await foldersService.verifyFolderInProject(folderId, projectId);

    await foldersService.deleteFolder(folderId);

    res.status(204).send();
  }),
};
