import { Request, Response } from 'express';
import { auditService } from './audit.service';
import { queryAuditLogSchema } from './audit.validators';

/**
 * Safely extract a string parameter from req.params
 * Express params can be string | string[] depending on route config
 */
function getParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] || '';
  }
  return value || '';
}

export const auditController = {
  /**
   * GET /projects/:id/audit-logs
   * Query audit logs for a project (ADMIN/OWNER only)
   */
  async queryLogs(req: Request, res: Response) {
    const projectId = getParam(req.params.id);

    const query = queryAuditLogSchema.parse(req.query);
    const { logs, total } = await auditService.queryLogs(projectId, query);

    res.json({
      logs,
      pagination: {
        total,
        limit: query.limit,
        offset: query.offset,
        hasMore: query.offset + logs.length < total,
      },
    });
  },

  /**
   * GET /projects/:id/audit-logs/resource/:resourceType/:resourceId
   * Get audit logs for a specific resource
   */
  async getResourceLogs(req: Request, res: Response) {
    const projectId = getParam(req.params.id);
    const resourceType = getParam(req.params.resourceType);
    const resourceId = getParam(req.params.resourceId);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const logs = await auditService.getResourceLogs(
      projectId,
      resourceType as Parameters<typeof auditService.getResourceLogs>[1],
      resourceId,
      Math.min(limit, 100)
    );

    res.json({ logs });
  },

  /**
   * GET /projects/:id/audit-logs/user/:userId
   * Get audit logs for a specific user's activity
   */
  async getUserActivity(req: Request, res: Response) {
    const projectId = getParam(req.params.id);
    const userId = getParam(req.params.userId);
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

    const logs = await auditService.getUserActivity(
      projectId,
      userId,
      Math.min(limit, 100)
    );

    res.json({ logs });
  },
};
