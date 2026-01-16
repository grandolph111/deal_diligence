import { describe, it, expect, vi, beforeEach } from 'vitest';
import { projectsService } from './projects.service';
import { apiClient } from '../client';

// Mock the apiClient
vi.mock('../client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('projectsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getProjects', () => {
    it('should call GET /projects and return projects list', async () => {
      const mockProjects = [
        { id: '1', name: 'Project 1', description: null },
        { id: '2', name: 'Project 2', description: 'Description' },
      ];
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockProjects);

      const result = await projectsService.getProjects();

      expect(apiClient.get).toHaveBeenCalledWith('/projects');
      expect(result).toEqual(mockProjects);
    });
  });

  describe('getProject', () => {
    it('should call GET /projects/:id and return project', async () => {
      const mockProject = { id: '1', name: 'Project 1', description: null };
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockProject);

      const result = await projectsService.getProject('1');

      expect(apiClient.get).toHaveBeenCalledWith('/projects/1');
      expect(result).toEqual(mockProject);
    });
  });

  describe('createProject', () => {
    it('should call POST /projects with data and return created project', async () => {
      const newProject = { name: 'New Project', description: 'Description' };
      const mockResponse = { id: '1', ...newProject };
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const result = await projectsService.createProject(newProject);

      expect(apiClient.post).toHaveBeenCalledWith('/projects', newProject);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateProject', () => {
    it('should call PATCH /projects/:id with data and return updated project', async () => {
      const updateData = { name: 'Updated Name' };
      const mockResponse = { id: '1', name: 'Updated Name', description: null };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(mockResponse);

      const result = await projectsService.updateProject('1', updateData);

      expect(apiClient.patch).toHaveBeenCalledWith('/projects/1', updateData);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteProject', () => {
    it('should call DELETE /projects/:id', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await projectsService.deleteProject('1');

      expect(apiClient.delete).toHaveBeenCalledWith('/projects/1');
    });
  });
});
