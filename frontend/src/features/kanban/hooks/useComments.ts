import { useState, useCallback } from 'react';
import { commentsService } from '../../../api/services/comments.service';
import type { TaskComment, CreateCommentDto, UpdateCommentDto } from '../../../types/api';

export function useComments(projectId: string | undefined, taskId: string | undefined) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchComments = useCallback(async () => {
    if (!projectId || !taskId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await commentsService.getComments(projectId, taskId);
      setComments(data);
    } catch (err) {
      setError('Failed to load comments');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId]);

  const createComment = useCallback(async (data: CreateCommentDto): Promise<TaskComment> => {
    if (!projectId || !taskId) throw new Error('Missing IDs');

    const comment = await commentsService.createComment(projectId, taskId, data);
    setComments(prev => [...prev, comment]);
    return comment;
  }, [projectId, taskId]);

  const updateComment = useCallback(async (commentId: string, data: UpdateCommentDto): Promise<TaskComment> => {
    if (!projectId || !taskId) throw new Error('Missing IDs');

    const updated = await commentsService.updateComment(projectId, taskId, commentId, data);
    setComments(prev => prev.map(c => c.id === commentId ? updated : c));
    return updated;
  }, [projectId, taskId]);

  const deleteComment = useCallback(async (commentId: string): Promise<void> => {
    if (!projectId || !taskId) return;

    await commentsService.deleteComment(projectId, taskId, commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  }, [projectId, taskId]);

  return {
    comments,
    loading,
    error,
    fetchComments,
    createComment,
    updateComment,
    deleteComment,
  };
}
