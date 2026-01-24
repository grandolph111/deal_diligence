import { apiClient } from '../client';
import type {
  Folder,
  FolderTreeNode,
  FolderPathItem,
  CreateFolderDto,
  UpdateFolderDto,
  MoveFolderDto,
} from '../../types/api';

/**
 * Folders API service
 * Handles VDR folder operations
 */
export const foldersService = {
  /**
   * Get folder tree for a project (hierarchical structure)
   */
  async getFolderTree(projectId: string): Promise<FolderTreeNode[]> {
    return apiClient.get<FolderTreeNode[]>(`/projects/${projectId}/folders`);
  },

  /**
   * Get flat list of folders with document counts
   */
  async getFoldersFlat(projectId: string): Promise<Folder[]> {
    return apiClient.get<Folder[]>(`/projects/${projectId}/folders`, {
      format: 'flat',
    });
  },

  /**
   * Get a single folder by ID
   */
  async getFolder(projectId: string, folderId: string): Promise<Folder> {
    return apiClient.get<Folder>(`/projects/${projectId}/folders/${folderId}`);
  },

  /**
   * Get folder breadcrumb path
   */
  async getFolderPath(projectId: string, folderId: string): Promise<FolderPathItem[]> {
    return apiClient.get<FolderPathItem[]>(`/projects/${projectId}/folders/${folderId}/path`);
  },

  /**
   * Create a new folder
   */
  async createFolder(projectId: string, data: CreateFolderDto): Promise<Folder> {
    return apiClient.post<Folder>(`/projects/${projectId}/folders`, data);
  },

  /**
   * Update a folder (rename, update viewOnly)
   */
  async updateFolder(projectId: string, folderId: string, data: UpdateFolderDto): Promise<Folder> {
    return apiClient.patch<Folder>(`/projects/${projectId}/folders/${folderId}`, data);
  },

  /**
   * Move a folder to a new parent
   */
  async moveFolder(projectId: string, folderId: string, data: MoveFolderDto): Promise<Folder> {
    return apiClient.patch<Folder>(`/projects/${projectId}/folders/${folderId}/move`, data);
  },

  /**
   * Delete an empty folder
   */
  async deleteFolder(projectId: string, folderId: string): Promise<void> {
    return apiClient.delete(`/projects/${projectId}/folders/${folderId}`);
  },
};
