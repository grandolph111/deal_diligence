import { apiClient } from '../client';
import type {
  Subtask,
  CreateSubtaskDto,
  UpdateSubtaskDto,
  ReorderSubtasksDto,
} from '../../types/api';

export const subtasksService = {
  async getSubtasks(projectId: string, taskId: string): Promise<Subtask[]> {
    return apiClient.get<Subtask[]>(
      `/projects/${projectId}/tasks/${taskId}/subtasks`
    );
  },

  async createSubtask(
    projectId: string,
    taskId: string,
    data: CreateSubtaskDto
  ): Promise<Subtask> {
    return apiClient.post<Subtask>(
      `/projects/${projectId}/tasks/${taskId}/subtasks`,
      data
    );
  },

  async updateSubtask(
    projectId: string,
    taskId: string,
    subtaskId: string,
    data: UpdateSubtaskDto
  ): Promise<Subtask> {
    return apiClient.patch<Subtask>(
      `/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}`,
      data
    );
  },

  async deleteSubtask(
    projectId: string,
    taskId: string,
    subtaskId: string
  ): Promise<void> {
    return apiClient.delete(
      `/projects/${projectId}/tasks/${taskId}/subtasks/${subtaskId}`
    );
  },

  async reorderSubtasks(
    projectId: string,
    taskId: string,
    data: ReorderSubtasksDto
  ): Promise<Subtask[]> {
    return apiClient.patch<Subtask[]>(
      `/projects/${projectId}/tasks/${taskId}/subtasks/reorder`,
      data
    );
  },
};
