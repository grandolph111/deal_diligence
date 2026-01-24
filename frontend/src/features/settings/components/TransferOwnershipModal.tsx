import { useState } from 'react';
import { UserCheck, AlertTriangle } from 'lucide-react';
import type { ProjectMember } from '../../../types/api';

interface TransferOwnershipModalProps {
  members: ProjectMember[];
  currentUserId: string;
  isOpen: boolean;
  transferring: boolean;
  onConfirm: (newOwnerId: string) => Promise<void>;
  onCancel: () => void;
}

export function TransferOwnershipModal({
  members,
  currentUserId,
  isOpen,
  transferring,
  onConfirm,
  onCancel,
}: TransferOwnershipModalProps) {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // Filter out the current owner
  const eligibleMembers = members.filter(
    (m) => m.userId !== currentUserId && m.role !== 'OWNER'
  );

  const selectedMember = eligibleMembers.find(
    (m) => m.userId === selectedMemberId
  );

  const handleConfirm = async () => {
    if (!selectedMemberId || transferring) return;
    await onConfirm(selectedMemberId);
  };

  const handleClose = () => {
    if (transferring) return;
    setSelectedMemberId(null);
    onCancel();
  };

  if (!isOpen) return null;

  const getInitials = (name: string | null, email: string) => {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return email[0].toUpperCase();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '500px' }}
      >
        <div className="modal-header">
          <h3>
            <UserCheck size={20} />
            Transfer Ownership
          </h3>
          <button
            className="icon-button"
            onClick={handleClose}
            disabled={transferring}
          >
            &times;
          </button>
        </div>

        <div className="modal-content">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: 'var(--space-3)',
              backgroundColor: 'var(--color-warning-light)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 'var(--space-4)',
            }}
          >
            <AlertTriangle size={20} color="var(--color-warning)" />
            <p style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
              Transferring ownership will make you an Admin. This action cannot be undone by you.
            </p>
          </div>

          {eligibleMembers.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-description">
                No other members available to transfer ownership to.
                Invite members first.
              </p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 'var(--text-sm)', marginBottom: 'var(--space-3)' }}>
                Select a member to become the new owner:
              </p>
              <div className="member-select-list">
                {eligibleMembers.map((member) => (
                  <div
                    key={member.id}
                    className={`member-select-option ${
                      selectedMemberId === member.userId ? 'selected' : ''
                    }`}
                    onClick={() => setSelectedMemberId(member.userId)}
                  >
                    <div className="member-avatar">
                      {member.user.avatarUrl ? (
                        <img src={member.user.avatarUrl} alt={member.user.name || ''} />
                      ) : (
                        getInitials(member.user.name, member.user.email)
                      )}
                    </div>
                    <div className="member-info">
                      <p className="member-name">
                        {member.user.name || member.user.email}
                      </p>
                      <p className="member-email">{member.user.email}</p>
                    </div>
                    <span className={`member-role ${member.role.toLowerCase()}`}>
                      {member.role}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button
            className="button secondary"
            onClick={handleClose}
            disabled={transferring}
          >
            Cancel
          </button>
          <button
            className="button primary"
            onClick={handleConfirm}
            disabled={!selectedMember || transferring}
          >
            {transferring ? 'Transferring...' : 'Transfer Ownership'}
          </button>
        </div>
      </div>
    </div>
  );
}
