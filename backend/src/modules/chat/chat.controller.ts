import { Request, Response } from 'express';
import { chatService } from './chat.service';
import {
  createConversationSchema,
  updateConversationSchema,
  sendMessageSchema,
} from './chat.validators';
import { ApiError } from '../../utils/ApiError';
import { asyncHandler } from '../../utils/asyncHandler';

export const chatController = {
  /**
   * GET /projects/:id/chat/conversations
   * List all conversations for a project
   */
  listConversations: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;

    const conversations = await chatService.getProjectConversations(projectId);

    res.json(conversations);
  }),

  /**
   * POST /projects/:id/chat/conversations
   * Create a new conversation
   */
  createConversation: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;

    if (!req.user) {
      throw ApiError.unauthorized('User not found');
    }

    const data = createConversationSchema.parse(req.body);
    const conversation = await chatService.createConversation(
      projectId,
      req.user.id,
      data
    );

    // Fetch the full conversation with relations
    const fullConversation = await chatService.getConversationById(conversation.id);

    res.status(201).json(fullConversation);
  }),

  /**
   * GET /projects/:id/chat/conversations/:conversationId
   * Get a conversation with all messages
   */
  getConversation: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, conversationId } = req.params as Record<string, string>;

    // Verify conversation belongs to project (IDOR protection)
    await chatService.verifyConversationInProject(conversationId, projectId);

    const conversation = await chatService.getConversationById(conversationId);

    if (!conversation) {
      throw ApiError.notFound('Conversation not found');
    }

    res.json(conversation);
  }),

  /**
   * PATCH /projects/:id/chat/conversations/:conversationId
   * Update conversation title
   */
  updateConversation: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, conversationId } = req.params as Record<string, string>;

    if (!req.user || !req.projectMember) {
      throw ApiError.unauthorized('User not found');
    }

    // Verify conversation belongs to project
    const conversation = await chatService.verifyConversationInProject(
      conversationId,
      projectId
    );

    // Check if user can modify this conversation
    const canModify = await chatService.canModifyConversation(
      conversation,
      req.user.id,
      req.projectMember
    );

    if (!canModify) {
      throw ApiError.forbidden('You can only modify your own conversations');
    }

    const data = updateConversationSchema.parse(req.body);
    const updated = await chatService.updateConversation(conversationId, data);

    // Fetch the full conversation with relations
    const fullConversation = await chatService.getConversationById(updated.id);

    res.json(fullConversation);
  }),

  /**
   * DELETE /projects/:id/chat/conversations/:conversationId
   * Delete a conversation
   */
  deleteConversation: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, conversationId } = req.params as Record<string, string>;

    if (!req.user || !req.projectMember) {
      throw ApiError.unauthorized('User not found');
    }

    // Verify conversation belongs to project
    const conversation = await chatService.verifyConversationInProject(
      conversationId,
      projectId
    );

    // Check if user can modify this conversation
    const canModify = await chatService.canModifyConversation(
      conversation,
      req.user.id,
      req.projectMember
    );

    if (!canModify) {
      throw ApiError.forbidden('You can only delete your own conversations');
    }

    await chatService.deleteConversation(conversationId);

    res.status(204).send();
  }),

  /**
   * POST /projects/:id/chat/conversations/:conversationId/messages
   * Send a message and get AI response
   */
  sendMessage: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, conversationId } = req.params as Record<string, string>;

    if (!req.user || !req.projectMember) {
      throw ApiError.unauthorized('User not found');
    }

    // Verify conversation belongs to project
    await chatService.verifyConversationInProject(conversationId, projectId);

    const data = sendMessageSchema.parse(req.body);
    const result = await chatService.sendMessage(
      projectId,
      conversationId,
      req.user.id,
      req.projectMember,
      data
    );

    res.status(201).json(result);
  }),
};
