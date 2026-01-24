import { Edit2, Trash2 } from 'lucide-react';
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
          {isCurrentUser && (
            <span style={{ color: 'var(--text-muted)', fontWeight: 'normal' }}>
              {' '}
              (you)
            </span>
          )}
        </p>
        <p className="member-email">{member.user.email}</p>
      </div>
      <span className={`member-role ${member.role.toLowerCase()}`}>
        {member.role}
      </span>
      {canModify && !isCurrentUser && (
        <div className="member-actions">
          <button
            className="icon-button"
            title="Edit member"
            onClick={() => onEdit(member)}
          >
            <Edit2 size={16} />
          </button>
          <button
            className="icon-button"
            title="Remove member"
            onClick={() => onRemove(member)}
          >
            <Trash2 size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
