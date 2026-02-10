import { useState, useCallback, useEffect } from 'react';
import { chatService } from '../../../api';
import type {
  ChatConversation,
  ChatMessage,
  Citation,
  Document,
} from '../../../types/api';

interface UseChatOptions {
  projectId: string | undefined;
}

interface SelectedDocument {
  id: string;
  name: string;
}

interface UseChatResult {
  conversations: ChatConversation[];
  currentConversation: ChatConversation | null;
  messages: ChatMessage[];
  loading: boolean;
  sendingMessage: boolean;
  error: string | null;
  selectedDocuments: SelectedDocument[];
  fetchConversations: () => Promise<void>;
  selectConversation: (conversationId: string) => Promise<void>;
  createConversation: (title?: string) => Promise<ChatConversation | null>;
  updateConversationTitle: (conversationId: string, title: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  sendMessage: (content: string, documentIds?: string[]) => Promise<{ citations: Citation[] } | null>;
  clearCurrentConversation: () => void;
  addSelectedDocument: (doc: SelectedDocument) => void;
  removeSelectedDocument: (docId: string) => void;
  clearSelectedDocuments: () => void;
}

/**
 * Hook for managing chat state and operations
 */
export function useChat({ projectId }: UseChatOptions): UseChatResult {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<SelectedDocument[]>([]);

  // Fetch all conversations for the project
  const fetchConversations = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await chatService.getConversations(projectId);
      setConversations(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch conversations');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Select a conversation and load its messages
  const selectConversation = useCallback(async (conversationId: string) => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);
      const conversation = await chatService.getConversation(projectId, conversationId);
      setCurrentConversation(conversation);
      setMessages(conversation.messages || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load conversation');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Create a new conversation
  const createConversation = useCallback(async (title?: string) => {
    if (!projectId) return null;

    try {
      setLoading(true);
      setError(null);
      const conversation = await chatService.createConversation(projectId, { title });
      setConversations((prev) => [conversation, ...prev]);
      setCurrentConversation(conversation);
      setMessages([]);
      return conversation;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create conversation');
      return null;
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Update conversation title
  const updateConversationTitle = useCallback(async (conversationId: string, title: string) => {
    if (!projectId) return;

    try {
      await chatService.updateConversation(projectId, conversationId, { title });
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, title } : c))
      );
      if (currentConversation?.id === conversationId) {
        setCurrentConversation((prev) => (prev ? { ...prev, title } : null));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update conversation');
    }
  }, [projectId, currentConversation?.id]);

  // Delete a conversation
  const deleteConversation = useCallback(async (conversationId: string) => {
    if (!projectId) return;

    try {
      await chatService.deleteConversation(projectId, conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      if (currentConversation?.id === conversationId) {
        setCurrentConversation(null);
        setMessages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete conversation');
    }
  }, [projectId, currentConversation?.id]);

  // Send a message
  const sendMessage = useCallback(async (content: string, documentIds?: string[]) => {
    if (!projectId || !currentConversation) return null;

    try {
      setSendingMessage(true);
      setError(null);

      // Use provided documentIds or fall back to selected documents
      const docsToUse = documentIds || selectedDocuments.map((d) => d.id);

      const response = await chatService.sendMessage(
        projectId,
        currentConversation.id,
        {
          content,
          documentIds: docsToUse.length > 0 ? docsToUse : undefined,
        }
      );

      // Add both messages to the list
      setMessages((prev) => [...prev, response.userMessage, response.assistantMessage]);

      // Update conversation in the list (for updated timestamp)
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConversation.id
            ? { ...c, messageCount: c.messageCount + 2, updatedAt: new Date().toISOString() }
            : c
        )
      );

      // Auto-generate title if this is the first message
      if (messages.length === 0 && !currentConversation.title) {
        // Use first ~50 chars of the message as title
        const autoTitle = content.length > 50 ? content.substring(0, 50) + '...' : content;
        await updateConversationTitle(currentConversation.id, autoTitle);
      }

      return { citations: response.citations };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      return null;
    } finally {
      setSendingMessage(false);
    }
  }, [projectId, currentConversation, messages.length, selectedDocuments, updateConversationTitle]);

  // Clear current conversation selection
  const clearCurrentConversation = useCallback(() => {
    setCurrentConversation(null);
    setMessages([]);
  }, []);

  // Add a document to focus on
  const addSelectedDocument = useCallback((doc: SelectedDocument) => {
    setSelectedDocuments((prev) => {
      // Don't add if already selected
      if (prev.some((d) => d.id === doc.id)) {
        return prev;
      }
      return [...prev, doc];
    });
  }, []);

  // Remove a document from focus
  const removeSelectedDocument = useCallback((docId: string) => {
    setSelectedDocuments((prev) => prev.filter((d) => d.id !== docId));
  }, []);

  // Clear all selected documents
  const clearSelectedDocuments = useCallback(() => {
    setSelectedDocuments([]);
  }, []);

  // Load conversations when projectId changes
  useEffect(() => {
    if (projectId) {
      fetchConversations();
    }
  }, [projectId, fetchConversations]);

  return {
    conversations,
    currentConversation,
    messages,
    loading,
    sendingMessage,
    error,
    selectedDocuments,
    fetchConversations,
    selectConversation,
    createConversation,
    updateConversationTitle,
    deleteConversation,
    sendMessage,
    clearCurrentConversation,
    addSelectedDocument,
    removeSelectedDocument,
    clearSelectedDocuments,
  };
}
