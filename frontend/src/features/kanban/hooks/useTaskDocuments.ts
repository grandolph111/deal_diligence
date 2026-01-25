import { useState, useCallback } from 'react';
import { taskDocumentsService } from '../../../api/services/task-documents.service';
import type { LinkedDocument } from '../../../types/api';

export function useTaskDocuments(projectId: string | undefined, taskId: string | undefined) {
  const [linkedDocuments, setLinkedDocuments] = useState<LinkedDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTaskDocuments = useCallback(async () => {
    if (!projectId || !taskId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await taskDocumentsService.getTaskDocuments(projectId, taskId);
      setLinkedDocuments(data);
    } catch (err) {
      setError('Failed to load linked documents');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId]);

  const linkDocument = useCallback(async (documentId: string): Promise<LinkedDocument> => {
    if (!projectId || !taskId) throw new Error('Missing IDs');

    const linkedDoc = await taskDocumentsService.linkDocument(projectId, taskId, { documentId });
    setLinkedDocuments(prev => [linkedDoc, ...prev]);
    return linkedDoc;
  }, [projectId, taskId]);

  const unlinkDocument = useCallback(async (documentId: string): Promise<void> => {
    if (!projectId || !taskId) return;

    await taskDocumentsService.unlinkDocument(projectId, taskId, documentId);
    setLinkedDocuments(prev => prev.filter(ld => ld.documentId !== documentId));
  }, [projectId, taskId]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    linkedDocuments,
    loading,
    error,
    fetchTaskDocuments,
    linkDocument,
    unlinkDocument,
    clearError,
  };
}
