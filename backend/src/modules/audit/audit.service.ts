import { prisma } from '../../config/database';
import { AuditLog, Prisma } from '@prisma/client';

type AuditLogWithUser = Prisma.AuditLogGetPayload<{
  include: { user: { select: { id: true; name: true; email: true } } };
}>;
import { Request } from 'express';
import {
  CreateAuditLogInput,
  QueryAuditLogInput,
  AuditAction,
  AuditResourceType,
  AuditActionType,
  AuditResourceTypeValue,
} from './audit.validators';

/**
 * Extract client IP address from request
 * Handles proxies via X-Forwarded-For header
 */
function getClientIp(req: Request): string | undefined {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
    return ips.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || undefined;
}

/**
 * Extract user agent from request
 */
function getUserAgent(req: Request): string | undefined {
  return req.headers['user-agent'] || undefined;
}

export const auditService = {
  /**
   * Create a raw audit log entry
   */
  async createLog(input: CreateAuditLogInput): Promise<AuditLog> {
    return prisma.auditLog.create({
      data: {
        projectId: input.projectId,
        userId: input.userId,
        action: input.action,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        metadata: input.metadata as Prisma.InputJsonValue,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      },
    });
  },

  /**
   * Create an audit log entry from a request context
   * Automatically extracts IP address and user agent
   */
  async logFromRequest(
    req: Request,
    projectId: string,
    action: AuditActionType,
    resourceType: AuditResourceTypeValue,
    resourceId?: string,
    metadata?: Record<string, unknown>
  ): Promise<AuditLog | null> {
    const userId = req.user?.id;

    if (!userId) {
      return null;
    }

    return this.createLog({
      projectId,
      userId,
      action,
      resourceType,
      resourceId,
      metadata,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    });
  },

  // =========================================
  // Document audit methods
  // =========================================

  /**
   * Log document upload
   */
  async logDocumentUpload(
    req: Request,
    projectId: string,
    documentId: string,
    metadata?: { fileName?: string; folderId?: string; sizeBytes?: number }
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.DOCUMENT_UPLOAD,
      AuditResourceType.DOCUMENT,
      documentId,
      metadata
    );
  },

  /**
   * Log document download
   */
  async logDocumentDownload(
    req: Request,
    projectId: string,
    documentId: string,
    metadata?: { fileName?: string }
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.DOCUMENT_DOWNLOAD,
      AuditResourceType.DOCUMENT,
      documentId,
      metadata
    );
  },

  /**
   * Log document view (preview/open without download)
   */
  async logDocumentView(
    req: Request,
    projectId: string,
    documentId: string,
    metadata?: { fileName?: string; pageNumber?: number }
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.DOCUMENT_VIEW,
      AuditResourceType.DOCUMENT,
      documentId,
      metadata
    );
  },

  /**
   * Log document deletion
   */
  async logDocumentDelete(
    req: Request,
    projectId: string,
    documentId: string,
    metadata?: { fileName?: string; folderId?: string }
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.DOCUMENT_DELETE,
      AuditResourceType.DOCUMENT,
      documentId,
      metadata
    );
  },

  /**
   * Log document move
   */
  async logDocumentMove(
    req: Request,
    projectId: string,
    documentId: string,
    metadata: { fromFolderId?: string; toFolderId?: string }
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.DOCUMENT_MOVE,
      AuditResourceType.DOCUMENT,
      documentId,
      metadata
    );
  },

  // =========================================
  // Folder audit methods
  // =========================================

  /**
   * Log folder creation
   */
  async logFolderCreate(
    req: Request,
    projectId: string,
    folderId: string,
    metadata?: { name?: string; parentId?: string }
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.FOLDER_CREATE,
      AuditResourceType.FOLDER,
      folderId,
      metadata
    );
  },

  /**
   * Log folder rename
   */
  async logFolderRename(
    req: Request,
    projectId: string,
    folderId: string,
    metadata: { oldName: string; newName: string }
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.FOLDER_RENAME,
      AuditResourceType.FOLDER,
      folderId,
      metadata
    );
  },

  /**
   * Log folder move
   */
  async logFolderMove(
    req: Request,
    projectId: string,
    folderId: string,
    metadata: { fromParentId?: string; toParentId?: string }
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.FOLDER_MOVE,
      AuditResourceType.FOLDER,
      folderId,
      metadata
    );
  },

  /**
   * Log folder deletion
   */
  async logFolderDelete(
    req: Request,
    projectId: string,
    folderId: string,
    metadata?: { name?: string; parentId?: string }
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.FOLDER_DELETE,
      AuditResourceType.FOLDER,
      folderId,
      metadata
    );
  },

  /**
   * Log folder view (access)
   */
  async logFolderView(
    req: Request,
    projectId: string,
    folderId: string,
    metadata?: { name?: string }
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.FOLDER_VIEW,
      AuditResourceType.FOLDER,
      folderId,
      metadata
    );
  },

  // =========================================
  // Search audit methods
  // =========================================

  /**
   * Log search query execution
   */
  async logSearch(
    req: Request,
    projectId: string,
    metadata: {
      query: string;
      filters?: Record<string, unknown>;
      resultCount?: number;
      searchType?: 'keyword' | 'semantic' | 'hybrid';
    }
  ): Promise<AuditLog | null> {
    const action =
      metadata.searchType === 'semantic'
        ? AuditAction.SEARCH_SEMANTIC
        : AuditAction.SEARCH_EXECUTE;

    return this.logFromRequest(req, projectId, action, AuditResourceType.PROJECT, projectId, metadata);
  },

  // =========================================
  // Chat audit methods
  // =========================================

  /**
   * Log chat message
   */
  async logChatMessage(
    req: Request,
    projectId: string,
    conversationId: string,
    metadata: {
      messagePreview?: string;
      citationsCount?: number;
    }
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.CHAT_MESSAGE,
      AuditResourceType.CHAT_CONVERSATION,
      conversationId,
      metadata
    );
  },

  /**
   * Log chat conversation creation
   */
  async logChatConversationCreate(
    req: Request,
    projectId: string,
    conversationId: string
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.CHAT_CONVERSATION_CREATE,
      AuditResourceType.CHAT_CONVERSATION,
      conversationId
    );
  },

  /**
   * Log chat conversation deletion
   */
  async logChatConversationDelete(
    req: Request,
    projectId: string,
    conversationId: string
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.CHAT_CONVERSATION_DELETE,
      AuditResourceType.CHAT_CONVERSATION,
      conversationId
    );
  },

  // =========================================
  // Task-Document linking audit methods
  // =========================================

  /**
   * Log document linked to task
   */
  async logTaskDocumentLink(
    req: Request,
    projectId: string,
    taskId: string,
    metadata: { documentId: string; documentName?: string }
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.TASK_DOCUMENT_LINK,
      AuditResourceType.TASK,
      taskId,
      metadata
    );
  },

  /**
   * Log document unlinked from task
   */
  async logTaskDocumentUnlink(
    req: Request,
    projectId: string,
    taskId: string,
    metadata: { documentId: string; documentName?: string }
  ): Promise<AuditLog | null> {
    return this.logFromRequest(
      req,
      projectId,
      AuditAction.TASK_DOCUMENT_UNLINK,
      AuditResourceType.TASK,
      taskId,
      metadata
    );
  },

  // =========================================
  // Query methods
  // =========================================

  /**
   * Query audit logs for a project
   */
  async queryLogs(
    projectId: string,
    options: QueryAuditLogInput
  ): Promise<{ logs: AuditLogWithUser[]; total: number }> {
    const where: Prisma.AuditLogWhereInput = {
      projectId,
    };

    if (options.action) {
      where.action = options.action;
    }

    if (options.resourceType) {
      where.resourceType = options.resourceType;
    }

    if (options.resourceId) {
      where.resourceId = options.resourceId;
    }

    if (options.userId) {
      where.userId = options.userId;
    }

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        where.createdAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.createdAt.lte = options.endDate;
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: options.limit,
        skip: options.offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  },

  /**
   * Get audit logs for a specific resource
   */
  async getResourceLogs(
    projectId: string,
    resourceType: AuditResourceTypeValue,
    resourceId: string,
    limit = 50
  ): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: {
        projectId,
        resourceType,
        resourceId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  /**
   * Get recent activity for a user in a project
   */
  async getUserActivity(
    projectId: string,
    userId: string,
    limit = 50
  ): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: {
        projectId,
        userId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },
};
