import { Router } from 'express';
import { foldersController } from './folders.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireMinRole,
  requirePermission,
} from '../../middleware/permissions';

// mergeParams allows access to :id from parent router
const router = Router({ mergeParams: true });

// All routes require authentication and project membership
router.use(requireAuth);
router.use(loadProjectMembership);

// ============================================
// FOLDER OPERATIONS
// ============================================

// GET /api/v1/projects/:id/folders - List all folders (tree or flat)
// Query param: ?format=flat for flat list
router.get(
  '/',
  requirePermission('canAccessVDR'),
  foldersController.listFolders
);

// GET /api/v1/projects/:id/folders/:folderId - Get folder details
router.get(
  '/:folderId',
  requirePermission('canAccessVDR'),
  foldersController.getFolder
);

// GET /api/v1/projects/:id/folders/:folderId/path - Get folder breadcrumb path
router.get(
  '/:folderId/path',
  requirePermission('canAccessVDR'),
  foldersController.getFolderPath
);

// POST /api/v1/projects/:id/folders - Create a new folder (OWNER, ADMIN only)
router.post(
  '/',
  requireMinRole('ADMIN'),
  foldersController.createFolder
);

// PATCH /api/v1/projects/:id/folders/:folderId - Rename folder (OWNER, ADMIN only)
router.patch(
  '/:folderId',
  requireMinRole('ADMIN'),
  foldersController.updateFolder
);

// PATCH /api/v1/projects/:id/folders/:folderId/move - Move folder (OWNER, ADMIN only)
router.patch(
  '/:folderId/move',
  requireMinRole('ADMIN'),
  foldersController.moveFolder
);

// DELETE /api/v1/projects/:id/folders/:folderId - Delete empty folder (OWNER, ADMIN only)
router.delete(
  '/:folderId',
  requireMinRole('ADMIN'),
  foldersController.deleteFolder
);

export default router;
