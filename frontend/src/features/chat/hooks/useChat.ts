import { useState, useCallback, useEffect } from 'react';
import { chatService } from '../../../api';
import type {
  ChatConversation,
  ChatMessage,
  Citation,
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
  sendMessage: (
    content: string,
    documentIds?: string[],
    conversation?: ChatConversation
  ) => Promise<{ citations: Citation[] } | null>;
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

  // Send a message.
  //
  // `conversation` is for the first message of a brand-new conversation, whose
  // caller holds it before this hook's state has caught up.
  const sendMessage = useCallback(async (
    content: string,
    documentIds?: string[],
    conversation?: ChatConversation
  ) => {
    const target = conversation ?? currentConversation;
    if (!projectId || !target) return null;

    // An answer takes tens of seconds. Show the question straight away —
    // waiting for the round-trip to echo it back reads as a dropped message.
    const pending: ChatMessage = {
      id: `pending-${target.id}-${content.length}`,
      conversationId: target.id,
      role: 'USER',
      content,
      citations: null,
      createdAt: new Date().toISOString(),
    };

    try {
      setSendingMessage(true);
      setError(null);
      setMessages((prev) => [...prev, pending]);

      // Use provided documentIds or fall back to selected documents
      const docsToUse = documentIds || selectedDocuments.map((d) => d.id);

      const response = await chatService.sendMessage(
        projectId,
        target.id,
        {
          content,
          documentIds: docsToUse.length > 0 ? docsToUse : undefined,
        }
      );

      // Swap the placeholder for the saved pair.
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== pending.id),
        response.userMessage,
        response.assistantMessage,
      ]);

      // Update conversation in the list (for updated timestamp)
      setConversations((prev) =>
        prev.map((c) =>
          c.id === target.id
            ? { ...c, messageCount: c.messageCount + 2, updatedAt: new Date().toISOString() }
            : c
        )
      );

      // Apply AI-generated title returned by the backend on first exchange
      if (response.generatedTitle) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === target.id ? { ...c, title: response.generatedTitle ?? null } : c
          )
        );
        setCurrentConversation((prev) =>
          prev ? { ...prev, title: response.generatedTitle! } : prev
        );
      }

      return { citations: response.citations };
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== pending.id));
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
