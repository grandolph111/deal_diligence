import { z } from 'zod';

/**
 * Schema for creating a new conversation
 */
export const createConversationSchema = z.object({
  title: z.string().max(500).optional(),
});

/**
 * Schema for updating a conversation
 */
export const updateConversationSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500),
});

/**
 * Schema for sending a message
 */
export const sendMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(10000),
  documentIds: z.array(z.string().uuid()).optional(),
});

/**
 * Citation from the AI response
 */
export const citationSchema = z.object({
  documentId: z.string(),
  filename: z.string(),
  pageNumber: z.number().nullable().optional(),
  textExcerpt: z.string(),
  relevanceScore: z.number().min(0).max(1),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type Citation = z.infer<typeof citationSchema>;
