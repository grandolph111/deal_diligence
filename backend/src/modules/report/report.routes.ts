import { Router } from 'express';
import { reportController } from './report.controller';
import { requireAuth } from '../../middleware/auth';
import {
  loadProjectMembership,
  requirePermission,
  requireMinRole,
} from '../../middleware/permissions';

/**
 * Deal report routes.
 * Mounted at /api/v1/projects/:id/report
 *
 * Reading follows VDR access — the report is a view of the same evidence. Only
 * a MEMBER or above may write a finding: the report is what a client may end up
 * reading, so a VIEWER can read it but never put words in it.
 */
export const reportRoutes = Router({ mergeParams: true });

reportRoutes.use(requireAuth);
reportRoutes.use(loadProjectMembership);

reportRoutes.get('/', requirePermission('canAccessVDR'), reportController.getReport);

reportRoutes.post(
  '/entries',
  requirePermission('canAccessVDR'),
  requireMinRole('MEMBER'),
  reportController.createEntry
);

reportRoutes.patch(
  '/entries/:entryId',
  requirePermission('canAccessVDR'),
  requireMinRole('MEMBER'),
  reportController.updateEntry
);

reportRoutes.delete(
  '/entries/:entryId',
  requirePermission('canAccessVDR'),
  requireMinRole('MEMBER'),
  reportController.deleteEntry
);
