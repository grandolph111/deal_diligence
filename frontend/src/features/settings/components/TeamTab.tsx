import { useState } from 'react';
import { UserPlus, AlertTriangle } from 'lucide-react';
import { MemberList } from './MemberList';
import { MemberEditModal } from './MemberEditModal';
import { InvitationList } from './InvitationList';
import { InviteMemberModal } from './InviteMemberModal';
import type {
  ProjectMember,
  PendingInvitation,
  Role,
  UpdateMemberDto,
  CreateInvitationDto,
  InvitationResult,
} from '../../../types/api';

interface TeamTabProps {
  members: ProjectMember[];
  invitations: PendingInvitation[];
  currentUserId: string;
  currentUserRole: Role;
  membersLoading: boolean;
  invitationsLoading: boolean;
  onUpdateMember: (memberId: string, data: UpdateMemberDto) => Promise<void>;
  onRemoveMember: (memberId: string) => Promise<void>;
  onCreateInvitation: (data: CreateInvitationDto) => Promise<InvitationResult>;
  onResendInvitation: (invitationId: string) => Promise<void>;
  onCancelInvitation: (invitationId: string) => Promise<void>;
  onRefresh: () => void;
}

export function TeamTab({
  members,
  invitations,
  currentUserId,
  currentUserRole,
  membersLoading,
  invitationsLoading,
  onUpdateMember,
  onRemoveMember,
  onCreateInvitation,
  onResendInvitation,
  onCancelInvitation,
  onRefresh,
}: TeamTabProps) {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingMember, setEditingMember] = useState<ProjectMember | null>(null);
  const [memberToRemove, setMemberToRemove] = useState<ProjectMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);

  const handleEditMember = (member: ProjectMember) => {
    setEditingMember(member);
  };

  const handleSaveMember = async (memberId: string, data: UpdateMemberDto) => {
    try {
      setSaving(true);
      await onUpdateMember(memberId, data);
      setEditingMember(null);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveMember = async (member: ProjectMember) => {
    setMemberToRemove(member);
  };

  const confirmRemoveMember = async () => {
    if (!memberToRemove) return;
    try {
      setSaving(true);
      await onRemoveMember(memberToRemove.id);
      setMemberToRemove(null);
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async (data: CreateInvitationDto): Promise<InvitationResult> => {
    setInviting(true);
    try {
      const result = await onCreateInvitation(data);
      onRefresh();
      return result;
    } finally {
      setInviting(false);
    }
  };

  const isLoading = membersLoading || invitationsLoading;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Team Members Section */}
      <div className="settings-section">
        <div className="settings-section-header">
          <div>
            <h3 className="settings-section-title">Team Members</h3>
            <p className="settings-section-description">
              Manage who has access to this project
            </p>
          </div>
          <button
            className="button primary"
            onClick={() => setShowInviteModal(true)}
          >
            <UserPlus size={16} />
            Invite Member
          </button>
        </div>

        {isLoading ? (
          <div className="settings-loading">
            <div className="spinner"></div>
            <span>Loading team...</span>
          </div>
        ) : (
          <>
            <MemberList
              members={members}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              onEditMember={handleEditMember}
              onRemoveMember={handleRemoveMember}
            />

            <InvitationList
              invitations={invitations}
              onResend={onResendInvitation}
              onCancel={onCancelInvitation}
            />
          </>
        )}
      </div>

      {/* Edit Member Modal */}
      <MemberEditModal
        member={editingMember}
        currentUserRole={currentUserRole}
        isOpen={!!editingMember}
        saving={saving}
        onSave={handleSaveMember}
        onCancel={() => setEditingMember(null)}
      />

      {/* Invite Member Modal */}
      <InviteMemberModal
        isOpen={showInviteModal}
        inviting={inviting}
        currentUserRole={currentUserRole}
        onInvite={handleInvite}
        onCancel={() => setShowInviteModal(false)}
      />

      {/* Remove Member Confirmation */}
      {memberToRemove && (
        <div className="modal-overlay" onClick={() => setMemberToRemove(null)}>
          <div
            className="modal confirm-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="confirm-dialog-content">
              <div className="confirm-dialog-icon warning">
                <AlertTriangle size={48} />
              </div>
              <h3 className="confirm-dialog-title">Remove Member</h3>
              <p className="confirm-dialog-message">
                Are you sure you want to remove{' '}
                <strong>{memberToRemove.user.name || memberToRemove.user.email}</strong>{' '}
                from this project? They will lose access to all project resources.
              </p>
            </div>
            <div className="confirm-dialog-actions">
              <button
                className="button secondary"
                onClick={() => setMemberToRemove(null)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="button danger"
                onClick={confirmRemoveMember}
                disabled={saving}
              >
                {saving ? 'Removing...' : 'Remove Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
