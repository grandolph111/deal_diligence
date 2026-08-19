import { apiClient } from '../client';
import type { ProjectReadiness } from '../../types/api';

/**
 * AI readiness API service.
 *
 * Reports whether a deal has been read far enough for chat and Kanban AI to
 * answer, scoped to the folders the caller can actually see.
 */
export const readinessService = {
  async getReadiness(projectId: string): Promise<ProjectReadiness> {
    return apiClient.get<ProjectReadiness>(`/projects/${projectId}/readiness`);
  },
};
