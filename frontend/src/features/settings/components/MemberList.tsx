import { Users } from 'lucide-react';
import { MemberRow } from './MemberRow';
import type { ProjectMember, Role } from '../../../types/api';

interface MemberListProps {
  members: ProjectMember[];
  currentUserId: string;
  currentUserRole: Role;
  onEditMember: (member: ProjectMember) => void;
  onRemoveMember: (member: ProjectMember) => void;
}

export function MemberList({
  members,
  currentUserId,
  currentUserRole,
  onEditMember,
  onRemoveMember,
}: MemberListProps) {
  if (members.length === 0) {
    return (
      <div className="empty-state">
        <Users size={48} className="empty-state-icon" />
        <h4 className="empty-state-title">No Members</h4>
        <p className="empty-state-description">
          This project has no members yet. Invite team members to get started.
        </p>
      </div>
    );
  }

  // Sort members: Owner first, then Admin, then Member, then Viewer
  const roleOrder: Record<Role, number> = {
    OWNER: 0,
    ADMIN: 1,
    MEMBER: 2,
    VIEWER: 3,
  };

  const sortedMembers = [...members].sort(
    (a, b) => roleOrder[a.role] - roleOrder[b.role]
  );

  return (
    <div className="member-list">
      {sortedMembers.map((member) => (
        <MemberRow
          key={member.id}
          member={member}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          onEdit={onEditMember}
          onRemove={onRemoveMember}
        />
      ))}
    </div>
  );
}
