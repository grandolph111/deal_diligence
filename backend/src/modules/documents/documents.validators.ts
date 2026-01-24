import { z } from 'zod';

export const documentTypeEnum = z.enum([
  'LEGAL',
  'FINANCIAL',
  'TAX',
  'OPERATIONAL',
  'HR',
  'IP',
  'COMMERCIAL',
  'TECHNICAL',
  'OTHER',
]);

// Allowed MIME types for document uploads (security: prevent executable files)
const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/rtf',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/tiff',
  // Archives (commonly used in M&A)
  'application/zip',
  'application/x-zip-compressed',
] as const;

// Maximum file size: 100MB
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

export const initiateUploadSchema = z.object({
  filename: z
    .string()
    .min(1, 'Filename is required')
    .max(255, 'Filename is too long')
    .refine(
      (name) => !name.includes('..') && !name.includes('/') && !name.includes('\\'),
      'Filename contains invalid characters'
    ),
  mimeType: z
    .string()
    .min(1, 'MIME type is required')
    .refine(
      (type) => ALLOWED_MIME_TYPES.includes(type as (typeof ALLOWED_MIME_TYPES)[number]),
      'File type not allowed. Supported types: PDF, Word, Excel, PowerPoint, images, and ZIP files.'
    ),
  sizeBytes: z
    .number()
    .int()
    .positive('File size must be positive')
    .max(MAX_FILE_SIZE_BYTES, 'File size exceeds maximum allowed (100MB)'),
  documentType: documentTypeEnum.optional(),
});

export const initiateMultipleUploadsSchema = z.object({
  documents: z.array(initiateUploadSchema).min(1).max(50),
});

export const confirmUploadSchema = z.object({
  documentId: z.string().uuid('Invalid document ID'),
});

export const confirmMultipleUploadsSchema = z.object({
  documentIds: z.array(z.string().uuid('Invalid document ID')).min(1).max(50),
});

export const listDocumentsQuerySchema = z.object({
  documentType: documentTypeEnum.optional(),
  status: z.enum(['PENDING', 'PROCESSING', 'COMPLETE', 'FAILED']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type InitiateUploadInput = z.infer<typeof initiateUploadSchema>;
export type InitiateMultipleUploadsInput = z.infer<typeof initiateMultipleUploadsSchema>;
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;
export type ConfirmMultipleUploadsInput = z.infer<typeof confirmMultipleUploadsSchema>;
export type ListDocumentsQuery = z.infer<typeof listDocumentsQuerySchema>;
