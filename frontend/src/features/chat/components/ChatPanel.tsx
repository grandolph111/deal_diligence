import { useCallback, useEffect, useState } from 'react';
import { X, ArrowLeft, MessageSquare, FileText } from 'lucide-react';
import { ConversationList } from './ConversationList';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { SaveAnswerModal } from './SaveAnswerModal';
import { SelectedDocuments } from './SelectedDocuments';
import { useChat } from '../hooks/useChat';
import { useProjectReadiness } from '../../../api/hooks/useProjectReadiness';
import { AiReadinessGate } from '../../../components/ai/AiReadinessGate';

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
  const { readiness } = useProjectReadiness(projectId);
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

  // Filing an answer into the library
  const [saving, setSaving] = useState<{ content: string; documentIds: string[] } | null>(null);

  const handleSaveAnswer = useCallback((content: string, documentIds: string[]) => {
    setSaving({ content, documentIds });
  }, []);

  // The user's question titles the note better than the answer's opening line.
  const lastQuestion = (() => {
    if (!saving) return undefined;
    const idx = messages.findIndex((m) => m.content === saving.content);
    for (let i = idx - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'USER') return messages[i].content;
    }
    return undefined;
  })();

  /**
   * The pinned document follows the panel. It is set when the viewer asks a
   * question about one document, and dropped on close so the next open starts
   * project-wide rather than silently inheriting the last document's scope.
   */
  useEffect(() => {
    if (!isOpen) {
      clearSelectedDocuments();
      return;
    }
    if (initialDocument) {
      addSelectedDocument(initialDocument);
    }
  }, [initialDocument, isOpen, addSelectedDocument, clearSelectedDocuments]);

  // A document pinned from the viewer scopes the whole panel.
  const pinnedDocument = selectedDocuments[0] ?? null;

  // Handle creating a new conversation
  const handleCreateConversation = useCallback(async () => {
    await createConversation();
  }, [createConversation]);

  // Handle sending a message
  const handleSendMessage = useCallback(async (content: string) => {
    // A brand-new conversation is handed straight to sendMessage. Waiting a
    // tick for state to catch up doesn't work — this closure keeps the
    // sendMessage it was built with, which still sees no conversation.
    const conversation = currentConversation ?? (await createConversation());
    if (!conversation) return;
    await sendMessage(content, undefined, conversation);
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

        {/* Content — gated on the deal having been read far enough to answer */}
        <div className="chat-panel-content">
          <AiReadinessGate readiness={readiness} onUploadClick={onClose}>
          {currentConversation ? (
            // Show messages for current conversation
            <div className="chat-messages-container">
              <MessageList
                messages={messages}
                loading={loading}
                sendingMessage={sendingMessage}
                onDocumentClick={onDocumentClick}
                onSaveAnswer={projectId ? handleSaveAnswer : undefined}
              />
            </div>
          ) : pinnedDocument ? (
            // Asked from the viewer: land on the document, not on a list of
            // past conversations the question has nothing to do with.
            <div className="message-list-empty">
              <div className="empty-icon">
                <FileText size={48} />
              </div>
              <h3>Ask about this document</h3>
              <p>
                Answers are drawn from <strong>{pinnedDocument.name}</strong>
                {selectedDocuments.length > 1
                  ? ` and ${selectedDocuments.length - 1} other document${selectedDocuments.length > 2 ? 's' : ''}`
                  : ''}
                . Remove it below to search the whole data room.
              </p>
              <div className="empty-suggestions">
                <span className="suggestion-label">Try asking:</span>
                <ul>
                  <li>"What are the key terms of this agreement?"</li>
                  <li>"Does this contain a change-of-control provision?"</li>
                  <li>"What are the biggest risks here?"</li>
                </ul>
              </div>
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
          </AiReadinessGate>
        </div>

        {/* Input (only show when in a conversation or starting fresh) */}
        {readiness?.ready !== false &&
          (currentConversation || conversations.length === 0 || pinnedDocument) && (
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

      {projectId && saving && (
        <SaveAnswerModal
          projectId={projectId}
          isOpen
          content={saving.content}
          documentIds={saving.documentIds}
          question={lastQuestion}
          onClose={() => setSaving(null)}
          onSaved={() => setSaving(null)}
        />
      )}
    </div>
  );
}
