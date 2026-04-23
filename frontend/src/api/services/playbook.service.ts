import { apiClient } from '../client';
import type { Playbook } from '../../types/api';

export const playbookService = {
  async get(projectId: string): Promise<{ playbook: Playbook | null }> {
    return apiClient.get<{ playbook: Playbook | null }>(
      `/projects/${projectId}/playbook`
    );
  },

  async template(projectId: string): Promise<{ playbook: Playbook }> {
    return apiClient.get<{ playbook: Playbook }>(
      `/projects/${projectId}/playbook/template`
    );
  },

  async save(projectId: string, playbook: Playbook): Promise<{ playbook: Playbook }> {
    return apiClient.put<{ playbook: Playbook }>(
      `/projects/${projectId}/playbook`,
      playbook
    );
  },

  async clear(projectId: string): Promise<void> {
    return apiClient.delete(`/projects/${projectId}/playbook`);
  },
};
