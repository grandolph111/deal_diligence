import { User, Bot, BookmarkPlus } from 'lucide-react';
import { CitationCard } from './CitationCard';
import type { ChatMessage, Citation } from '../../../types/api';

interface MessageItemProps {
  message: ChatMessage;
  onDocumentClick?: (documentId: string) => void;
  /** File this answer into the deal library. Omitted = feature unavailable. */
  onSaveAnswer?: (content: string, documentIds: string[]) => void;
}

/**
 * Formats the timestamp for display
 */
function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Displays a single chat message with optional citations
 */
export function MessageItem({ message, onDocumentClick, onSaveAnswer }: MessageItemProps) {
  const isUser = message.role === 'USER';
  const citations: Citation[] = message.citations
    ? (typeof message.citations === 'string'
        ? JSON.parse(message.citations)
        : message.citations)
    : [];

  return (
    <div className={`message-item ${isUser ? 'user' : 'assistant'}`}>
      <div className="message-avatar">
        {isUser ? (
          <User size={20} />
        ) : (
          <Bot size={20} />
        )}
      </div>

      <div className="message-content-wrapper">
        <div className="message-header">
          <span className="message-role">{isUser ? 'You' : 'AI Assistant'}</span>
          <span className="message-time">{formatTime(message.createdAt)}</span>
        </div>

        <div className="message-content">
          {message.content.split('\n').map((line, idx) => (
            <p key={idx}>{line || '\u00A0'}</p>
          ))}
        </div>

        {citations.length > 0 && (
          <div className="message-citations">
            <div className="citations-header">
              <span className="citations-label">Sources ({citations.length})</span>
            </div>
            <div className="citations-list">
              {citations.map((citation, idx) => (
                <CitationCard
                  key={idx}
                  citation={citation}
                  index={idx}
                  onDocumentClick={onDocumentClick}
                />
              ))}
            </div>
          </div>
        )}

        {/* An answer worth keeping shouldn't only exist in scrollback — filing
            it makes it part of what the deal knows. */}
        {!isUser && onSaveAnswer && message.content.trim().length > 0 && (
          <div className="message-actions">
            <button
              type="button"
              className="message-save"
              onClick={() =>
                onSaveAnswer(
                  message.content,
                  [...new Set(citations.map((c) => c.documentId).filter(Boolean))]
                )
              }
              title="Save this answer to the deal library"
            >
              <BookmarkPlus size={12} aria-hidden="true" /> Save to deal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
