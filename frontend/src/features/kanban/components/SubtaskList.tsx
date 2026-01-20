import { useState } from 'react';
import { Plus } from 'lucide-react';
import { SubtaskItem } from './SubtaskItem';
import type { Subtask, SubtaskStatus } from '../../../types/api';

interface SubtaskListProps {
  subtasks: Subtask[];
  loading: boolean;
  onAddSubtask: (title: string) => Promise<void>;
  onUpdateSubtask: (subtaskId: string, status: SubtaskStatus) => Promise<void>;
  onDeleteSubtask: (subtaskId: string) => Promise<void>;
}

export function SubtaskList({
  subtasks,
  loading,
  onAddSubtask,
  onUpdateSubtask,
  onDeleteSubtask,
}: SubtaskListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const completedCount = subtasks.filter((s) => s.status === 'COMPLETE').length;
  const progress = subtasks.length > 0 ? (completedCount / subtasks.length) * 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    try {
      await onAddSubtask(newTitle.trim());
      setNewTitle('');
      setIsAdding(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsAdding(false);
      setNewTitle('');
    }
  };

  return (
    <div className="subtask-list">
      <div className="subtask-header">
        <h4 className="section-title">Subtasks</h4>
        {subtasks.length > 0 && (
          <span className="subtask-progress-text">
            {completedCount}/{subtasks.length}
          </span>
        )}
      </div>

      {subtasks.length > 0 && (
        <div className="subtask-progress-bar">
          <div className="subtask-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {loading ? (
        <div className="loading-container">
          <div className="loading-spinner sm" />
        </div>
      ) : (
        <>
          <div className="subtasks">
            {subtasks.map((subtask) => (
              <SubtaskItem
                key={subtask.id}
                subtask={subtask}
                onUpdate={onUpdateSubtask}
                onDelete={onDeleteSubtask}
              />
            ))}

            {subtasks.length === 0 && !isAdding && (
              <p className="no-subtasks">No subtasks yet.</p>
            )}
          </div>

          {isAdding ? (
            <form className="subtask-add-form" onSubmit={handleSubmit}>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter subtask title"
                autoFocus
                disabled={isSubmitting}
              />
              <button
                type="submit"
                className="button primary sm"
                disabled={!newTitle.trim() || isSubmitting}
              >
                Add
              </button>
              <button
                type="button"
                className="button secondary sm"
                onClick={() => {
                  setIsAdding(false);
                  setNewTitle('');
                }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <button className="button ghost sm add-subtask-btn" onClick={() => setIsAdding(true)}>
              <Plus size={14} />
              Add subtask
            </button>
          )}
        </>
      )}
    </div>
  );
}
