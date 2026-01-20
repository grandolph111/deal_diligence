import { useState } from 'react';
import { Edit2, Trash2, Check, X } from 'lucide-react';
import type { TaskComment } from '../../../types/api';

interface CommentItemProps {
  comment: TaskComment;
  currentUserId: string | undefined;
  isAdmin: boolean;
  onUpdate: (commentId: string, content: string) => Promise<void>;
  onDelete: (commentId: string) => Promise<void>;
}

export function CommentItem({ comment, currentUserId, isAdmin, onUpdate, onDelete }: CommentItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isDeleting, setIsDeleting] = useState(false);

  const canEdit = comment.authorId === currentUserId;
  const canDelete = canEdit || isAdmin;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleSave = async () => {
    if (!editContent.trim()) return;
    await onUpdate(comment.id, editContent.trim());
    setIsEditing(false);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(comment.id);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="comment-item">
      <div className="comment-avatar">
        {comment.author.avatarUrl ? (
          <img src={comment.author.avatarUrl} alt={comment.author.name || ''} />
        ) : (
          <span>{(comment.author.name || comment.author.email || '?')[0].toUpperCase()}</span>
        )}
      </div>

      <div className="comment-body">
        <div className="comment-header">
          <span className="comment-author">{comment.author.name || comment.author.email}</span>
          <span className="comment-date">{formatDate(comment.createdAt)}</span>
          {comment.updatedAt !== comment.createdAt && (
            <span className="comment-edited">(edited)</span>
          )}
        </div>

        {isEditing ? (
          <div className="comment-edit">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={2}
              autoFocus
            />
            <div className="comment-edit-actions">
              <button className="button ghost sm" onClick={() => setIsEditing(false)}>
                <X size={14} />
              </button>
              <button className="button primary sm" onClick={handleSave}>
                <Check size={14} />
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="comment-content">{comment.content}</p>
            <div className="comment-actions">
              {canEdit && (
                <button
                  className="button ghost sm"
                  onClick={() => setIsEditing(true)}
                  title="Edit"
                >
                  <Edit2 size={12} />
                </button>
              )}
              {canDelete && (
                <button
                  className="button ghost sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  title="Delete"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
