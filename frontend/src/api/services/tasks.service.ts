import { apiClient } from '../client';
import type {
  Task,
  KanbanBoard,
  CreateTaskDto,
  UpdateTaskDto,
  UpdateTaskStatusDto,
  TaskFilters,
} from '../../types/api';

/**
 * Tasks API service
 * Handles task CRUD and Kanban operations
 */
export const tasksService = {
  /**
   * Get all tasks for a project with optional filters
   */
  async getTasks(projectId: string, filters?: TaskFilters): Promise<Task[]> {
    const params: Record<string, string | undefined> = {};
    if (filters) {
      if (filters.status) params.status = filters.status;
      if (filters.priority) params.priority = filters.priority;
      if (filters.assigneeId) params.assigneeId = filters.assigneeId;
      if (filters.tagId) params.tagId = filters.tagId;
      if (filters.search) params.search = filters.search;
      if (filters.dueBefore) params.dueBefore = filters.dueBefore;
      if (filters.dueAfter) params.dueAfter = filters.dueAfter;
    }
    return apiClient.get<Task[]>(`/projects/${projectId}/tasks`, params);
  },

  /**
   * Get tasks grouped by status for a Kanban board. Pass `boardId` to scope
   * to a specific board; omit to fetch the project-wide view.
   */
  async getKanbanBoard(projectId: string, boardId?: string): Promise<KanbanBoard> {
    const params: Record<string, string> = {};
    if (boardId) params.boardId = boardId;
    return apiClient.get<KanbanBoard>(
      `/projects/${projectId}/tasks/board`,
      params
    );
  },

  /**
   * Get a single task by ID
   */
  async getTask(projectId: string, taskId: string): Promise<Task> {
    return apiClient.get<Task>(`/projects/${projectId}/tasks/${taskId}`);
  },

  /**
   * Create a new task
   */
  async createTask(projectId: string, data: CreateTaskDto): Promise<Task> {
    return apiClient.post<Task>(`/projects/${projectId}/tasks`, data);
  },

  /**
   * Update a task
   */
  async updateTask(
    projectId: string,
    taskId: string,
    data: UpdateTaskDto
  ): Promise<Task> {
    return apiClient.patch<Task>(`/projects/${projectId}/tasks/${taskId}`, data);
  },

  /**
   * Update task status (for drag-drop in Kanban)
   */
  async updateTaskStatus(
    projectId: string,
    taskId: string,
    data: UpdateTaskStatusDto
  ): Promise<Task> {
    return apiClient.patch<Task>(
      `/projects/${projectId}/tasks/${taskId}/status`,
      data
    );
  },

  /**
   * Delete a task
   */
  async deleteTask(projectId: string, taskId: string): Promise<void> {
    return apiClient.delete(`/projects/${projectId}/tasks/${taskId}`);
  },

  /**
   * Add an assignee to a task
   */
  async addAssignee(projectId: string, taskId: string, userId: string): Promise<Task> {
    return apiClient.post<Task>(
      `/projects/${projectId}/tasks/${taskId}/assignees`,
      { userId }
    );
  },

  /**
   * Remove an assignee from a task
   */
  async removeAssignee(
    projectId: string,
    taskId: string,
    userId: string
  ): Promise<void> {
    return apiClient.delete(
      `/projects/${projectId}/tasks/${taskId}/assignees/${userId}`
    );
  },

  /**
   * Add a tag to a task
   */
  async addTag(projectId: string, taskId: string, tagId: string): Promise<Task> {
    return apiClient.post<Task>(
      `/projects/${projectId}/tasks/${taskId}/tags`,
      { tagId }
    );
  },

  /**
   * Remove a tag from a task
   */
  async removeTag(projectId: string, taskId: string, tagId: string): Promise<void> {
    return apiClient.delete(
      `/projects/${projectId}/tasks/${taskId}/tags/${tagId}`
    );
  },

  /**
   * Fetch the Claude-generated risk report markdown for an AI task.
   */
  async getAiReport(projectId: string, taskId: string): Promise<string> {
    return apiClient.getText(`/projects/${projectId}/tasks/${taskId}/ai-report`);
  },

  async runAi(projectId: string, taskId: string): Promise<{ success: true }> {
    return apiClient.post<{ success: true }>(
      `/projects/${projectId}/tasks/${taskId}/run-ai`
    );
  },

  async approveAiReport(projectId: string, taskId: string): Promise<Task> {
    return apiClient.post<Task>(
      `/projects/${projectId}/tasks/${taskId}/ai-approve`
    );
  },

  async requestAiChanges(projectId: string, taskId: string): Promise<Task> {
    return apiClient.post<Task>(
      `/projects/${projectId}/tasks/${taskId}/ai-request-changes`
    );
  },
};
