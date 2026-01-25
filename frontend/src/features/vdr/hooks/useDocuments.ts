import { useState, useCallback } from 'react';
import { documentsService, type UploadProgress, type ListDocumentsParams } from '../../../api/services/documents.service';
import type { Document } from '../../../types/api';

interface UseDocumentsOptions {
  projectId?: string;
  autoFetch?: boolean;
}

interface UseDocumentsReturn {
  documents: Document[];
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  } | null;
  uploadProgress: Map<string, UploadProgress>;
  isUploading: boolean;
  fetchDocuments: (params?: ListDocumentsParams) => Promise<void>;
  uploadFiles: (files: File[], folderId: string | null) => Promise<void>;
  deleteDocument: (documentId: string) => Promise<void>;
  moveDocument: (documentId: string, folderId: string | null) => Promise<void>;
  refreshDocuments: () => Promise<void>;
  clearError: () => void;
  clearUploadProgress: () => void;
}

export function useDocuments({
  projectId,
  // autoFetch is reserved for future use when implementing auto-fetch on mount
  autoFetch: _autoFetch = true,
}: UseDocumentsOptions = {}): UseDocumentsReturn {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<UseDocumentsReturn['pagination']>(null);
  const [uploadProgress, setUploadProgress] = useState<Map<string, UploadProgress>>(new Map());
  const [isUploading, setIsUploading] = useState(false);
  const [lastParams, setLastParams] = useState<ListDocumentsParams>({});

  const fetchDocuments = useCallback(
    async (params: ListDocumentsParams = {}) => {
      if (!projectId) {
        return;
      }

      setLoading(true);
      setError(null);
      setLastParams(params);

      try {
        const response = await documentsService.listDocuments(projectId, params);
        setDocuments(response.documents);
        setPagination(response.pagination);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to fetch documents';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [projectId]
  );

  const refreshDocuments = useCallback(async () => {
    await fetchDocuments(lastParams);
  }, [fetchDocuments, lastParams]);

  const uploadFiles = useCallback(
    async (files: File[], folderId: string | null) => {
      if (!projectId) {
        return;
      }

      setIsUploading(true);
      setError(null);

      // Initialize progress for all files
      const initialProgress = new Map<string, UploadProgress>();
      for (const file of files) {
        initialProgress.set(file.name, {
          documentId: '',
          filename: file.name,
          progress: 0,
          status: 'pending',
        });
      }
      setUploadProgress(initialProgress);

      try {
        const result = await documentsService.uploadFiles(
          projectId,
          files,
          folderId,
          (filename, progress, status) => {
            setUploadProgress((prev) => {
              const newProgress = new Map(prev);
              const existing = newProgress.get(filename);
              if (existing) {
                newProgress.set(filename, { ...existing, progress, status });
              }
              return newProgress;
            });
          }
        );

        // Handle any failures
        if (result.failed.length > 0) {
          const failedNames = result.failed.map((f) => f.filename).join(', ');
          setError(`Some files failed to upload: ${failedNames}`);
        }

        // Refresh document list to show new documents
        await refreshDocuments();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to upload files';
        setError(message);
      } finally {
        setIsUploading(false);
      }
    },
    [projectId, refreshDocuments]
  );

  const deleteDocument = useCallback(
    async (documentId: string) => {
      if (!projectId) {
        return;
      }

      try {
        await documentsService.deleteDocument(projectId, documentId);
        setDocuments((prev) => prev.filter((d) => d.id !== documentId));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to delete document';
        setError(message);
        throw err;
      }
    },
    [projectId]
  );

  const moveDocument = useCallback(
    async (documentId: string, folderId: string | null) => {
      if (!projectId) {
        return;
      }

      try {
        const updated = await documentsService.moveDocument(projectId, documentId, folderId);
        setDocuments((prev) =>
          prev.map((d) => (d.id === documentId ? updated : d))
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to move document';
        setError(message);
        throw err;
      }
    },
    [projectId]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearUploadProgress = useCallback(() => {
    setUploadProgress(new Map());
  }, []);

  return {
    documents,
    loading,
    error,
    pagination,
    uploadProgress,
    isUploading,
    fetchDocuments,
    uploadFiles,
    deleteDocument,
    moveDocument,
    refreshDocuments,
    clearError,
    clearUploadProgress,
  };
}
