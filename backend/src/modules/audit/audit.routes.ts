import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { requireAuth } from '../../middleware/auth';
import { loadProjectMembership, requireMinRole } from '../../middleware/permissions';
import { auditController } from './audit.controller';

const router = Router({ mergeParams: true });

// All audit routes require authentication and project membership
router.use(requireAuth);
router.use(loadProjectMembership);

// Audit logs are only accessible to ADMIN and OWNER roles
router.use(requireMinRole('ADMIN'));

/**
 * GET /projects/:id/audit-logs
 * Query audit logs for the project
 * Query params:
 *   - action: Filter by action type
 *   - resourceType: Filter by resource type
 *   - resourceId: Filter by specific resource
 *   - userId: Filter by user
 *   - startDate: Filter by start date
 *   - endDate: Filter by end date
 *   - limit: Number of results (default 50, max 100)
 *   - offset: Pagination offset
 */
router.get('/', asyncHandler(auditController.queryLogs));

/**
 * GET /projects/:id/audit-logs/resource/:resourceType/:resourceId
 * Get audit logs for a specific resource (document, folder, etc.)
 */
router.get(
  '/resource/:resourceType/:resourceId',
  asyncHandler(auditController.getResourceLogs)
);

/**
 * GET /projects/:id/audit-logs/user/:userId
 * Get audit logs for a specific user's activity in the project
 */
router.get('/user/:userId', asyncHandler(auditController.getUserActivity));

export { router as auditRoutes };
