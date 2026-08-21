import { prisma } from '../../config/database';
import { ChatConversation, ChatMessage, ChatMessageRole, ProjectMember, Prisma } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { runChat, isMock, getClaudeClient, getModelId } from '../../integrations/claude';
import { stuffRetriever, defaultRetriever } from '../../integrations/retrieval';
import { dealBriefService } from '../../services/deal-brief.service';
import { resolveProjectScope } from '../../services/scope.service';
import { config } from '../../config';

/**
 * Use Haiku to generate a short (3-6 word) title for a conversation from
 * the first user message. Fires-and-forgets; never throws — a bad title is
 * worse than no title, so failures are silently swallowed.
 */
async function generateConversationTitle(firstMessage: string): Promise<string | null> {
  try {
    const client = getClaudeClient();
    const model = getModelId('chat'); // Haiku tier
    const resp = await client.messages.create({
      model,
      max_tokens: 32,
      messages: [
        {
          role: 'user',
          content: `Generate a concise title (3–6 words) for a legal due diligence chat that starts with this message. Return only the title — no quotes, no punctuation at the end.\n\nMessage: ${firstMessage.slice(0, 400)}`,
        },
      ],
    });
    const block = resp.content.find((b) => b.type === 'text');
    const text = block && 'text' in block ? (block.text as string).trim() : null;
    return text || null;
  } catch {
    return null;
  }
}
import {
  CreateConversationInput,
  UpdateConversationInput,
  SendMessageInput,
  Citation,
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
    generatedTitle?: string;
  }> {
    // Save user message
    const userMessage = await this.saveMessage(
      conversationId,
      'USER',
      data.content
    );

    // Pull recent history (excluding the one we just saved).
    const history = await this.getRecentMessages(conversationId, 5);
    const priorTurns = history
      .slice(0, -1)
      .map((m) => ({
        role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: m.content,
      }));

    // Resolve folder scope via platform-aware helper (Super Admin &
    // same-company Customer Admin get full access without a membership row).
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, platformRole: true, companyId: true },
    });
    if (!user) throw ApiError.unauthorized('User not found');
    const scope = await resolveProjectScope(user, projectId);

    // Zero-grant SMEs get a canned response and no retrieval.
    if (!scope.isFullAccess && scope.allowedFolderIds.length === 0) {
      const refusal =
        "You haven't been granted access to any folders in this deal yet. Ask your Customer Admin to share the folders you need.";
      const assistant = await this.saveMessage(
        conversationId,
        'ASSISTANT',
        refusal,
        []
      );
      return { userMessage, assistantMessage: assistant, citations: [] };
    }

    // Load the deal brief (primary context). For the query-relevant detail:
    //  - if the user pinned specific docs → those fact sheets (explicit intent);
    //  - else if the library is enabled → navigate the diligence ToC to pull only
    //    the evidence relevant to the question (+ a coverage summary of gaps);
    //  - otherwise → the brief alone.
    const brief = await dealBriefService.loadBriefForMember(membership);

    const retrievalScope = {
      projectId,
      folderIds: scope.isFullAccess ? undefined : scope.allowedFolderIds,
    };
    let pinnedDocs = [] as Awaited<ReturnType<typeof stuffRetriever.search>>;
    if (data.documentIds && data.documentIds.length > 0) {
      pinnedDocs = await stuffRetriever.search(data.content, {
        ...retrievalScope,
        documentIds: data.documentIds,
      });
    } else {
      // Checklist navigation is the default. It degrades to bounded stuffing
      // when a project has no library evidence yet, so this no longer depends
      // on the LIBRARY_ENABLED flag — an unpopulated project still answers.
      pinnedDocs = await defaultRetriever.search(data.content, retrievalScope);
    }

    // If Claude isn't configured, return a helpful fallback message.
    if (isMock()) {
      const fallback = brief
        ? '(Mock mode — Claude not configured.) Deal brief is loaded. Configure ANTHROPIC_API_KEY to enable real responses.'
        : '(Mock mode — Claude not configured.) No deal brief available yet (upload some documents first).';
      const assistant = await this.saveMessage(
        conversationId,
        'ASSISTANT',
        fallback,
        []
      );
      return { userMessage, assistantMessage: assistant, citations: [] };
    }

    // Title the conversation from the first message. It needs nothing the
    // answer produces, so it rides alongside the answer rather than adding a
    // second Claude round-trip to the wait — this used to run after the answer
    // was already in hand, despite calling itself non-blocking.
    const titlePromise: Promise<string | null> =
      priorTurns.length === 0
        ? prisma.chatConversation
            .findUnique({ where: { id: conversationId }, select: { title: true } })
            .then((conv) => (conv?.title ? null : generateConversationTitle(data.content)))
            .catch(() => null)
        : Promise.resolve(null);

    let content: string;
    let citations: Citation[];
    const startedAt = Date.now();
    try {
      const response = await runChat({
        brief,
        pinnedDocs,
        history: priorTurns,
        userMessage: data.content,
      });
      content = response.content;
      citations = response.citations.map((c) => {
        const pinned = pinnedDocs.find((f) => f.documentId === c.documentId);
        return {
          documentId: c.documentId,
          filename: pinned?.documentName ?? c.documentId,
          pageNumber: c.pageNumber ?? null,
          textExcerpt: c.snippet,
          relevanceScore: 1,
        };
      });
    } catch (error) {
      void titlePromise.catch(() => null);
      await this.saveMessage(
        conversationId,
        'ASSISTANT',
        'I apologize, but I encountered an error processing your request. Please try again.',
        []
      );
      throw ApiError.internal(
        error instanceof Error ? error.message : 'Failed to get AI response'
      );
    }

    const assistantMessage = await this.saveMessage(
      conversationId,
      'ASSISTANT',
      content,
      citations
    );

    // Already resolved by now in all but the fastest answers.
    let generatedTitle: string | undefined;
    const title = await titlePromise;
    if (title) {
      await prisma.chatConversation.update({
        where: { id: conversationId },
        data: { title },
      });
      generatedTitle = title;
    }

    await prisma.auditLog.create({
      data: {
        projectId,
        userId,
        action: 'chat',
        resourceType: 'conversation',
        resourceId: conversationId,
        metadata: {
          messageLength: data.content.length,
          responseLength: content.length,
          citationCount: citations.length,
          processingTimeMs: Date.now() - startedAt,
          focusedDocumentIds: data.documentIds || [],
        },
      },
    });

    return {
      userMessage,
      assistantMessage,
      citations,
      generatedTitle,
    };
  },
};
