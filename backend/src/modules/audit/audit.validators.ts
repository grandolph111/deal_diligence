import { z } from 'zod';

/**
 * Audit actions for different resource types
 */
export const AuditAction = {
  // Document actions
  DOCUMENT_UPLOAD: 'document.upload',
  DOCUMENT_DOWNLOAD: 'document.download',
  DOCUMENT_VIEW: 'document.view',
  DOCUMENT_DELETE: 'document.delete',
  DOCUMENT_MOVE: 'document.move',

  // Folder actions
  FOLDER_CREATE: 'folder.create',
  FOLDER_RENAME: 'folder.rename',
  FOLDER_MOVE: 'folder.move',
  FOLDER_DELETE: 'folder.delete',
  FOLDER_VIEW: 'folder.view',

  // Search actions
  SEARCH_EXECUTE: 'search.execute',
  SEARCH_SEMANTIC: 'search.semantic',

  // Chat actions
  CHAT_MESSAGE: 'chat.message',
  CHAT_CONVERSATION_CREATE: 'chat.conversation.create',
  CHAT_CONVERSATION_DELETE: 'chat.conversation.delete',

  // Task-Document linking
  TASK_DOCUMENT_LINK: 'task.document.link',
  TASK_DOCUMENT_UNLINK: 'task.document.unlink',

  // Project actions
  PROJECT_ACCESS: 'project.access',

  // Entity/Annotation actions (Phase 2B/3)
  ANNOTATION_VERIFY: 'annotation.verify',
  ANNOTATION_REJECT: 'annotation.reject',
  ENTITY_MERGE: 'entity.merge',
  ENTITY_SPLIT: 'entity.split',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

export const AuditResourceType = {
  DOCUMENT: 'document',
  FOLDER: 'folder',
  PROJECT: 'project',
  TASK: 'task',
  CHAT_CONVERSATION: 'chat_conversation',
  CHAT_MESSAGE: 'chat_message',
  ANNOTATION: 'annotation',
  ENTITY: 'entity',
} as const;

export type AuditResourceTypeValue = (typeof AuditResourceType)[keyof typeof AuditResourceType];

/**
 * Schema for creating an audit log entry
 */
export const createAuditLogSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  action: z.string(),
  resourceType: z.string(),
  resourceId: z.string().uuid().optional(),
  metadata: z.record(z.unknown()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

export type CreateAuditLogInput = z.infer<typeof createAuditLogSchema>;

/**
 * Schema for querying audit logs
 */
export const queryAuditLogSchema = z.object({
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export type QueryAuditLogInput = z.infer<typeof queryAuditLogSchema>;
