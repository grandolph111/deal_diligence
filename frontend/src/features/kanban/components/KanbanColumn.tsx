import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { TaskCard } from './TaskCard';
import type { Task, TaskStatus } from '../../../types/api';

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onAddTask: () => void;
  isOver?: boolean;
  activeTaskId?: string | null;
  currentUserId?: string;
}

const columnColors: Record<TaskStatus, string> = {
  TODO: '#6b7280',
  IN_PROGRESS: '#3b82f6',
  IN_REVIEW: '#f59e0b',
  COMPLETE: '#10b981',
};

export function KanbanColumn({
  status,
  title,
  tasks,
  onTaskClick,
  onAddTask,
  isOver,
  activeTaskId,
  currentUserId,
}: KanbanColumnProps) {
  const { setNodeRef } = useDroppable({
    id: status,
  });

  return (
    <div className={`kanban-column ${isOver ? 'drag-over' : ''}`}>
      <div className="column-header">
        <div className="column-title-row">
          <span
            className="column-indicator"
            style={{ backgroundColor: columnColors[status] }}
          />
          <h3 className="column-title">{title}</h3>
          <span className="column-count">{tasks.length}</span>
        </div>
        <button className="button ghost sm" onClick={onAddTask} title="Add task">
          <Plus size={16} />
        </button>
      </div>

      <div ref={setNodeRef} className="column-content">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task)}
            isDragging={activeTaskId === task.id}
            currentUserId={currentUserId}
          />
        ))}

        {tasks.length === 0 && (
          <div className="column-empty">
            <p>No tasks</p>
          </div>
        )}
      </div>
    </div>
  );
}
