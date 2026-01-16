import { z } from 'zod';
import { ProjectRole } from '@prisma/client';

export const inviteMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.nativeEnum(ProjectRole).default(ProjectRole.VIEWER),
  permissions: z
    .object({
      canAccessKanban: z.boolean().default(true),
      canAccessVDR: z.boolean().default(true),
      canUploadDocs: z.boolean().default(true),
      restrictedToTags: z.array(z.string()).optional(),
      restrictedFolders: z.array(z.string()).optional(),
    })
    .optional(),
});

export const updateMemberSchema = z.object({
  role: z.nativeEnum(ProjectRole).optional(),
  permissions: z
    .object({
      canAccessKanban: z.boolean().optional(),
      canAccessVDR: z.boolean().optional(),
      canUploadDocs: z.boolean().optional(),
      restrictedToTags: z.array(z.string()).optional(),
      restrictedFolders: z.array(z.string()).optional(),
    })
    .optional(),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
