import { apiClient } from '../client';
import type {
  TaskComment,
  CreateCommentDto,
  UpdateCommentDto,
} from '../../types/api';

export const commentsService = {
  async getComments(projectId: string, taskId: string): Promise<TaskComment[]> {
    return apiClient.get<TaskComment[]>(
      `/projects/${projectId}/tasks/${taskId}/comments`
    );
  },

  async createComment(
    projectId: string,
    taskId: string,
    data: CreateCommentDto
  ): Promise<TaskComment> {
    return apiClient.post<TaskComment>(
      `/projects/${projectId}/tasks/${taskId}/comments`,
      data
    );
  },

  async updateComment(
    projectId: string,
    taskId: string,
    commentId: string,
    data: UpdateCommentDto
  ): Promise<TaskComment> {
    return apiClient.patch<TaskComment>(
      `/projects/${projectId}/tasks/${taskId}/comments/${commentId}`,
      data
    );
  },

  async deleteComment(
    projectId: string,
    taskId: string,
    commentId: string
  ): Promise<void> {
    return apiClient.delete(
      `/projects/${projectId}/tasks/${taskId}/comments/${commentId}`
    );
  },
};
