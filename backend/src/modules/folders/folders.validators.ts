import { z } from 'zod';

/**
 * Schema for creating a new folder
 */
export const createFolderSchema = z.object({
  name: z
    .string()
    .min(1, 'Folder name is required')
    .max(255, 'Folder name must be 255 characters or less')
    .trim(),
  parentId: z.string().uuid('Invalid parent folder ID').nullable().optional(),
  categoryType: z.string().max(50).optional(),
  isViewOnly: z.boolean().default(false),
});

/**
 * Schema for updating a folder (rename)
 */
export const updateFolderSchema = z.object({
  name: z
    .string()
    .min(1, 'Folder name is required')
    .max(255, 'Folder name must be 255 characters or less')
    .trim()
    .optional(),
  isViewOnly: z.boolean().optional(),
});

/**
 * Schema for moving a folder to a new parent
 */
export const moveFolderSchema = z.object({
  parentId: z.string().uuid('Invalid parent folder ID').nullable(),
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;
export type MoveFolderInput = z.infer<typeof moveFolderSchema>;
