import { Router } from 'express';
import { searchController } from './search.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requirePermission,
} from '../../middleware/permissions';
import { asyncHandler } from '../../utils/asyncHandler';

// mergeParams allows access to :id from parent router
const router = Router({ mergeParams: true });

// All routes require authentication and project membership
router.use(requireAuth);
router.use(loadProjectMembership);

// ============================================
// SEARCH OPERATIONS
// ============================================

// POST /api/v1/projects/:id/search - Search documents
// Supports keyword, semantic, and hybrid search
// Body: { query, searchType?, folderIds?, documentTypes?, dateFrom?, dateTo?, page?, limit? }
router.post(
  '/',
  requirePermission('canAccessVDR'),
  asyncHandler(searchController.search)
);

// POST /api/v1/projects/:id/search/similar/:documentId - Find similar documents
// Uses semantic similarity search to find related documents
router.post(
  '/similar/:documentId',
  requirePermission('canAccessVDR'),
  asyncHandler(searchController.findSimilar)
);

export default router;
