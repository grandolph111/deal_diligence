import { useState } from 'react';
import { X } from 'lucide-react';
import { TaskForm } from './TaskForm';
import type { Task, TaskStatus, CreateTaskDto, ProjectMember } from '../../../types/api';

interface TaskCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: CreateTaskDto) => Promise<Task>;
  initialStatus?: TaskStatus;
  members?: ProjectMember[];
}

export function TaskCreateModal({ isOpen, onClose, onCreate, initialStatus, members }: TaskCreateModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCreate = async (data: CreateTaskDto) => {
    setIsSubmitting(true);
    try {
      await onCreate(data);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Create New Task</h3>
          <button className="button ghost sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-content">
          <TaskForm
            initialStatus={initialStatus}
            members={members}
            onSubmit={handleCreate}
            onCancel={onClose}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    </div>
  );
}
