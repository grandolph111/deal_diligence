import { Router } from 'express';
import { documentsController } from './documents.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requireMinRole,
  requirePermission,
} from '../../middleware/permissions';

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(requireAuth);

// Load project membership for all routes
router.use(loadProjectMembership);

// GET /api/v1/projects/:projectId/documents - List documents
router.get('/', documentsController.listDocuments);

// GET /api/v1/projects/:projectId/documents/:documentId - Get document
router.get('/:documentId', documentsController.getDocument);

// POST /api/v1/projects/:projectId/documents/initiate-upload - Initiate upload
router.post(
  '/initiate-upload',
  requirePermission('canUploadDocs'),
  documentsController.initiateUpload
);

// POST /api/v1/projects/:projectId/documents/initiate-multiple-uploads - Initiate multiple uploads
router.post(
  '/initiate-multiple-uploads',
  requirePermission('canUploadDocs'),
  documentsController.initiateMultipleUploads
);

// POST /api/v1/projects/:projectId/documents/confirm-upload - Confirm upload
router.post(
  '/confirm-upload',
  requirePermission('canUploadDocs'),
  documentsController.confirmUpload
);

// POST /api/v1/projects/:projectId/documents/confirm-multiple-uploads - Confirm multiple uploads
router.post(
  '/confirm-multiple-uploads',
  requirePermission('canUploadDocs'),
  documentsController.confirmMultipleUploads
);

// DELETE /api/v1/projects/:projectId/documents/:documentId - Delete document
router.delete(
  '/:documentId',
  requireMinRole('ADMIN'),
  documentsController.deleteDocument
);

export default router;
