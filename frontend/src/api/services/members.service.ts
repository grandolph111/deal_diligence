import { apiClient } from '../client';
import type {
  ProjectMember,
  InviteMemberDto,
  UpdateMemberDto,
} from '../../types/api';

/**
 * Members API service
 * Handles project member management
 */
export const membersService = {
  /**
   * Get all members of a project
   */
  async getMembers(projectId: string): Promise<ProjectMember[]> {
    return apiClient.get<ProjectMember[]>(`/projects/${projectId}/members`);
  },

  /**
   * Get a specific member by ID
   */
  async getMember(projectId: string, memberId: string): Promise<ProjectMember> {
    return apiClient.get<ProjectMember>(`/projects/${projectId}/members/${memberId}`);
  },

  /**
   * Invite a new member to the project
   */
  async inviteMember(projectId: string, data: InviteMemberDto): Promise<ProjectMember> {
    return apiClient.post<ProjectMember>(`/projects/${projectId}/members/invite`, data);
  },

  /**
   * Update a member's role or permissions
   */
  async updateMember(
    projectId: string,
    memberId: string,
    data: UpdateMemberDto
  ): Promise<ProjectMember> {
    return apiClient.patch<ProjectMember>(
      `/projects/${projectId}/members/${memberId}`,
      data
    );
  },

  /**
   * Remove a member from the project
   */
  async removeMember(projectId: string, memberId: string): Promise<void> {
    return apiClient.delete(`/projects/${projectId}/members/${memberId}`);
  },

  /**
   * Leave a project (self-removal)
   */
  async leaveProject(projectId: string): Promise<void> {
    return apiClient.post(`/projects/${projectId}/members/leave`);
  },
};
