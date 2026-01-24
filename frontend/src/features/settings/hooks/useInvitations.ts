import { useState, useCallback } from 'react';
import { invitationsService } from '../../../api/services/invitations.service';
import type { PendingInvitation, CreateInvitationDto, InvitationResult } from '../../../types/api';

export function useInvitations(projectId: string | undefined) {
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInvitations = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await invitationsService.getInvitations(projectId);
      // Filter out accepted invitations
      setInvitations(data.filter(inv => !inv.acceptedAt));
    } catch (err) {
      setError('Failed to load invitations');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const createInvitation = useCallback(async (
    data: CreateInvitationDto
  ): Promise<InvitationResult> => {
    if (!projectId) throw new Error('No project ID');

    const result = await invitationsService.createInvitation(projectId, data);
    await fetchInvitations();
    return result;
  }, [projectId, fetchInvitations]);

  const cancelInvitation = useCallback(async (invitationId: string): Promise<void> => {
    if (!projectId) throw new Error('No project ID');

    await invitationsService.cancelInvitation(projectId, invitationId);
    await fetchInvitations();
  }, [projectId, fetchInvitations]);

  const resendInvitation = useCallback(async (
    invitationId: string
  ): Promise<PendingInvitation> => {
    if (!projectId) throw new Error('No project ID');

    const updated = await invitationsService.resendInvitation(projectId, invitationId);
    await fetchInvitations();
    return updated;
  }, [projectId, fetchInvitations]);

  return {
    invitations,
    loading,
    error,
    fetchInvitations,
    createInvitation,
    cancelInvitation,
    resendInvitation,
  };
}
