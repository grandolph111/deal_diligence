import { apiClient } from '../client';
import type {
  KanbanBoardSummary,
  KanbanBoardDetail,
  BoardSmeOption,
  CreateBoardDto,
  UpdateBoardDto,
} from '../../types/api';

export const boardsService = {
  async list(projectId: string): Promise<{ boards: KanbanBoardSummary[] }> {
    return apiClient.get<{ boards: KanbanBoardSummary[] }>(
      `/projects/${projectId}/boards`
    );
  },

  /** Members who can be named as a board's SME. Admin-only on the API. */
  async listSmes(projectId: string): Promise<{ smes: BoardSmeOption[] }> {
    return apiClient.get<{ smes: BoardSmeOption[] }>(
      `/projects/${projectId}/boards/smes`
    );
  },

  async get(projectId: string, boardId: string): Promise<KanbanBoardDetail> {
    return apiClient.get<KanbanBoardDetail>(
      `/projects/${projectId}/boards/${boardId}`
    );
  },

  async create(
    projectId: string,
    data: CreateBoardDto
  ): Promise<KanbanBoardDetail> {
    return apiClient.post<KanbanBoardDetail>(
      `/projects/${projectId}/boards`,
      data
    );
  },

  async update(
    projectId: string,
    boardId: string,
    data: UpdateBoardDto
  ): Promise<KanbanBoardDetail> {
    return apiClient.patch<KanbanBoardDetail>(
      `/projects/${projectId}/boards/${boardId}`,
      data
    );
  },

  async remove(projectId: string, boardId: string): Promise<void> {
    return apiClient.delete(`/projects/${projectId}/boards/${boardId}`);
  },
};
