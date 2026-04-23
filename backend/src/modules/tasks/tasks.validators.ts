import { z } from 'zod';
import { TaskStatus, TaskPriority } from '@prisma/client';

export const createTaskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
  description: z.string().max(10000).optional(),
  status: z.nativeEnum(TaskStatus).default(TaskStatus.TODO),
  priority: z.nativeEnum(TaskPriority).default(TaskPriority.MEDIUM),
  riskCategory: z.string().max(100).optional(),
  assignedDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  timeEstimate: z.number().int().positive().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  boardId: z.string().uuid().optional(),
  // AI task fields
  aiPrompt: z.string().max(10000).optional(),
  attachedDocumentIds: z.array(z.string().uuid()).optional(),
});

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(10000).nullable().optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  riskCategory: z.string().max(100).nullable().optional(),
  assignedDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  timeEstimate: z.number().int().positive().nullable().optional(),
  // AI task fields
  aiPrompt: z.string().max(10000).nullable().optional(),
  attachedDocumentIds: z.array(z.string().uuid()).optional(),
});

export const updateTaskStatusSchema = z.object({
  status: z.nativeEnum(TaskStatus),
});

export const taskFiltersSchema = z.object({
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  assigneeId: z.string().uuid().optional(),
  tagId: z.string().uuid().optional(),
  search: z.string().optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
});

export const addAssigneeSchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
});

export const addTagToTaskSchema = z.object({
  tagId: z.string().uuid('Invalid tag ID'),
});

export const createTagSchema = z.object({
  name: z.string().min(1, 'Tag name is required').max(50, 'Tag name is too long'),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color (e.g., #FF5733)')
    .optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type TaskFilters = z.infer<typeof taskFiltersSchema>;
export type AddAssigneeInput = z.infer<typeof addAssigneeSchema>;
export type AddTagToTaskInput = z.infer<typeof addTagToTaskSchema>;
export type CreateTagInput = z.infer<typeof createTagSchema>;
