import { apiClient } from '../client';
import type { User } from '../../types/api';

/**
 * Auth API service
 * Handles user authentication and profile management
 */
export const authService = {
  /**
   * Get or create the current user (syncs with Auth0)
   * Called after successful Auth0 login to sync user in backend
   */
  async getCurrentUser(): Promise<User> {
    return apiClient.get<User>('/auth/me');
  },

  /**
   * Update the current user's profile
   */
  async updateCurrentUser(data: { name?: string; avatarUrl?: string }): Promise<User> {
    return apiClient.patch<User>('/auth/me', data);
  },
};
