import { useState, FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import type { Role, CreateInvitationDto, MemberPermissions, InvitationResult } from '../../../types/api';

interface InviteMemberModalProps {
  isOpen: boolean;
  inviting: boolean;
  currentUserRole: Role;
  onInvite: (data: CreateInvitationDto) => Promise<InvitationResult>;
  onCancel: () => void;
}

export function InviteMemberModal({
  isOpen,
  inviting,
  currentUserRole,
  onInvite,
  onCancel,
}: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Exclude<Role, 'OWNER'>>('MEMBER');
  const [canAccessKanban, setCanAccessKanban] = useState(true);
  const [canAccessVDR, setCanAccessVDR] = useState(false);
  const [canUploadDocs, setCanUploadDocs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetForm = () => {
    setEmail('');
    setRole('MEMBER');
    setCanAccessKanban(true);
    setCanAccessVDR(false);
    setCanUploadDocs(false);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (inviting || !email.trim()) return;

    setError(null);
    setSuccess(null);

    const permissions: MemberPermissions = {
      canAccessKanban,
      canAccessVDR,
      canUploadDocs,
    };

    try {
      const result = await onInvite({
        email: email.trim().toLowerCase(),
        role,
        permissions,
      });

      if (result.type === 'existing_user') {
        setSuccess(`${email} has been added to the project.`);
      } else {
        setSuccess(`Invitation sent to ${email}.`);
      }
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation');
    }
  };

  const handleClose = () => {
    if (inviting) return;
    resetForm();
    onCancel();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '480px' }}
      >
        <div className="modal-header">
          <h3>
            <UserPlus size={20} />
            Invite Team Member
          </h3>
          <button
            className="icon-button"
            onClick={handleClose}
            disabled={inviting}
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-content">
            {error && (
              <div className="form-error">{error}</div>
            )}
            {success && (
              <div
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-success-light)',
                  color: 'var(--color-success)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                {success}
              </div>
            )}

            {/* Email Input */}
            <div className="form-group">
              <label htmlFor="invite-email">Email Address</label>
              <input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                required
                disabled={inviting}
                autoFocus
              />
            </div>

            {/* Role Selection */}
            <div className="form-group">
              <label htmlFor="invite-role">Role</label>
              <select
                id="invite-role"
                className="role-select"
                value={role}
                onChange={(e) => setRole(e.target.value as Exclude<Role, 'OWNER'>)}
                disabled={inviting}
              >
                {currentUserRole === 'OWNER' && <option value="ADMIN">Admin</option>}
                <option value="MEMBER">Member</option>
                <option value="VIEWER">Viewer</option>
              </select>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
                {role === 'ADMIN' && 'Full access to manage project and team'}
                {role === 'MEMBER' && 'Can work on tasks with configured permissions'}
                {role === 'VIEWER' && 'Read-only access with configured permissions'}
              </p>
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
                      disabled={inviting}
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
                      onChange={(e) => {
                        setCanAccessVDR(e.target.checked);
                        if (!e.target.checked) setCanUploadDocs(false);
                      }}
                      disabled={inviting}
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
                      disabled={inviting || !canAccessVDR}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={handleClose}
              disabled={inviting}
            >
              Close
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={inviting || !email.trim()}
            >
              {inviting ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
