import { apiClient } from '../client';
import type {
  ChatConversation,
  CreateConversationDto,
  UpdateConversationDto,
  SendMessageDto,
  SendMessageResponse,
} from '../../types/api';

/**
 * Chat API service
 * Handles chat conversations and messages
 */
export const chatService = {
  /**
   * Get all conversations for a project
   */
  async getConversations(projectId: string): Promise<ChatConversation[]> {
    return apiClient.get<ChatConversation[]>(
      `/projects/${projectId}/chat/conversations`
    );
  },

  /**
   * Get a single conversation with all messages
   */
  async getConversation(
    projectId: string,
    conversationId: string
  ): Promise<ChatConversation> {
    return apiClient.get<ChatConversation>(
      `/projects/${projectId}/chat/conversations/${conversationId}`
    );
  },

  /**
   * Create a new conversation
   */
  async createConversation(
    projectId: string,
    data?: CreateConversationDto
  ): Promise<ChatConversation> {
    return apiClient.post<ChatConversation>(
      `/projects/${projectId}/chat/conversations`,
      data || {}
    );
  },

  /**
   * Update conversation title
   */
  async updateConversation(
    projectId: string,
    conversationId: string,
    data: UpdateConversationDto
  ): Promise<ChatConversation> {
    return apiClient.patch<ChatConversation>(
      `/projects/${projectId}/chat/conversations/${conversationId}`,
      data
    );
  },

  /**
   * Delete a conversation
   */
  async deleteConversation(
    projectId: string,
    conversationId: string
  ): Promise<void> {
    return apiClient.delete(
      `/projects/${projectId}/chat/conversations/${conversationId}`
    );
  },

  /**
   * Send a message and get AI response
   */
  async sendMessage(
    projectId: string,
    conversationId: string,
    data: SendMessageDto
  ): Promise<SendMessageResponse> {
    return apiClient.post<SendMessageResponse>(
      `/projects/${projectId}/chat/conversations/${conversationId}/messages`,
      data
    );
  },
};
