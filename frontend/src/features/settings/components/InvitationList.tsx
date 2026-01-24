import { useState } from 'react';
import { InvitationRow } from './InvitationRow';
import type { PendingInvitation } from '../../../types/api';

interface InvitationListProps {
  invitations: PendingInvitation[];
  onResend: (invitationId: string) => Promise<void>;
  onCancel: (invitationId: string) => Promise<void>;
}

export function InvitationList({
  invitations,
  onResend,
  onCancel,
}: InvitationListProps) {
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  if (invitations.length === 0) {
    return null;
  }

  const handleResend = async (invitation: PendingInvitation) => {
    try {
      setResendingId(invitation.id);
      await onResend(invitation.id);
    } finally {
      setResendingId(null);
    }
  };

  const handleCancel = async (invitation: PendingInvitation) => {
    try {
      setCancellingId(invitation.id);
      await onCancel(invitation.id);
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="invitation-list">
      <div className="invitation-list-header">
        <h4 className="invitation-list-title">
          Pending Invitations ({invitations.length})
        </h4>
      </div>
      {invitations.map((invitation) => (
        <InvitationRow
          key={invitation.id}
          invitation={invitation}
          onResend={handleResend}
          onCancel={handleCancel}
          resending={resendingId === invitation.id}
          cancelling={cancellingId === invitation.id}
        />
      ))}
    </div>
  );
}
