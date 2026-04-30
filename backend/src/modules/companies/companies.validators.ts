import { z } from 'zod';

export const createCompanySchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  adminEmail: z.string().email(),
  adminName: z.string().min(1).max(255).optional(),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const createCompanyMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255).optional(),
});

export type CreateCompanyMemberInput = z.infer<typeof createCompanyMemberSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(100),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
