import { useCallback, useEffect } from 'react';
import { X, ArrowLeft, MessageSquare } from 'lucide-react';
import { ConversationList } from './ConversationList';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { SelectedDocuments } from './SelectedDocuments';
import { useChat } from '../hooks/useChat';

interface SelectedDocument {
  id: string;
  name: string;
}

interface ChatPanelProps {
  projectId: string | undefined;
  isOpen: boolean;
  onClose: () => void;
  onDocumentClick?: (documentId: string) => void;
  /** Document to focus on when chat opens */
  initialDocument?: SelectedDocument | null;
}

/**
 * Slide-out panel for AI chat
 */
export function ChatPanel({
  projectId,
  isOpen,
  onClose,
  onDocumentClick,
  initialDocument,
}: ChatPanelProps) {
  const {
    conversations,
    currentConversation,
    messages,
    loading,
    sendingMessage,
    error,
    selectedDocuments,
    selectConversation,
    createConversation,
    updateConversationTitle,
    deleteConversation,
    sendMessage,
    clearCurrentConversation,
    addSelectedDocument,
    removeSelectedDocument,
    clearSelectedDocuments,
  } = useChat({ projectId });

  // Add initial document when provided
  useEffect(() => {
    if (initialDocument && isOpen) {
      addSelectedDocument(initialDocument);
    }
  }, [initialDocument, isOpen, addSelectedDocument]);

  // Handle creating a new conversation
  const handleCreateConversation = useCallback(async () => {
    await createConversation();
  }, [createConversation]);

  // Handle sending a message
  const handleSendMessage = useCallback(async (content: string) => {
    // If no current conversation, create one first
    if (!currentConversation) {
      const newConversation = await createConversation();
      if (newConversation) {
        // Wait a tick for state to update, then send
        setTimeout(() => sendMessage(content), 0);
      }
    } else {
      await sendMessage(content);
    }
  }, [currentConversation, createConversation, sendMessage]);

  // Handle going back to conversation list
  const handleBackToList = useCallback(() => {
    clearCurrentConversation();
  }, [clearCurrentConversation]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="chat-panel-overlay">
      <div className="chat-panel">
        {/* Header */}
        <header className="chat-panel-header">
          {currentConversation ? (
            <>
              <button
                type="button"
                className="chat-back-btn"
                onClick={handleBackToList}
                title="Back to conversations"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="chat-header-title">
                <MessageSquare size={20} />
                <span>{currentConversation.title || 'New conversation'}</span>
              </div>
            </>
          ) : (
            <div className="chat-header-title">
              <MessageSquare size={20} />
              <span>AI Document Assistant</span>
            </div>
          )}
          <button
            type="button"
            className="chat-close-btn"
            onClick={onClose}
            title="Close chat"
          >
            <X size={20} />
          </button>
        </header>

        {/* Error banner */}
        {error && (
          <div className="chat-error-banner">
            {error}
          </div>
        )}

        {/* Content */}
        <div className="chat-panel-content">
          {currentConversation ? (
            // Show messages for current conversation
            <div className="chat-messages-container">
              <MessageList
                messages={messages}
                loading={loading}
                sendingMessage={sendingMessage}
                onDocumentClick={onDocumentClick}
              />
            </div>
          ) : (
            // Show conversation list
            <ConversationList
              conversations={conversations}
              currentConversationId={null}
              loading={loading}
              onSelect={selectConversation}
              onCreate={handleCreateConversation}
              onDelete={deleteConversation}
              onRename={updateConversationTitle}
            />
          )}
        </div>

        {/* Input (only show when in a conversation or starting fresh) */}
        {(currentConversation || conversations.length === 0) && (
          <div className="chat-panel-footer">
            {/* Show selected documents */}
            <SelectedDocuments
              documents={selectedDocuments}
              onRemove={removeSelectedDocument}
              onClear={clearSelectedDocuments}
            />

            <ChatInput
              onSend={handleSendMessage}
              disabled={sendingMessage || loading}
              placeholder={
                selectedDocuments.length > 0
                  ? `Ask about ${selectedDocuments.length} selected document${selectedDocuments.length !== 1 ? 's' : ''}...`
                  : currentConversation
                    ? 'Ask about your documents...'
                    : 'Start a conversation...'
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
