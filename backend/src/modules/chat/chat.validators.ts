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

/**
 * Response from Python service chat endpoint
 */
export const pythonChatResponseSchema = z.object({
  message: z.string(),
  conversation_id: z.string(),
  citations: z.array(z.object({
    document_id: z.string(),
    filename: z.string(),
    page_number: z.number().nullable().optional(),
    text_excerpt: z.string(),
    relevance_score: z.number().min(0).max(1),
  })),
  processing_time_ms: z.number(),
});

export type CreateConversationInput = z.infer<typeof createConversationSchema>;
export type UpdateConversationInput = z.infer<typeof updateConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type PythonChatResponse = z.infer<typeof pythonChatResponseSchema>;
