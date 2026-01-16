import { apiClient } from '../client';
import type { Tag, CreateTagDto } from '../../types/api';

/**
 * Tags API service
 * Handles tag management for projects
 */
export const tagsService = {
  /**
   * Get all tags for a project
   */
  async getTags(projectId: string): Promise<Tag[]> {
    return apiClient.get<Tag[]>(`/projects/${projectId}/tags`);
  },

  /**
   * Create a new tag
   */
  async createTag(projectId: string, data: CreateTagDto): Promise<Tag> {
    return apiClient.post<Tag>(`/projects/${projectId}/tags`, data);
  },

  /**
   * Delete a tag
   */
  async deleteTag(projectId: string, tagId: string): Promise<void> {
    return apiClient.delete(`/projects/${projectId}/tags/${tagId}`);
  },
};
