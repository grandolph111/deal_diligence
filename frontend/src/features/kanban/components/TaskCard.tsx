import { useDraggable } from '@dnd-kit/core';
import { Calendar, MessageSquare, CheckSquare, Sparkles, AlertCircle } from 'lucide-react';
import { PriorityBadge } from './PriorityBadge';
import { AssigneeAvatars } from './AssigneeAvatars';
import { ConfidencePill } from '../../../components/ConfidencePill';
import type { Task, TaskAiStatus } from '../../../types/api';

const AI_PILL: Record<TaskAiStatus, { label: string; cls: string; icon: React.ElementType }> = {
  IDLE: { label: 'AI task', cls: 'chip primary', icon: Sparkles },
  QUEUED: { label: 'Queued', cls: 'chip primary', icon: Sparkles },
  RUNNING: { label: 'Analyzing…', cls: 'chip primary', icon: Sparkles },
  SUCCEEDED: { label: 'Ready for review', cls: 'chip accent', icon: Sparkles },
  FAILED: { label: 'AI failed', cls: 'chip risk-high', icon: AlertCircle },
};

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isDragging?: boolean;
  currentUserId?: string;
}

export function TaskCard({ task, onClick, isDragging, currentUserId }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
  const isAssignedToMe = currentUserId && task.assignees?.some(a => a.user?.id === currentUserId);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`task-card ${isDragging ? 'dragging' : ''} ${isAssignedToMe ? 'assigned-to-me' : ''}`}
      onClick={onClick}
    >
      <div className="task-card-header">
        <PriorityBadge priority={task.priority} />
        {task.aiStatus && (() => {
          const meta = AI_PILL[task.aiStatus];
          const Icon = meta.icon;
          return (
            <span className={meta.cls} style={{ display: 'inline-flex', gap: 4 }}>
              <Icon size={12} />
              {meta.label}
            </span>
          );
        })()}
        {task.aiStatus === 'SUCCEEDED' && task.aiConfidenceScore != null && (
          <ConfidencePill
            score={task.aiConfidenceScore}
            reason={task.aiConfidenceReason}
          />
        )}
        {task.tags && task.tags.length > 0 && (
          <div className="task-tags">
            {task.tags.slice(0, 2).map((taskTag) => (
              <span
                key={taskTag.tag.id}
                className="task-tag"
                style={{ backgroundColor: taskTag.tag.color }}
              >
                {taskTag.tag.name}
              </span>
            ))}
            {task.tags.length > 2 && (
              <span className="task-tag-more">+{task.tags.length - 2}</span>
            )}
          </div>
        )}
      </div>

      <h4 className="task-card-title">{task.title}</h4>

      {task.description && (
        <p className="task-card-description">
          {task.description.length > 100
            ? `${task.description.substring(0, 100)}...`
            : task.description}
        </p>
      )}

      <div className="task-card-footer">
        <div className="task-card-meta">
          {task.dueDate && (
            <span className={`task-due-date ${isOverdue ? 'overdue' : ''}`}>
              <Calendar size={12} />
              {formatDate(task.dueDate)}
            </span>
          )}
          {(task.commentCount ?? 0) > 0 && (
            <span className="task-meta-item">
              <MessageSquare size={12} />
              {task.commentCount}
            </span>
          )}
          {(task.subtaskCount ?? 0) > 0 && (
            <span className="task-meta-item">
              <CheckSquare size={12} />
              {task.subtaskCount}
            </span>
          )}
        </div>
        <AssigneeAvatars assignees={(task.assignees || []).map(a => a.user).filter(Boolean)} maxDisplay={2} />
      </div>
    </div>
  );
}
