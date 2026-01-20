import { useEffect, useState } from 'react';
import { X, Calendar, User, Tag, Trash2 } from 'lucide-react';
import { PriorityBadge } from './PriorityBadge';
import { CommentList } from './CommentList';
import { SubtaskList } from './SubtaskList';
import { useComments } from '../hooks/useComments';
import { useSubtasks } from '../hooks/useSubtasks';
import type { Task, Priority, TaskStatus, UpdateTaskDto, SubtaskStatus } from '../../../types/api';

interface TaskDetailDrawerProps {
  task: Task | null;
  loading: boolean;
  projectId: string | undefined;
  currentUserId: string | undefined;
  isAdmin: boolean;
  onClose: () => void;
  onUpdate: (taskId: string, data: UpdateTaskDto) => Promise<Task>;
  onDelete: (taskId: string) => Promise<void>;
  onRefresh: () => void;
}

export function TaskDetailDrawer({
  task,
  loading,
  projectId,
  currentUserId,
  isAdmin,
  onClose,
  onUpdate,
  onDelete,
  onRefresh,
}: TaskDetailDrawerProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('MEDIUM');
  const [editStatus, setEditStatus] = useState<TaskStatus>('TODO');
  const [editDueDate, setEditDueDate] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    comments,
    loading: commentsLoading,
    fetchComments,
    createComment,
    updateComment,
    deleteComment,
  } = useComments(projectId, task?.id);

  const {
    subtasks,
    loading: subtasksLoading,
    fetchSubtasks,
    createSubtask,
    updateSubtask,
    deleteSubtask,
  } = useSubtasks(projectId, task?.id);

  useEffect(() => {
    if (task) {
      setEditTitle(task.title);
      setEditDescription(task.description || '');
      setEditPriority(task.priority);
      setEditStatus(task.status);
      setEditDueDate(task.dueDate ? task.dueDate.split('T')[0] : '');
      fetchComments().catch(() => {});
      fetchSubtasks().catch(() => {});
    }
  }, [task, fetchComments, fetchSubtasks]);

  if (!task) return null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdate(task.id, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        priority: editPriority,
        status: editStatus,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : undefined,
      });
      setIsEditing(false);
      onRefresh();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(task.id);
      onClose();
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const handleAddComment = async (content: string) => {
    await createComment({ content });
  };

  const handleUpdateComment = async (commentId: string, content: string) => {
    await updateComment(commentId, { content });
  };

  const handleAddSubtask = async (title: string) => {
    await createSubtask({ title });
  };

  const handleUpdateSubtask = async (subtaskId: string, status: SubtaskStatus) => {
    await updateSubtask(subtaskId, { status });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="task-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title-row">
            {isEditing ? (
              <input
                type="text"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="drawer-title-input"
                autoFocus
              />
            ) : (
              <h2>{task.title}</h2>
            )}
          </div>
          <button className="button ghost" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="loading-spinner" />
          </div>
        ) : (
          <div className="drawer-content">
            <div className="drawer-main">
              {/* Status & Priority */}
              <div className="task-meta-row">
                {isEditing ? (
                  <>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as TaskStatus)}
                      className="meta-select"
                    >
                      <option value="TODO">To Do</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="IN_REVIEW">In Review</option>
                      <option value="COMPLETE">Complete</option>
                    </select>
                    <select
                      value={editPriority}
                      onChange={(e) => setEditPriority(e.target.value as Priority)}
                      className="meta-select"
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                      <option value="URGENT">Urgent</option>
                    </select>
                  </>
                ) : (
                  <>
                    <span className={`status-badge status-${task.status.toLowerCase()}`}>
                      {task.status.replace('_', ' ')}
                    </span>
                    <PriorityBadge priority={task.priority} />
                  </>
                )}
              </div>

              {/* Description */}
              <div className="task-section">
                <h4>Description</h4>
                {isEditing ? (
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={4}
                    placeholder="Add a description..."
                  />
                ) : (
                  <p className="task-description">
                    {task.description || 'No description'}
                  </p>
                )}
              </div>

              {/* Due Date */}
              <div className="task-section">
                <h4>
                  <Calendar size={14} />
                  Due Date
                </h4>
                {isEditing ? (
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                  />
                ) : (
                  <p>{task.dueDate ? formatDate(task.dueDate) : 'No due date'}</p>
                )}
              </div>

              {/* Assignees */}
              <div className="task-section">
                <h4>
                  <User size={14} />
                  Assignees
                </h4>
                <div className="assignees-list">
                  {task.assignees && task.assignees.length > 0 ? (
                    task.assignees.map((taskAssignee) => (
                      <div key={taskAssignee.user.id} className="assignee-chip">
                        {taskAssignee.user.avatarUrl ? (
                          <img src={taskAssignee.user.avatarUrl} alt={taskAssignee.user.name || ''} />
                        ) : (
                          <span className="assignee-initial">
                            {(taskAssignee.user.name || taskAssignee.user.email || '?')[0].toUpperCase()}
                          </span>
                        )}
                        <span>{taskAssignee.user.name || taskAssignee.user.email}</span>
                      </div>
                    ))
                  ) : (
                    <p className="no-assignees">No assignees</p>
                  )}
                </div>
              </div>

              {/* Tags */}
              {task.tags && task.tags.length > 0 && (
                <div className="task-section">
                  <h4>
                    <Tag size={14} />
                    Tags
                  </h4>
                  <div className="tags-list">
                    {task.tags.map((taskTag) => (
                      <span
                        key={taskTag.tag.id}
                        className="tag-chip"
                        style={{ backgroundColor: taskTag.tag.color }}
                      >
                        {taskTag.tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Subtasks */}
              <div className="task-section">
                <SubtaskList
                  subtasks={subtasks}
                  loading={subtasksLoading}
                  onAddSubtask={handleAddSubtask}
                  onUpdateSubtask={handleUpdateSubtask}
                  onDeleteSubtask={deleteSubtask}
                />
              </div>

              {/* Comments */}
              <div className="task-section">
                <CommentList
                  comments={comments}
                  loading={commentsLoading}
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  onAddComment={handleAddComment}
                  onUpdateComment={handleUpdateComment}
                  onDeleteComment={deleteComment}
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="drawer-footer">
              {isEditing ? (
                <>
                  <button
                    className="button secondary"
                    onClick={() => setIsEditing(false)}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  <button className="button primary" onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="button danger"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                  <button className="button secondary" onClick={() => setIsEditing(true)}>
                    Edit Task
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {showDeleteConfirm && (
          <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Delete Task</h3>
              <p>Are you sure you want to delete "{task.title}"? This cannot be undone.</p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button className="button danger" onClick={handleDelete} disabled={isDeleting}>
                  {isDeleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
