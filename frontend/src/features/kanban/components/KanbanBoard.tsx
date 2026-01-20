import { useEffect, useState } from 'react';
import { DndContext, DragOverlay, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Plus, RefreshCw } from 'lucide-react';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { TaskDetailDrawer } from './TaskDetailDrawer';
import { TaskCreateModal } from './TaskCreateModal';
import { useKanbanBoard } from '../hooks/useKanbanBoard';
import { useTaskDetail } from '../hooks/useTaskDetail';
import { useDragAndDrop } from '../hooks/useDragAndDrop';
import { apiClient } from '../../../api';
import type { Task, TaskStatus } from '../../../types/api';

interface KanbanBoardProps {
  projectId: string | undefined;
  currentUserId: string | undefined;
  isAdmin: boolean;
}

const columns: { status: TaskStatus; title: string }[] = [
  { status: 'TODO', title: 'To Do' },
  { status: 'IN_PROGRESS', title: 'In Progress' },
  { status: 'IN_REVIEW', title: 'In Review' },
  { status: 'COMPLETE', title: 'Completed' },
];

export function KanbanBoard({ projectId, currentUserId, isAdmin }: KanbanBoardProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createStatus, setCreateStatus] = useState<TaskStatus>('TODO');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const { board, loading, error, fetchBoard, createTask, moveTask, deleteTask } = useKanbanBoard(projectId);
  const { task: taskDetail, loading: taskLoading, fetchTask, updateTask, clearTask } = useTaskDetail(projectId);
  const { activeId, overId, handleDragStart, handleDragOver, handleDragEnd, handleDragCancel } = useDragAndDrop(moveTask);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    if (projectId && apiClient.isReady()) {
      fetchBoard().catch(() => {});
    }
  }, [projectId, fetchBoard]);

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    fetchTask(task.id).catch(() => {});
  };

  const handleCloseDrawer = () => {
    setSelectedTask(null);
    clearTask();
  };

  const handleAddTask = (status: TaskStatus) => {
    setCreateStatus(status);
    setShowCreateModal(true);
  };

  const handleRefresh = async () => {
    await fetchBoard();
    if (selectedTask) {
      await fetchTask(selectedTask.id);
    }
  };

  const getActiveTask = (): Task | undefined => {
    if (!activeId || !board) return undefined;
    for (const status of Object.keys(board) as TaskStatus[]) {
      const task = board[status].find((t) => t.id === activeId);
      if (task) return task;
    }
    return undefined;
  };

  if (loading && !board) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading board...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-container">
        <p className="error-message">{error}</p>
        <button className="button secondary" onClick={() => fetchBoard()}>
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="kanban-board-container">
      <div className="kanban-header">
        <h2>Kanban Board</h2>
        <div className="kanban-actions">
          <button className="button ghost" onClick={handleRefresh} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'spinning' : ''} />
          </button>
          <button className="button primary" onClick={() => handleAddTask('TODO')}>
            <Plus size={16} />
            Add Task
          </button>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="kanban-board">
          {columns.map(({ status, title }) => (
            <KanbanColumn
              key={status}
              status={status}
              title={title}
              tasks={board?.[status] || []}
              onTaskClick={handleTaskClick}
              onAddTask={() => handleAddTask(status)}
              isOver={overId === status}
              activeTaskId={activeId}
            />
          ))}
        </div>

        <DragOverlay>
          {activeId ? (
            <TaskCard
              task={getActiveTask()!}
              onClick={() => {}}
              isDragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={createTask}
        initialStatus={createStatus}
      />

      {selectedTask && (
        <TaskDetailDrawer
          task={taskDetail || selectedTask}
          loading={taskLoading}
          projectId={projectId}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onClose={handleCloseDrawer}
          onUpdate={updateTask}
          onDelete={deleteTask}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  );
}
