import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Check, Sparkles } from 'lucide-react';
import { composePrompt } from '../utils/promptSections';
import type {
  Priority,
  TaskStatus,
  CreateTaskDto,
  ProjectMember,
} from '../../../types/api';

interface TaskFormProps {
  initialStatus?: TaskStatus;
  members?: ProjectMember[];
  onSubmit: (data: CreateTaskDto) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

export function TaskForm({
  initialStatus = 'TODO',
  members = [],
  onSubmit,
  onCancel,
  isSubmitting,
}: TaskFormProps) {
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([]);
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setAssigneeDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    try {
      setError(null);
      const aiPrompt = objective.trim()
        ? composePrompt({ objective: objective.trim(), hints: '', output: '' })
        : undefined;
      await onSubmit({
        title: title.trim(),
        status: initialStatus,
        priority,
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        assigneeIds:
          selectedAssignees.length > 0 ? selectedAssignees : undefined,
        aiPrompt,
      });
    } catch {
      setError('Failed to create task');
    }
  };

  const toggleAssignee = (userId: string) => {
    setSelectedAssignees((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  };

  const removeAssignee = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedAssignees((prev) => prev.filter((id) => id !== userId));
  };

  const getSelectedMembers = () =>
    members.filter((m) => selectedAssignees.includes(m.user.id));

  return (
    <form onSubmit={handleSubmit} className="task-form">
      {error && <div className="form-error">{error}</div>}

      <div className="form-group">
        <label htmlFor="title">Title *</label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Review indemnification caps across SPA"
          autoFocus
        />
      </div>

      <div className="form-group">
        <label htmlFor="objective">
          <Sparkles
            size={12}
            style={{ color: 'var(--color-primary)', marginRight: 4 }}
          />
          Objective (what should the AI do?)
        </label>
        <textarea
          id="objective"
          value={objective}
          onChange={(e) => setObjective(e.target.value)}
          placeholder="e.g. Identify all change-of-control triggers and assess acquirer risk across attached documents."
          rows={3}
        />
        <p
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-muted)',
            marginTop: 'var(--space-2)',
          }}
        >
          You can add hints, constraints, and output format later in the task
          drawer before running.
        </p>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Priority)}
          >
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="dueDate">Due Date</label>
          <input
            id="dueDate"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>

      {members.length > 0 && (
        <div className="form-group">
          <label>Assignees</label>
          <div className="assignee-select-container" ref={dropdownRef}>
            <div
              className="assignee-select-trigger"
              onClick={() => setAssigneeDropdownOpen(!assigneeDropdownOpen)}
            >
              {selectedAssignees.length === 0 ? (
                <span className="assignee-select-placeholder">
                  Select assignees...
                </span>
              ) : (
                <div className="selected-assignees">
                  {getSelectedMembers().map((member) => (
                    <span
                      key={member.user.id}
                      className="selected-assignee-chip"
                    >
                      <span className="assignee-avatar">
                        {member.user.avatarUrl ? (
                          <img src={member.user.avatarUrl} alt="" />
                        ) : (
                          (
                            member.user.name ||
                            member.user.email ||
                            '?'
                          )[0].toUpperCase()
                        )}
                      </span>
                      <span>{member.user.name || member.user.email}</span>
                      <button
                        type="button"
                        className="chip-remove-btn"
                        onClick={(e) => removeAssignee(member.user.id, e)}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <ChevronDown size={16} />
            </div>

            {assigneeDropdownOpen && (
              <div className="assignee-select-dropdown">
                {members.map((member) => (
                  <div
                    key={member.user.id}
                    className={`assignee-select-option ${
                      selectedAssignees.includes(member.user.id)
                        ? 'selected'
                        : ''
                    }`}
                    onClick={() => toggleAssignee(member.user.id)}
                  >
                    <span className="assignee-avatar">
                      {member.user.avatarUrl ? (
                        <img src={member.user.avatarUrl} alt="" />
                      ) : (
                        (
                          member.user.name ||
                          member.user.email ||
                          '?'
                        )[0].toUpperCase()
                      )}
                    </span>
                    <div className="assignee-option-info">
                      <div className="assignee-option-name">
                        {member.user.name || member.user.email}
                      </div>
                      {member.user.name && (
                        <div className="assignee-option-email">
                          {member.user.email}
                        </div>
                      )}
                    </div>
                    {selectedAssignees.includes(member.user.id) && (
                      <Check size={16} className="assignee-check" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="form-actions">
        <button
          type="button"
          className="button secondary"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="button primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Creating…' : 'Create task'}
        </button>
      </div>
    </form>
  );
}
