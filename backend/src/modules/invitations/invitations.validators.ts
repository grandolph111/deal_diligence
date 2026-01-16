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

export type MemberPermissions = z.infer<typeof memberPermissionsSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
export type CancelInvitationInput = z.infer<typeof cancelInvitationSchema>;
export type ListPendingInvitationsQuery = z.infer<typeof listPendingInvitationsQuerySchema>;
