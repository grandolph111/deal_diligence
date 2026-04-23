import { apiClient } from '../client';
import type { DealBrief } from '../../types/api';

export const briefService = {
  async get(projectId: string): Promise<DealBrief> {
    return apiClient.get<DealBrief>(`/projects/${projectId}/brief`);
  },

  async saveHumanSection(
    projectId: string,
    sectionId: 'team-notes' | 'custom-context',
    content: string
  ): Promise<{ scopeKey: string; markdown: string }> {
    return apiClient.put<{ scopeKey: string; markdown: string }>(
      `/projects/${projectId}/brief/sections/${sectionId}`,
      { content }
    );
  },

  async rebuild(projectId: string): Promise<{ success: true }> {
    return apiClient.post<{ success: true }>(
      `/projects/${projectId}/brief/rebuild`
    );
  },
};
