import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tasksService } from './tasks.service';
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

describe('tasksService', () => {
  const projectId = 'project-123';
  const taskId = 'task-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getTasks', () => {
    it('should call GET /projects/:id/tasks without filters', async () => {
      const mockTasks = [{ id: taskId, title: 'Task 1', status: 'TODO' }];
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockTasks);

      const result = await tasksService.getTasks(projectId);

      expect(apiClient.get).toHaveBeenCalledWith(`/projects/${projectId}/tasks`, {});
      expect(result).toEqual(mockTasks);
    });

    it('should call GET /projects/:id/tasks with filters', async () => {
      const mockTasks = [{ id: taskId, title: 'Task 1', status: 'TODO' }];
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockTasks);

      const result = await tasksService.getTasks(projectId, {
        status: 'TODO',
        priority: 'HIGH',
        assigneeId: 'user-123',
      });

      expect(apiClient.get).toHaveBeenCalledWith(`/projects/${projectId}/tasks`, {
        status: 'TODO',
        priority: 'HIGH',
        assigneeId: 'user-123',
      });
      expect(result).toEqual(mockTasks);
    });
  });

  describe('getKanbanBoard', () => {
    it('should call GET /projects/:id/tasks/board and return kanban structure', async () => {
      const mockBoard = {
        TODO: [{ id: '1', title: 'Task 1', status: 'TODO' }],
        IN_PROGRESS: [],
        IN_REVIEW: [],
        COMPLETE: [],
      };
      vi.mocked(apiClient.get).mockResolvedValueOnce(mockBoard);

      const result = await tasksService.getKanbanBoard(projectId);

      expect(apiClient.get).toHaveBeenCalledWith(`/projects/${projectId}/tasks/board`);
      expect(result).toEqual(mockBoard);
    });
  });

  describe('createTask', () => {
    it('should call POST /projects/:id/tasks with data', async () => {
      const newTask = { title: 'New Task', priority: 'HIGH' as const };
      const mockResponse = { id: taskId, ...newTask, status: 'TODO' };
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const result = await tasksService.createTask(projectId, newTask);

      expect(apiClient.post).toHaveBeenCalledWith(`/projects/${projectId}/tasks`, newTask);
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateTask', () => {
    it('should call PATCH /projects/:id/tasks/:taskId with data', async () => {
      const updateData = { title: 'Updated Title' };
      const mockResponse = { id: taskId, ...updateData };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(mockResponse);

      const result = await tasksService.updateTask(projectId, taskId, updateData);

      expect(apiClient.patch).toHaveBeenCalledWith(
        `/projects/${projectId}/tasks/${taskId}`,
        updateData
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('updateTaskStatus', () => {
    it('should call PATCH /projects/:id/tasks/:taskId/status for drag-drop', async () => {
      const statusUpdate = { status: 'IN_PROGRESS' as const };
      const mockResponse = { id: taskId, status: 'IN_PROGRESS' };
      vi.mocked(apiClient.patch).mockResolvedValueOnce(mockResponse);

      const result = await tasksService.updateTaskStatus(projectId, taskId, statusUpdate);

      expect(apiClient.patch).toHaveBeenCalledWith(
        `/projects/${projectId}/tasks/${taskId}/status`,
        statusUpdate
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('deleteTask', () => {
    it('should call DELETE /projects/:id/tasks/:taskId', async () => {
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await tasksService.deleteTask(projectId, taskId);

      expect(apiClient.delete).toHaveBeenCalledWith(`/projects/${projectId}/tasks/${taskId}`);
    });
  });

  describe('addAssignee', () => {
    it('should call POST /projects/:id/tasks/:taskId/assignees', async () => {
      const userId = 'user-789';
      const mockResponse = { id: taskId, assignees: [{ userId }] };
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const result = await tasksService.addAssignee(projectId, taskId, userId);

      expect(apiClient.post).toHaveBeenCalledWith(
        `/projects/${projectId}/tasks/${taskId}/assignees`,
        { userId }
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('removeAssignee', () => {
    it('should call DELETE /projects/:id/tasks/:taskId/assignees/:userId', async () => {
      const userId = 'user-789';
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await tasksService.removeAssignee(projectId, taskId, userId);

      expect(apiClient.delete).toHaveBeenCalledWith(
        `/projects/${projectId}/tasks/${taskId}/assignees/${userId}`
      );
    });
  });

  describe('addTag', () => {
    it('should call POST /projects/:id/tasks/:taskId/tags', async () => {
      const tagId = 'tag-123';
      const mockResponse = { id: taskId, tags: [{ tagId }] };
      vi.mocked(apiClient.post).mockResolvedValueOnce(mockResponse);

      const result = await tasksService.addTag(projectId, taskId, tagId);

      expect(apiClient.post).toHaveBeenCalledWith(
        `/projects/${projectId}/tasks/${taskId}/tags`,
        { tagId }
      );
      expect(result).toEqual(mockResponse);
    });
  });

  describe('removeTag', () => {
    it('should call DELETE /projects/:id/tasks/:taskId/tags/:tagId', async () => {
      const tagId = 'tag-123';
      vi.mocked(apiClient.delete).mockResolvedValueOnce(undefined);

      await tasksService.removeTag(projectId, taskId, tagId);

      expect(apiClient.delete).toHaveBeenCalledWith(
        `/projects/${projectId}/tasks/${taskId}/tags/${tagId}`
      );
    });
  });
});
