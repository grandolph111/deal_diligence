import { prisma } from '../config/database';

export interface AuditEvent {
  timestamp: Date;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  projectId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  requestId?: string;
  success: boolean;
}

// Audit action types
export const AuditActions = {
  // Auth events
  USER_LOGIN: 'USER_LOGIN',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',

  // Project events
  PROJECT_CREATED: 'PROJECT_CREATED',
  PROJECT_UPDATED: 'PROJECT_UPDATED',
  PROJECT_DELETED: 'PROJECT_DELETED',

  // Member events
  MEMBER_INVITED: 'MEMBER_INVITED',
  MEMBER_JOINED: 'MEMBER_JOINED',
  MEMBER_ROLE_CHANGED: 'MEMBER_ROLE_CHANGED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
  MEMBER_LEFT: 'MEMBER_LEFT',
  OWNERSHIP_TRANSFERRED: 'OWNERSHIP_TRANSFERRED',

  // Task events
  TASK_CREATED: 'TASK_CREATED',
  TASK_UPDATED: 'TASK_UPDATED',
  TASK_DELETED: 'TASK_DELETED',
  TASK_STATUS_CHANGED: 'TASK_STATUS_CHANGED',

  // Document events
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  DOCUMENT_DOWNLOADED: 'DOCUMENT_DOWNLOADED',
  DOCUMENT_DELETED: 'DOCUMENT_DELETED',

  // Invitation events
  INVITATION_CREATED: 'INVITATION_CREATED',
  INVITATION_ACCEPTED: 'INVITATION_ACCEPTED',
  INVITATION_REVOKED: 'INVITATION_REVOKED',

  // Security events
  ACCESS_DENIED: 'ACCESS_DENIED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

export const auditService = {
  /**
   * Log an audit event
   * Currently logs to console with structured JSON
   * TODO: Store in database or send to external logging service in production
   */
  log(event: AuditEvent): void {
    const logEntry = {
      ...event,
      timestamp: event.timestamp.toISOString(),
      level: event.success ? 'info' : 'warn',
    };

    // In production, this should write to a database or external logging service
    // For now, we use structured logging to console
    console.log(JSON.stringify(logEntry));
  },

  /**
   * Log a successful action
   */
  logSuccess(
    action: AuditAction,
    resource: string,
    options: Omit<AuditEvent, 'timestamp' | 'action' | 'resource' | 'success'>
  ): void {
    this.log({
      timestamp: new Date(),
      action,
      resource,
      success: true,
      ...options,
    });
  },

  /**
   * Log a failed action
   */
  logFailure(
    action: AuditAction,
    resource: string,
    options: Omit<AuditEvent, 'timestamp' | 'action' | 'resource' | 'success'>
  ): void {
    this.log({
      timestamp: new Date(),
      action,
      resource,
      success: false,
      ...options,
    });
  },

  /**
   * Get audit logs for a project
   * TODO: Implement when audit table is added to database
   */
  async getProjectAuditLogs(
    projectId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<AuditEvent[]> {
    // Placeholder - will be implemented when audit table is added
    return [];
  },

  /**
   * Get audit logs for a user
   * TODO: Implement when audit table is added to database
   */
  async getUserAuditLogs(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<AuditEvent[]> {
    // Placeholder - will be implemented when audit table is added
    return [];
  },
};
