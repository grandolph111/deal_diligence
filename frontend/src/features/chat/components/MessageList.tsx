import { useEffect, useRef } from 'react';
import { MessageCircle, Bot } from 'lucide-react';
import { MessageItem } from './MessageItem';
import type { ChatMessage } from '../../../types/api';

interface MessageListProps {
  messages: ChatMessage[];
  loading: boolean;
  sendingMessage: boolean;
  onDocumentClick?: (documentId: string) => void;
}

/**
 * Displays a list of chat messages with auto-scroll
 */
export function MessageList({
  messages,
  loading,
  sendingMessage,
  onDocumentClick,
}: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sendingMessage]);

  if (loading && messages.length === 0) {
    return (
      <div className="message-list-loading">
        <div className="loading-spinner" />
        <span>Loading messages...</span>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="message-list-empty">
        <div className="empty-icon">
          <MessageCircle size={48} />
        </div>
        <h3>Start a conversation</h3>
        <p>
          Ask questions about your documents and I'll search through them
          to find relevant information and provide answers with citations.
        </p>
        <div className="empty-suggestions">
          <span className="suggestion-label">Try asking:</span>
          <ul>
            <li>"What are the key terms in the agreement?"</li>
            <li>"Summarize the liability clauses"</li>
            <li>"What is the termination period?"</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="message-list">
      {messages.map((message) => (
        <MessageItem
          key={message.id}
          message={message}
          onDocumentClick={onDocumentClick}
        />
      ))}

      {sendingMessage && (
        <div className="message-item assistant thinking">
          <div className="message-avatar">
            <Bot size={20} />
          </div>
          <div className="message-content-wrapper">
            <div className="thinking-indicator">
              <span className="dot" />
              <span className="dot" />
              <span className="dot" />
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
