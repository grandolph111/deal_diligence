import type { User } from '../../../types/api';

interface AssigneeAvatarsProps {
  assignees: Pick<User, 'id' | 'email' | 'name' | 'avatarUrl'>[];
  maxDisplay?: number;
}

export function AssigneeAvatars({ assignees, maxDisplay = 3 }: AssigneeAvatarsProps) {
  const displayedAssignees = assignees.slice(0, maxDisplay);
  const remaining = assignees.length - maxDisplay;

  if (assignees.length === 0) {
    return <span className="no-assignees">Unassigned</span>;
  }

  return (
    <div className="assignee-avatars">
      {displayedAssignees.map((assignee) => (
        <div
          key={assignee.id}
          className="assignee-avatar"
          title={assignee.name || assignee.email}
        >
          {assignee.avatarUrl ? (
            <img src={assignee.avatarUrl} alt={assignee.name || ''} />
          ) : (
            <span>{(assignee.name || assignee.email || '?')[0].toUpperCase()}</span>
          )}
        </div>
      ))}
      {remaining > 0 && (
        <div className="assignee-avatar more">
          +{remaining}
        </div>
      )}
    </div>
  );
}
