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

export const initiateUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required').max(255),
  mimeType: z.string().min(1, 'MIME type is required'),
  sizeBytes: z.number().int().positive('File size must be positive'),
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
