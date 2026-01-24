import { Mail, RotateCcw, X } from 'lucide-react';
import type { PendingInvitation } from '../../../types/api';

interface InvitationRowProps {
  invitation: PendingInvitation;
  onResend: (invitation: PendingInvitation) => void;
  onCancel: (invitation: PendingInvitation) => void;
  resending: boolean;
  cancelling: boolean;
}

export function InvitationRow({
  invitation,
  onResend,
  onCancel,
  resending,
  cancelling,
}: InvitationRowProps) {
  const isExpired = new Date(invitation.expiresAt) < new Date();
  const expiresDate = new Date(invitation.expiresAt);

  const formatDate = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="invitation-row">
      <div className="invitation-icon">
        <Mail size={20} />
      </div>
      <div className="invitation-info">
        <p className="invitation-email">{invitation.email}</p>
        <p className="invitation-meta">
          <span className={`member-role ${invitation.role.toLowerCase()}`}>
            {invitation.role}
          </span>
          <span>
            {isExpired
              ? `Expired ${formatDate(expiresDate)}`
              : `Expires ${formatDate(expiresDate)}`}
          </span>
        </p>
      </div>
      <span className={`invitation-status ${isExpired ? 'expired' : ''}`}>
        {isExpired ? 'Expired' : 'Pending'}
      </span>
      <div className="invitation-actions">
        <button
          className="icon-button"
          title="Resend invitation"
          onClick={() => onResend(invitation)}
          disabled={resending || cancelling}
        >
          <RotateCcw size={16} className={resending ? 'spinning' : ''} />
        </button>
        <button
          className="icon-button"
          title="Cancel invitation"
          onClick={() => onCancel(invitation)}
          disabled={resending || cancelling}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
