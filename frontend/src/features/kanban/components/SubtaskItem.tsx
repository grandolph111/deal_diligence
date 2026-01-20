import { useState } from 'react';
import { Circle, CheckCircle, Clock, Trash2, Calendar } from 'lucide-react';
import type { Subtask, SubtaskStatus } from '../../../types/api';

interface SubtaskItemProps {
  subtask: Subtask;
  onUpdate: (subtaskId: string, status: SubtaskStatus) => Promise<void>;
  onDelete: (subtaskId: string) => Promise<void>;
}

const statusIcons: Record<SubtaskStatus, typeof Circle> = {
  TODO: Circle,
  IN_PROGRESS: Clock,
  COMPLETE: CheckCircle,
};

export function SubtaskItem({ subtask, onUpdate, onDelete }: SubtaskItemProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const StatusIcon = statusIcons[subtask.status];

  const cycleStatus = async () => {
    const nextStatus: Record<SubtaskStatus, SubtaskStatus> = {
      TODO: 'IN_PROGRESS',
      IN_PROGRESS: 'COMPLETE',
      COMPLETE: 'TODO',
    };
    await onUpdate(subtask.id, nextStatus[subtask.status]);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(subtask.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className={`subtask-item ${subtask.status === 'COMPLETE' ? 'completed' : ''}`}>
      <button
        className={`subtask-status-btn ${subtask.status.toLowerCase()}`}
        onClick={cycleStatus}
        title={`Status: ${subtask.status.replace('_', ' ')}`}
      >
        <StatusIcon size={16} />
      </button>

      <div className="subtask-content">
        <span className="subtask-title">{subtask.title}</span>
        <div className="subtask-meta">
          {subtask.dueDate && (
            <span className="subtask-due">
              <Calendar size={12} />
              {formatDate(subtask.dueDate)}
            </span>
          )}
          {subtask.assignee && (
            <span className="subtask-assignee">
              {subtask.assignee.name || subtask.assignee.email}
            </span>
          )}
        </div>
      </div>

      <button
        className="button ghost sm"
        onClick={handleDelete}
        disabled={isDeleting}
        title="Delete subtask"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
