import { prisma } from '../../config/database';
import { ChatConversation, ChatMessage, ChatMessageRole, ProjectMember, Prisma } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { config } from '../../config';
import {
  CreateConversationInput,
  UpdateConversationInput,
  SendMessageInput,
  Citation,
  PythonChatResponse,
  pythonChatResponseSchema,
} from './chat.validators';

// Include relations for conversation queries
const conversationInclude = {
  createdBy: {
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
    },
  },
  _count: {
    select: {
      messages: true,
    },
  },
};

const conversationWithMessagesInclude = {
  ...conversationInclude,
  messages: {
    orderBy: { createdAt: 'asc' as const },
  },
};

/**
 * Transform Python service response citations to our format
 */
function transformCitations(pythonCitations: PythonChatResponse['citations']): Citation[] {
  return pythonCitations.map((c) => ({
    documentId: c.document_id,
    filename: c.filename,
    pageNumber: c.page_number ?? null,
    textExcerpt: c.text_excerpt,
    relevanceScore: c.relevance_score,
  }));
}

/**
 * Get accessible folder IDs for a user based on their membership permissions
 */
function getAccessibleFolderIds(membership: ProjectMember): string[] {
  // OWNER and ADMIN have access to all folders
  if (membership.role === 'OWNER' || membership.role === 'ADMIN') {
    return []; // Empty array means all folders
  }

  // Check for restrictedFolders in permissions
  const permissions = membership.permissions as Record<string, unknown> | null;
  if (permissions?.restrictedFolders) {
    return permissions.restrictedFolders as string[];
  }

  // Default: access to all folders
  return [];
}

export const chatService = {
  /**
   * Verify a conversation belongs to a project (IDOR protection)
   */
  async verifyConversationInProject(
    conversationId: string,
    projectId: string
  ): Promise<ChatConversation> {
    const conversation = await prisma.chatConversation.findFirst({
      where: { id: conversationId, projectId },
    });

    if (!conversation) {
      throw ApiError.notFound('Conversation not found in this project');
    }

    return conversation;
  },

  /**
   * Check if user can modify a conversation (creator or admin)
   */
  async canModifyConversation(
    conversation: ChatConversation,
    userId: string,
    membership: ProjectMember
  ): Promise<boolean> {
    // Creator can always modify
    if (conversation.createdById === userId) {
      return true;
    }

    // OWNER and ADMIN can modify any conversation
    if (membership.role === 'OWNER' || membership.role === 'ADMIN') {
      return true;
    }

    return false;
  },

  /**
   * Get all conversations for a project
   */
  async getProjectConversations(projectId: string) {
    const conversations = await prisma.chatConversation.findMany({
      where: { projectId },
      include: conversationInclude,
      orderBy: { updatedAt: 'desc' },
    });

    return conversations.map((c) => ({
      ...c,
      messageCount: c._count.messages,
    }));
  },

  /**
   * Get a single conversation with all messages
   */
  async getConversationById(conversationId: string) {
    const conversation = await prisma.chatConversation.findUnique({
      where: { id: conversationId },
      include: conversationWithMessagesInclude,
    });

    if (!conversation) return null;

    return {
      ...conversation,
      messageCount: conversation._count.messages,
    };
  },

  /**
   * Create a new conversation
   */
  async createConversation(
    projectId: string,
    userId: string,
    data: CreateConversationInput
  ): Promise<ChatConversation> {
    return prisma.chatConversation.create({
      data: {
        projectId,
        createdById: userId,
        title: data.title,
      },
    });
  },

  /**
   * Update conversation title
   */
  async updateConversation(
    conversationId: string,
    data: UpdateConversationInput
  ): Promise<ChatConversation> {
    return prisma.chatConversation.update({
      where: { id: conversationId },
      data: { title: data.title },
    });
  },

  /**
   * Delete a conversation and all its messages
   */
  async deleteConversation(conversationId: string): Promise<void> {
    await prisma.chatConversation.delete({
      where: { id: conversationId },
    });
  },

  /**
   * Save a message to the database
   */
  async saveMessage(
    conversationId: string,
    role: ChatMessageRole,
    content: string,
    citations?: Citation[]
  ): Promise<ChatMessage> {
    // Update conversation's updatedAt timestamp
    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return prisma.chatMessage.create({
      data: {
        conversationId,
        role,
        content,
        citations: citations ? (citations as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });
  },

  /**
   * Get recent messages for conversation history
   */
  async getRecentMessages(
    conversationId: string,
    limit: number = 5
  ): Promise<Array<{ role: string; content: string }>> {
    const messages = await prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        role: true,
        content: true,
      },
    });

    // Reverse to get chronological order and transform to expected format
    return messages.reverse().map((m) => ({
      role: m.role.toLowerCase(),
      content: m.content,
    }));
  },

  /**
   * Send a message and get AI response
   */
  async sendMessage(
    projectId: string,
    conversationId: string,
    userId: string,
    membership: ProjectMember,
    data: SendMessageInput
  ): Promise<{
    userMessage: ChatMessage;
    assistantMessage: ChatMessage;
    citations: Citation[];
  }> {
    // Save user message
    const userMessage = await this.saveMessage(
      conversationId,
      'USER',
      data.content
    );

    // Get conversation history for context
    const history = await this.getRecentMessages(conversationId, 5);

    // Get accessible folder IDs for this user
    const accessibleFolderIds = getAccessibleFolderIds(membership);

    // Call Python service
    const pythonUrl = `${config.pythonService.url}/chat`;

    const requestBody: {
      message: string;
      project_id: string;
      conversation_id: string;
      accessible_folder_ids: string[];
      document_ids?: string[];
      history: Array<{ role: string; content: string }>;
    } = {
      message: data.content,
      project_id: projectId,
      conversation_id: conversationId,
      accessible_folder_ids: accessibleFolderIds,
      history: history.slice(0, -1), // Exclude the message we just sent
    };

    // Add document IDs if specified (for focused document context)
    if (data.documentIds && data.documentIds.length > 0) {
      requestBody.document_ids = data.documentIds;
    }

    let pythonResponse: PythonChatResponse;

    try {
      const response = await fetch(pythonUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Python service error: ${response.status} - ${errorText}`);
      }

      const responseData = await response.json();
      pythonResponse = pythonChatResponseSchema.parse(responseData);
    } catch (error) {
      // If Python service fails, save error message
      const errorMessage = await this.saveMessage(
        conversationId,
        'ASSISTANT',
        'I apologize, but I encountered an error processing your request. Please try again later.',
        []
      );

      throw ApiError.internal(
        error instanceof Error ? error.message : 'Failed to get AI response'
      );
    }

    // Transform citations to our format
    const citations = transformCitations(pythonResponse.citations);

    // Save assistant response
    const assistantMessage = await this.saveMessage(
      conversationId,
      'ASSISTANT',
      pythonResponse.message,
      citations
    );

    // Log the chat interaction for audit
    await prisma.auditLog.create({
      data: {
        projectId,
        userId,
        action: 'chat',
        resourceType: 'conversation',
        resourceId: conversationId,
        metadata: {
          messageLength: data.content.length,
          responseLength: pythonResponse.message.length,
          citationCount: citations.length,
          processingTimeMs: pythonResponse.processing_time_ms,
          focusedDocumentIds: data.documentIds || [],
        },
      },
    });

    return {
      userMessage,
      assistantMessage,
      citations,
    };
  },
};
