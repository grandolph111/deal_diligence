import { z } from 'zod';
import { SubtaskStatus } from '@prisma/client';

export const createSubtaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(5000).optional(),
  status: z.nativeEnum(SubtaskStatus).default(SubtaskStatus.TODO),
  assigneeId: z.string().uuid().optional(),
  dueDate: z.string().datetime().optional(),
});

export const updateSubtaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.nativeEnum(SubtaskStatus).optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export const reorderSubtasksSchema = z.object({
  subtaskIds: z.array(z.string().uuid()).min(1),
});

export type CreateSubtaskInput = z.infer<typeof createSubtaskSchema>;
export type UpdateSubtaskInput = z.infer<typeof updateSubtaskSchema>;
export type ReorderSubtasksInput = z.infer<typeof reorderSubtasksSchema>;
