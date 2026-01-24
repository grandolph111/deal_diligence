import { useState, useCallback, useEffect } from 'react';
import { foldersService, apiClient } from '../../../api';
import type { FolderTreeNode, FolderPathItem, CreateFolderDto } from '../../../types/api';

interface UseFoldersOptions {
  projectId: string | undefined;
  autoFetch?: boolean;
}

interface UseFoldersReturn {
  folderTree: FolderTreeNode[];
  loading: boolean;
  error: string | null;
  selectedFolderId: string | null;
  folderPath: FolderPathItem[];
  documentCounts: Map<string, number>;
  setSelectedFolderId: (id: string | null) => void;
  fetchFolders: () => Promise<void>;
  createFolder: (data: CreateFolderDto) => Promise<FolderTreeNode | null>;
  renameFolder: (folderId: string, name: string) => Promise<boolean>;
  deleteFolder: (folderId: string) => Promise<boolean>;
  clearError: () => void;
}

/**
 * Hook for managing VDR folder state and operations
 */
export function useFolders({ projectId, autoFetch = true }: UseFoldersOptions): UseFoldersReturn {
  const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [folderPath, setFolderPath] = useState<FolderPathItem[]>([]);
  const [documentCounts, setDocumentCounts] = useState<Map<string, number>>(new Map());

  // Fetch folder tree and document counts
  const fetchFolders = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);

      // Fetch both tree and flat list (for document counts) in parallel
      const [tree, flatFolders] = await Promise.all([
        foldersService.getFolderTree(projectId),
        foldersService.getFoldersFlat(projectId),
      ]);

      setFolderTree(tree);

      // Build document counts map from flat folders
      const counts = new Map<string, number>();
      for (const folder of flatFolders) {
        const count = folder._count?.documents ?? 0;
        counts.set(folder.id, count);
      }
      setDocumentCounts(counts);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load folders';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Fetch folder path when selection changes
  const fetchFolderPath = useCallback(async () => {
    if (!projectId || !selectedFolderId) {
      setFolderPath([]);
      return;
    }

    try {
      const path = await foldersService.getFolderPath(projectId, selectedFolderId);
      setFolderPath(path);
    } catch {
      // Silently handle - breadcrumb is not critical
      setFolderPath([]);
    }
  }, [projectId, selectedFolderId]);

  // Create folder
  const createFolder = useCallback(async (data: CreateFolderDto): Promise<FolderTreeNode | null> => {
    if (!projectId) return null;

    try {
      const newFolder = await foldersService.createFolder(projectId, data);
      await fetchFolders(); // Refresh tree
      return newFolder as FolderTreeNode;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create folder';
      throw new Error(message);
    }
  }, [projectId, fetchFolders]);

  // Rename folder
  const renameFolder = useCallback(async (folderId: string, name: string): Promise<boolean> => {
    if (!projectId) return false;

    try {
      await foldersService.updateFolder(projectId, folderId, { name });
      await fetchFolders(); // Refresh tree
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rename folder';
      throw new Error(message);
    }
  }, [projectId, fetchFolders]);

  // Delete folder
  const deleteFolder = useCallback(async (folderId: string): Promise<boolean> => {
    if (!projectId) return false;

    try {
      await foldersService.deleteFolder(projectId, folderId);
      // Clear selection if deleted folder was selected
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
      await fetchFolders(); // Refresh tree
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete folder';
      throw new Error(message);
    }
  }, [projectId, fetchFolders, selectedFolderId]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch && apiClient.isReady()) {
      fetchFolders();
    }
  }, [autoFetch, fetchFolders]);

  // Update folder path when selection changes
  useEffect(() => {
    fetchFolderPath();
  }, [fetchFolderPath]);

  return {
    folderTree,
    loading,
    error,
    selectedFolderId,
    folderPath,
    documentCounts,
    setSelectedFolderId,
    fetchFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    clearError,
  };
}
