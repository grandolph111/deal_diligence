import { useState, useEffect } from 'react';
import { UserCog } from 'lucide-react';
import type { ProjectMember, Role, UpdateMemberDto, MemberPermissions } from '../../../types/api';

interface MemberEditModalProps {
  member: ProjectMember | null;
  currentUserRole: Role;
  isOpen: boolean;
  saving: boolean;
  onSave: (memberId: string, data: UpdateMemberDto) => Promise<void>;
  onCancel: () => void;
}

export function MemberEditModal({
  member,
  currentUserRole,
  isOpen,
  saving,
  onSave,
  onCancel,
}: MemberEditModalProps) {
  const [role, setRole] = useState<Role>('VIEWER');
  const [canAccessKanban, setCanAccessKanban] = useState(true);
  const [canAccessVDR, setCanAccessVDR] = useState(false);
  const [canUploadDocs, setCanUploadDocs] = useState(false);

  useEffect(() => {
    if (member) {
      setRole(member.role);
      setCanAccessKanban(member.permissions?.canAccessKanban ?? true);
      setCanAccessVDR(member.permissions?.canAccessVDR ?? false);
      setCanUploadDocs(member.permissions?.canUploadDocs ?? false);
    }
  }, [member]);

  const handleSave = async () => {
    if (!member || saving) return;

    const permissions: MemberPermissions = {
      canAccessKanban,
      canAccessVDR,
      canUploadDocs,
    };

    await onSave(member.id, { role, permissions });
  };

  const handleClose = () => {
    if (saving) return;
    onCancel();
  };

  if (!isOpen || !member) return null;

  const isAdminRole = currentUserRole === 'ADMIN';
  const canChangeRole = currentUserRole === 'OWNER' || (isAdminRole && member.role !== 'ADMIN');

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
        style={{ maxWidth: '480px' }}
      >
        <div className="modal-header">
          <h3>
            <UserCog size={20} />
            Edit Member
          </h3>
          <button
            className="icon-button"
            onClick={handleClose}
            disabled={saving}
          >
            &times;
          </button>
        </div>

        <div className="modal-content">
          {/* Member Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
            <div className="member-avatar">
              {member.user.avatarUrl ? (
                <img src={member.user.avatarUrl} alt={member.user.name || ''} />
              ) : (
                getInitials(member.user.name, member.user.email)
              )}
            </div>
            <div>
              <p style={{ fontWeight: 500, margin: 0 }}>
                {member.user.name || member.user.email}
              </p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', margin: 0 }}>
                {member.user.email}
              </p>
            </div>
          </div>

          {/* Role Selection */}
          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label htmlFor="member-role">Role</label>
            <select
              id="member-role"
              className="role-select"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              disabled={!canChangeRole || saving}
            >
              {currentUserRole === 'OWNER' && <option value="ADMIN">Admin</option>}
              <option value="MEMBER">Member</option>
              <option value="VIEWER">Viewer</option>
            </select>
            {!canChangeRole && (
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
                Admins cannot change other admins' roles
              </p>
            )}
          </div>

          {/* Permissions */}
          {(role === 'MEMBER' || role === 'VIEWER') && (
            <div className="permissions-form">
              <h4 className="permissions-group-title">Permissions</h4>

              <div className="permission-toggle">
                <div className="permission-label">
                  <span className="permission-title">Access Kanban Board</span>
                  <span className="permission-description">View and manage tasks</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={canAccessKanban}
                    onChange={(e) => setCanAccessKanban(e.target.checked)}
                    disabled={saving}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="permission-toggle">
                <div className="permission-label">
                  <span className="permission-title">Access Data Room</span>
                  <span className="permission-description">View documents in VDR</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={canAccessVDR}
                    onChange={(e) => setCanAccessVDR(e.target.checked)}
                    disabled={saving}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>

              <div className="permission-toggle">
                <div className="permission-label">
                  <span className="permission-title">Upload Documents</span>
                  <span className="permission-description">Upload files to VDR</span>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={canUploadDocs}
                    onChange={(e) => setCanUploadDocs(e.target.checked)}
                    disabled={saving || !canAccessVDR}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button
            className="button secondary"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="button primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
