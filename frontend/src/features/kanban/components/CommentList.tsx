import { useState } from 'react';
import { Send } from 'lucide-react';
import { CommentItem } from './CommentItem';
import type { TaskComment } from '../../../types/api';

interface CommentListProps {
  comments: TaskComment[];
  loading: boolean;
  currentUserId: string | undefined;
  isAdmin: boolean;
  onAddComment: (content: string) => Promise<void>;
  onUpdateComment: (commentId: string, content: string) => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
}

export function CommentList({
  comments,
  loading,
  currentUserId,
  isAdmin,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
}: CommentListProps) {
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    setIsSubmitting(true);
    try {
      await onAddComment(newComment.trim());
      setNewComment('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="comment-list">
      <h4 className="section-title">Comments ({comments.length})</h4>

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner sm" />
        </div>
      ) : (
        <>
          <div className="comments">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onUpdate={onUpdateComment}
                onDelete={onDeleteComment}
              />
            ))}

            {comments.length === 0 && (
              <p className="no-comments">No comments yet. Be the first to comment!</p>
            )}
          </div>

          <form className="comment-form" onSubmit={handleSubmit}>
            <input
              type="text"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              disabled={isSubmitting}
            />
            <button
              type="submit"
              className="button primary sm"
              disabled={!newComment.trim() || isSubmitting}
            >
              <Send size={14} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
