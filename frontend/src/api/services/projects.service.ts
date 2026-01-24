import { apiClient } from '../client';
import type {
  Project,
  CreateProjectDto,
  UpdateProjectDto,
} from '../../types/api';

/**
 * Projects API service
 * Handles project CRUD operations
 */
export const projectsService = {
  /**
   * Get all projects for the current user
   */
  async getProjects(): Promise<Project[]> {
    return apiClient.get<Project[]>('/projects');
  },

  /**
   * Get a single project by ID
   */
  async getProject(id: string): Promise<Project> {
    return apiClient.get<Project>(`/projects/${id}`);
  },

  /**
   * Create a new project
   */
  async createProject(data: CreateProjectDto): Promise<Project> {
    return apiClient.post<Project>('/projects', data);
  },

  /**
   * Update a project
   */
  async updateProject(id: string, data: UpdateProjectDto): Promise<Project> {
    return apiClient.patch<Project>(`/projects/${id}`, data);
  },

  /**
   * Delete a project
   */
  async deleteProject(id: string): Promise<void> {
    return apiClient.delete(`/projects/${id}`);
  },

  /**
   * Archive or unarchive a project
   */
  async archiveProject(id: string, isArchived: boolean): Promise<Project> {
    return apiClient.post<Project>(`/projects/${id}/archive`, { isArchived });
  },

  /**
   * Transfer project ownership to another member
   */
  async transferOwnership(id: string, newOwnerId: string): Promise<void> {
    return apiClient.post(`/projects/${id}/transfer-ownership`, { newOwnerId });
  },
};
