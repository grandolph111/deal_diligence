import { useState } from 'react';
import { X, UserPlus } from 'lucide-react';
import { membersService } from '../../../api/services/members.service';
import type { Role } from '../../../types/api';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSuccess: () => void;
}

export function InviteMemberModal({ isOpen, onClose, projectId, onSuccess }: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [canAccessKanban, setCanAccessKanban] = useState(true);
  const [canAccessVDR, setCanAccessVDR] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await membersService.inviteMember(projectId, {
        email: email.trim(),
        role,
        permissions: {
          canAccessKanban,
          canAccessVDR,
        },
      });
      onSuccess();
      onClose();
      setEmail('');
      setRole('MEMBER');
    } catch (err) {
      setError('Failed to send invitation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <UserPlus size={20} />
            Invite Team Member
          </h3>
          <button className="button ghost sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-content">
            {error && <div className="form-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@company.com"
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="role">Role</label>
              <select id="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                <option value="VIEWER">Viewer - Read-only access</option>
                <option value="MEMBER">Member - Can create and edit</option>
                <option value="ADMIN">Admin - Full access</option>
              </select>
            </div>

            {(role === 'MEMBER' || role === 'VIEWER') && (
              <div className="form-group">
                <label>Permissions</label>
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={canAccessKanban}
                      onChange={(e) => setCanAccessKanban(e.target.checked)}
                    />
                    Access Kanban Board
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={canAccessVDR}
                      onChange={(e) => setCanAccessVDR(e.target.checked)}
                    />
                    Access Virtual Data Room
                  </label>
                </div>
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button type="button" className="button secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={isSubmitting}>
              {isSubmitting ? 'Sending...' : 'Send Invitation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
