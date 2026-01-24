import { z } from 'zod';

export const projectRoleEnum = z.enum(['ADMIN', 'MEMBER', 'VIEWER']);

export const memberPermissionsSchema = z.object({
  canAccessKanban: z.boolean().optional(),
  canAccessVDR: z.boolean().optional(),
  canUploadDocs: z.boolean().optional(),
  restrictedToTags: z.array(z.string()).optional(),
});

export const acceptInvitationSchema = z.object({
  token: z.string().uuid('Invalid invitation token'),
});

export const cancelInvitationSchema = z.object({
  invitationId: z.string().uuid('Invalid invitation ID'),
});

export const listPendingInvitationsQuerySchema = z.object({
  projectId: z.string().uuid('Invalid project ID').optional(),
});

// Create invitation schema
export const createInvitationSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: projectRoleEnum,
  permissions: memberPermissionsSchema.optional(),
});

export type MemberPermissions = z.infer<typeof memberPermissionsSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type CancelInvitationInput = z.infer<typeof cancelInvitationSchema>;
export type ListPendingInvitationsQuery = z.infer<typeof listPendingInvitationsQuerySchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
