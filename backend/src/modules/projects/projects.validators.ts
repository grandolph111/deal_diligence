import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(2000).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
});

// Invite schema for workflow
const inviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']),
  permissions: z.object({
    canAccessKanban: z.boolean().optional(),
    canAccessVDR: z.boolean().optional(),
    canUploadDocs: z.boolean().optional(),
    restrictedToTags: z.array(z.string()).optional(),
  }).optional(),
});

// Document upload request schema for workflow
const documentUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required').max(255),
  mimeType: z.string().min(1, 'MIME type is required'),
  sizeBytes: z.number().int().positive('File size must be positive'),
  documentType: z.enum([
    'LEGAL',
    'FINANCIAL',
    'TAX',
    'OPERATIONAL',
    'HR',
    'IP',
    'COMMERCIAL',
    'TECHNICAL',
    'OTHER',
  ]).optional(),
});

// Full workflow schema
export const createProjectWorkflowSchema = z.object({
  project: createProjectSchema,
  invites: z.array(inviteSchema).max(100).optional(),
  documents: z.array(documentUploadSchema).max(50).optional(),
});

// Archive project schema
export const archiveProjectSchema = z.object({
  isArchived: z.boolean(),
});

// Transfer ownership schema
export const transferOwnershipSchema = z.object({
  newOwnerId: z.string().uuid('Invalid user ID'),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type CreateProjectWorkflowInput = z.infer<typeof createProjectWorkflowSchema>;
export type InviteInput = z.infer<typeof inviteSchema>;
export type DocumentUploadInput = z.infer<typeof documentUploadSchema>;
export type ArchiveProjectInput = z.infer<typeof archiveProjectSchema>;
export type TransferOwnershipInput = z.infer<typeof transferOwnershipSchema>;
