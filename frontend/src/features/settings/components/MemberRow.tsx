import { Edit2, Trash2, FolderLock } from 'lucide-react';
import type { ProjectMember, Role } from '../../../types/api';

interface MemberRowProps {
  member: ProjectMember;
  currentUserId: string;
  currentUserRole: Role;
  onEdit: (member: ProjectMember) => void;
  onRemove: (member: ProjectMember) => void;
}

export function MemberRow({
  member,
  currentUserId,
  currentUserRole,
  onEdit,
  onRemove,
}: MemberRowProps) {
  const isCurrentUser = member.userId === currentUserId;
  const isOwner = member.role === 'OWNER';
  const isAdmin = member.role === 'ADMIN';
  const canModify =
    !isOwner &&
    (currentUserRole === 'OWNER' ||
      (currentUserRole === 'ADMIN' && !isAdmin));

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
    <div className="member-row">
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
          {isCurrentUser && <span className="member-you"> (you)</span>}
        </p>
        <p className="member-email">{member.user.email}</p>
      </div>
      <div className="member-meta">
      <span className={`member-role ${member.role.toLowerCase()}`}>
        {member.role}
      </span>
      {member.role !== 'OWNER' && member.role !== 'ADMIN' && (() => {
        const workstreams = member.permissions?.restrictedWorkstreams?.length ?? 0;
        const legacyFolders = member.permissions?.restrictedFolders?.length ?? 0;
        if (workstreams > 0) {
          return (
            <span
              className="member-scope-chip"
              title={`Restricted to ${workstreams} workstream(s)`}
            >
              <FolderLock size={12} />
              {workstreams} workstream{workstreams === 1 ? '' : 's'}
            </span>
          );
        }
        // A member carrying only pre-migration folder grants can no longer see
        // anything: folder grants do not translate to workstreams, and nothing
        // infers them. Say so here rather than letting it read as a bug.
        if (legacyFolders > 0) {
          return (
            <span
              className="member-scope-chip is-stale"
              title="This member's access was granted by folder, which is no longer used for scoping. Re-grant workstreams to restore their access."
            >
              <FolderLock size={12} />
              Needs re-grant
            </span>
          );
        }
        return null;
      })()}
      </div>
      {/* Always rendered so every row keeps the same right-hand column. */}
      <div className="member-actions">
        {canModify && !isCurrentUser && (
          <>
            <button
              className="icon-button"
              title="Edit member"
              aria-label={`Edit ${member.user.name || member.user.email}`}
              onClick={() => onEdit(member)}
            >
              <Edit2 size={15} />
            </button>
            <button
              className="icon-button destructive"
              title="Remove member"
              aria-label={`Remove ${member.user.name || member.user.email}`}
              onClick={() => onRemove(member)}
            >
              <Trash2 size={15} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
