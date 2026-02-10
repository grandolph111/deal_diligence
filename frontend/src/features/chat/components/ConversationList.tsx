import { useState, useCallback } from 'react';
import { MessageCircle, Plus, Trash2, Edit3, Check, X } from 'lucide-react';
import type { ChatConversation } from '../../../types/api';

interface ConversationListProps {
  conversations: ChatConversation[];
  currentConversationId: string | null;
  loading: boolean;
  onSelect: (conversationId: string) => void;
  onCreate: () => void;
  onDelete: (conversationId: string) => void;
  onRename: (conversationId: string, title: string) => void;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'short' });
  } else {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  }
}

interface ConversationItemProps {
  conversation: ChatConversation;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
}

function ConversationItem({
  conversation,
  isSelected,
  onSelect,
  onDelete,
  onRename,
}: ConversationItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(conversation.title || '');

  const handleStartEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTitle(conversation.title || '');
    setIsEditing(true);
  }, [conversation.title]);

  const handleSaveEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const trimmed = editTitle.trim();
    if (trimmed) {
      onRename(trimmed);
    }
    setIsEditing(false);
  }, [editTitle, onRename]);

  const handleCancelEdit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(false);
    setEditTitle(conversation.title || '');
  }, [conversation.title]);

  const handleDeleteClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this conversation?')) {
      onDelete();
    }
  }, [onDelete]);

  return (
    <div
      className={`conversation-item ${isSelected ? 'selected' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
    >
      <div className="conversation-icon">
        <MessageCircle size={16} />
      </div>

      <div className="conversation-content">
        {isEditing ? (
          <input
            type="text"
            className="conversation-edit-input"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            autoFocus
          />
        ) : (
          <>
            <div className="conversation-title">
              {conversation.title || 'New conversation'}
            </div>
            <div className="conversation-meta">
              <span className="conversation-date">
                {formatDate(conversation.updatedAt)}
              </span>
              <span className="conversation-count">
                {conversation.messageCount} messages
              </span>
            </div>
          </>
        )}
      </div>

      <div className="conversation-actions">
        {isEditing ? (
          <>
            <button
              type="button"
              className="conversation-action-btn save"
              onClick={handleSaveEdit}
              title="Save"
            >
              <Check size={14} />
            </button>
            <button
              type="button"
              className="conversation-action-btn cancel"
              onClick={handleCancelEdit}
              title="Cancel"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="conversation-action-btn edit"
              onClick={handleStartEdit}
              title="Rename"
            >
              <Edit3 size={14} />
            </button>
            <button
              type="button"
              className="conversation-action-btn delete"
              onClick={handleDeleteClick}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * List of chat conversations with create/select/delete actions
 */
export function ConversationList({
  conversations,
  currentConversationId,
  loading,
  onSelect,
  onCreate,
  onDelete,
  onRename,
}: ConversationListProps) {
  return (
    <div className="conversation-list">
      <div className="conversation-list-header">
        <h3>Conversations</h3>
        <button
          type="button"
          className="new-conversation-btn"
          onClick={onCreate}
          title="New conversation"
        >
          <Plus size={16} />
          New
        </button>
      </div>

      <div className="conversation-list-content">
        {loading && conversations.length === 0 ? (
          <div className="conversation-list-loading">
            <div className="loading-spinner small" />
            <span>Loading...</span>
          </div>
        ) : conversations.length === 0 ? (
          <div className="conversation-list-empty">
            <MessageCircle size={32} />
            <p>No conversations yet</p>
            <button
              type="button"
              className="button small primary"
              onClick={onCreate}
            >
              Start a conversation
            </button>
          </div>
        ) : (
          conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isSelected={conversation.id === currentConversationId}
              onSelect={() => onSelect(conversation.id)}
              onDelete={() => onDelete(conversation.id)}
              onRename={(title) => onRename(conversation.id, title)}
            />
          ))
        )}
      </div>
    </div>
  );
}
