import { z } from 'zod';

export const updateMeSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  avatarUrl: z
    .string()
    .url('Avatar URL must be a valid URL')
    .max(2048, 'Avatar URL is too long')
    .optional(),
});

export type UpdateMeInput = z.infer<typeof updateMeSchema>;
