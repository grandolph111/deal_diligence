import { useState, useCallback } from 'react';
import { membersService } from '../../../api/services/members.service';
import type { ProjectMember, UpdateMemberDto } from '../../../types/api';

export function useTeamMembers(projectId: string | undefined) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMembers = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await membersService.getMembers(projectId);
      setMembers(data);
    } catch (err) {
      setError('Failed to load members');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const updateMember = useCallback(async (
    memberId: string,
    data: UpdateMemberDto
  ): Promise<ProjectMember> => {
    if (!projectId) throw new Error('No project ID');

    const updated = await membersService.updateMember(projectId, memberId, data);
    await fetchMembers();
    return updated;
  }, [projectId, fetchMembers]);

  const removeMember = useCallback(async (memberId: string): Promise<void> => {
    if (!projectId) throw new Error('No project ID');

    await membersService.removeMember(projectId, memberId);
    await fetchMembers();
  }, [projectId, fetchMembers]);

  return {
    members,
    loading,
    error,
    fetchMembers,
    updateMember,
    removeMember,
  };
}
