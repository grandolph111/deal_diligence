import { apiClient } from '../client';
import type {
  PendingInvitation,
  CreateInvitationDto,
  InvitationResult,
} from '../../types/api';

/**
 * Invitations API service
 * Handles project invitation management
 */
export const invitationsService = {
  /**
   * Get all pending invitations for a project
   */
  async getInvitations(projectId: string): Promise<PendingInvitation[]> {
    const response = await apiClient.get<{ invitations: PendingInvitation[] }>(
      `/projects/${projectId}/invitations`
    );
    return response.invitations;
  },

  /**
   * Create a new invitation for a project
   * Returns InvitationResult which may contain either a member (if user exists)
   * or an invitation (if user doesn't exist yet)
   */
  async createInvitation(
    projectId: string,
    data: CreateInvitationDto
  ): Promise<InvitationResult> {
    return apiClient.post<InvitationResult>(
      `/projects/${projectId}/invitations`,
      data
    );
  },

  /**
   * Cancel a pending invitation
   */
  async cancelInvitation(projectId: string, invitationId: string): Promise<void> {
    return apiClient.delete(`/projects/${projectId}/invitations/${invitationId}`);
  },

  /**
   * Resend an invitation (extends expiration)
   */
  async resendInvitation(
    projectId: string,
    invitationId: string
  ): Promise<PendingInvitation> {
    return apiClient.post<PendingInvitation>(
      `/projects/${projectId}/invitations/${invitationId}/resend`
    );
  },
};
