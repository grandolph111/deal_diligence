import { useEffect, useMemo, useState, useRef } from 'react';
import {
  X,
  Calendar,
  User,
  Tag,
  Trash2,
  Plus,
  Sparkles,
  Save,
  Play,
  Check,
  RotateCcw,
  Loader,
  AlertCircle,
  Download,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PriorityBadge } from './PriorityBadge';
import { ConfidencePill } from '../../../components/ConfidencePill';
import { CommentList } from './CommentList';
import { SubtaskList } from './SubtaskList';
import { DocumentLinkingSection } from './DocumentLinkingSection';
import { LinkDocumentModal } from './LinkDocumentModal';
import { useComments } from '../hooks/useComments';
import { useSubtasks } from '../hooks/useSubtasks';
import { useTaskDocuments } from '../hooks/useTaskDocuments';
import { tasksService } from '../../../api';
import {
  parsePrompt,
  composePrompt,
  hasAnyContent,
  type PromptSections,
} from '../utils/promptSections';
import type {
  Task,
  Priority,
  TaskStatus,
  UpdateTaskDto,
  SubtaskStatus,
  ProjectMember,
} from '../../../types/api';

interface TaskDetailDrawerProps {
  task: Task | null;
  loading: boolean;
  projectId: string | undefined;
  /** Folder IDs the current board is scoped to — constrains the attach-document picker. */
  boardFolderIds?: string[];
  currentUserId: string | undefined;
  isAdmin: boolean;
  isMember: boolean;
  members?: ProjectMember[];
  onClose: () => void;
  onUpdate: (taskId: string, data: UpdateTaskDto) => Promise<Task>;
  onDelete: (taskId: string) => Promise<void>;
  onRefresh: () => void;
  onAddAssignee?: (taskId: string, userId: string) => Promise<void>;
  onRemoveAssignee?: (taskId: string, userId: string) => Promise<void>;
  onViewDocument?: (documentId: string, folderId: string | null) => void;
}

export function TaskDetailDrawer({
  task,
  loading,
  projectId,
  boardFolderIds,
  currentUserId,
  isAdmin,
  isMember,
  members = [],
  onClose,
  onUpdate,
  onDelete,
  onRefresh,
  onAddAssignee,
  onRemoveAssignee,
  onViewDocument,
}: TaskDetailDrawerProps) {
  const [editTitle, setEditTitle] = useState('');
  const [editPriority, setEditPriority] = useState<Priority>('MEDIUM');
  const [editDueDate, setEditDueDate] = useState('');
  const [prompt, setPrompt] = useState<PromptSections>({
    objective: '',
    hints: '',
    output: '',
  });
  const [savingDraft, setSavingDraft] = useState(false);
  const [runningAi, setRunningAi] = useState(false);
  const [approving, setApproving] = useState(false);
  const [requestingChanges, setRequestingChanges] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAssigneeDropdown, setShowAssigneeDropdown] = useState(false);
  const [showLinkDocumentModal, setShowLinkDocumentModal] = useState(false);
  const [assigneeLoading, setAssigneeLoading] = useState<string | null>(null);
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);

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

  const {
    linkedDocuments,
    loading: documentsLoading,
    fetchTaskDocuments,
    linkDocument,
    unlinkDocument,
  } = useTaskDocuments(projectId, task?.id);

  // Seed local form state whenever the opened task changes
  useEffect(() => {
    if (task) {
      setEditTitle(task.title);
      setEditPriority(task.priority);
      setEditDueDate(task.dueDate ? task.dueDate.split('T')[0] : '');
      setPrompt(parsePrompt(task.aiPrompt));
      setErrorMessage(null);
      setReportMarkdown(null);
      fetchComments().catch(() => {});
      fetchSubtasks().catch(() => {});
      fetchTaskDocuments().catch(() => {});
    }
  }, [task, fetchComments, fetchSubtasks, fetchTaskDocuments]);

  // Auto-fetch the AI report when one is ready
  useEffect(() => {
    if (!task || !projectId) return;
    if (task.aiStatus !== 'SUCCEEDED') {
      setReportMarkdown(null);
      return;
    }
    let cancelled = false;
    setReportLoading(true);
    tasksService
      .getAiReport(projectId, task.id)
      .then((md) => {
        if (!cancelled) setReportMarkdown(md);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Failed to load AI report:', err);
          setReportMarkdown(null);
        }
      })
      .finally(() => {
        if (!cancelled) setReportLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [task, projectId, task?.aiStatus, task?.aiReportS3Key]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        assigneeDropdownRef.current &&
        !assigneeDropdownRef.current.contains(event.target as Node)
      ) {
        setShowAssigneeDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const composedPromptPreview = useMemo(() => composePrompt(prompt), [prompt]);
  const hasPrompt = hasAnyContent(prompt);
  const aiStatus = task?.aiStatus ?? null;
  const isLocked =
    aiStatus === 'QUEUED' || aiStatus === 'RUNNING' || runningAi;

  if (!task) return null;

  const persistDraft = async (options?: { silent?: boolean }): Promise<void> => {
    if (!task) return;
    setErrorMessage(null);
    try {
      setSavingDraft(true);
      await onUpdate(task.id, {
        title: editTitle.trim() || task.title,
        priority: editPriority,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : undefined,
        aiPrompt: composedPromptPreview || null,
      });
      if (!options?.silent) onRefresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save.');
      throw err;
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSaveDraft = async () => {
    try {
      await persistDraft();
    } catch {
      // error surfaced above
    }
  };

  const handleRunAi = async () => {
    if (!projectId || !task) return;
    setErrorMessage(null);
    try {
      setRunningAi(true);
      await persistDraft({ silent: true });
      await tasksService.runAi(projectId, task.id);
      onRefresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Run failed.');
    } finally {
      setRunningAi(false);
    }
  };

  const handleApprove = async () => {
    if (!projectId || !task) return;
    try {
      setApproving(true);
      await tasksService.approveAiReport(projectId, task.id);
      onRefresh();
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Approve failed.');
    } finally {
      setApproving(false);
    }
  };

  const handleRequestChanges = async () => {
    if (!projectId || !task) return;
    try {
      setRequestingChanges(true);
      await tasksService.requestAiChanges(projectId, task.id);
      onRefresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setRequestingChanges(false);
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

  const handleStatusChange = async (status: TaskStatus) => {
    try {
      await onUpdate(task.id, { status });
      onRefresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Status update failed.');
    }
  };

  const handleAddComment = async (content: string): Promise<void> => {
    await createComment({ content });
  };
  const handleUpdateComment = async (id: string, content: string): Promise<void> => {
    await updateComment(id, { content });
  };
  const handleAddSubtask = async (title: string): Promise<void> => {
    await createSubtask({ title });
  };
  const handleUpdateSubtask = async (
    id: string,
    status: SubtaskStatus
  ): Promise<void> => {
    await updateSubtask(id, { status });
  };
  const handleLinkDocument = async (id: string): Promise<void> => {
    await linkDocument(id);
  };
  const handleUnlinkDocument = async (id: string): Promise<void> => {
    await unlinkDocument(id);
  };
  const handleViewDocument = (id: string, folderId: string | null) => {
    if (onViewDocument) onViewDocument(id, folderId);
  };

  const handleAddAssignee = async (userId: string) => {
    if (!onAddAssignee) return;
    setAssigneeLoading(userId);
    try {
      await onAddAssignee(task.id, userId);
      setShowAssigneeDropdown(false);
    } finally {
      setAssigneeLoading(null);
    }
  };

  const handleRemoveAssignee = async (userId: string) => {
    if (!onRemoveAssignee) return;
    setAssigneeLoading(userId);
    try {
      await onRemoveAssignee(task.id, userId);
    } finally {
      setAssigneeLoading(null);
    }
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  const availableMembers = members.filter(
    (m) =>
      m.user && !task.assignees?.some((a) => a.user?.id === m.user.id)
  );

  const statusPill = () => {
    if (aiStatus === 'RUNNING' || aiStatus === 'QUEUED') {
      return (
        <span className="ai-status-pill running">
          <Loader size={12} className="spinning" />
          {aiStatus === 'QUEUED' ? 'Queued' : 'Running…'}
        </span>
      );
    }
    if (aiStatus === 'SUCCEEDED') {
      return (
        <span className="ai-status-pill succeeded">
          <Sparkles size={12} />
          Draft ready — review
        </span>
      );
    }
    if (aiStatus === 'FAILED') {
      return (
        <span className="ai-status-pill failed">
          <AlertCircle size={12} />
          Run failed
        </span>
      );
    }
    return (
      <span className="ai-status-pill idle">
        <Sparkles size={12} />
        Draft
      </span>
    );
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div
        className="task-drawer prompt-workflow-drawer"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="drawer-header">
          <div className="drawer-title-row">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="drawer-title-input"
              placeholder="Prompt title…"
            />
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
              {/* Status + priority + due date strip */}
              <div className="task-meta-row">
                <select
                  value={task.status}
                  onChange={(e) =>
                    handleStatusChange(e.target.value as TaskStatus)
                  }
                  className="meta-select"
                  disabled={isLocked}
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
                <PriorityBadge priority={task.priority} />
                {statusPill()}
              </div>

              {errorMessage && (
                <div className="prompt-workflow-error">
                  <AlertCircle size={14} />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Prompt workflow */}
              <div className="prompt-workflow">
                <header className="prompt-workflow-header">
                  <h3>
                    <Sparkles size={16} /> Prompt workflow
                  </h3>
                  <p>
                    Write a structured prompt. Claude runs it against the
                    attached documents and drops a draft here for your review.
                  </p>
                </header>

                <section className="prompt-section">
                  <label>
                    <span className="prompt-section-title">Objective</span>
                    <span className="prompt-section-hint">
                      What do you want the AI to do? Be specific.
                    </span>
                  </label>
                  <textarea
                    value={prompt.objective}
                    onChange={(e) =>
                      setPrompt((p) => ({ ...p, objective: e.target.value }))
                    }
                    placeholder="e.g. Review all indemnification clauses and flag any with caps below 10% of deal value. Summarize by counterparty."
                    rows={4}
                    disabled={isLocked}
                  />
                </section>

                <section className="prompt-section">
                  <label>
                    <span className="prompt-section-title">
                      Hints &amp; constraints
                    </span>
                    <span className="prompt-section-hint">
                      Style, tone, things to watch for, known context.
                    </span>
                  </label>
                  <textarea
                    value={prompt.hints}
                    onChange={(e) =>
                      setPrompt((p) => ({ ...p, hints: e.target.value }))
                    }
                    placeholder={`e.g.\n- Pay special attention to Article 8\n- Assume Delaware law unless stated otherwise\n- Cite page numbers for every flag`}
                    rows={4}
                    disabled={isLocked}
                  />
                </section>

                <section className="prompt-section">
                  <label>
                    <span className="prompt-section-title">
                      Expected output
                    </span>
                    <span className="prompt-section-hint">
                      Deliverable format — sections, bullet list, table, etc.
                    </span>
                  </label>
                  <textarea
                    value={prompt.output}
                    onChange={(e) =>
                      setPrompt((p) => ({ ...p, output: e.target.value }))
                    }
                    placeholder={`e.g.\n1. Executive summary (1 paragraph)\n2. Risk table: Clause | Doc | Page | Severity | Note\n3. Recommended next steps`}
                    rows={4}
                    disabled={isLocked}
                  />
                </section>
              </div>

              {/* Attached documents — becomes the AI's context */}
              <div className="task-section">
                <DocumentLinkingSection
                  linkedDocuments={linkedDocuments}
                  loading={documentsLoading}
                  onUnlink={handleUnlinkDocument}
                  onAddClick={() => setShowLinkDocumentModal(true)}
                  onViewDocument={onViewDocument ? handleViewDocument : undefined}
                  canLink={(isMember || isAdmin) && !isLocked}
                  canUnlink={(isMember || isAdmin) && !isLocked}
                />
              </div>

              {/* AI output + review */}
              {(aiStatus === 'SUCCEEDED' ||
                aiStatus === 'FAILED' ||
                aiStatus === 'RUNNING' ||
                aiStatus === 'QUEUED') && (
                <div className="ai-report-panel">
                  <header className="ai-report-header">
                    <h3>
                      <Sparkles size={16} /> AI draft
                    </h3>
                    {task.aiModel && (
                      <span className="ai-report-model">{task.aiModel}</span>
                    )}
                    {task.aiCompletedAt && (
                      <span className="ai-report-meta">
                        {new Date(task.aiCompletedAt).toLocaleString()}
                      </span>
                    )}
                    {aiStatus === 'SUCCEEDED' && task.aiConfidenceScore != null && (
                      <ConfidencePill
                        score={task.aiConfidenceScore}
                        reason={task.aiConfidenceReason}
                        size="lg"
                      />
                    )}
                    {aiStatus === 'SUCCEEDED' && projectId && (
                      <div className="ai-report-downloads">
                        <button
                          className="button ghost sm"
                          title="Download Markdown"
                          onClick={() => tasksService.downloadAiReport(projectId, task.id, 'md')}
                        >
                          <Download size={13} /> .md
                        </button>
                        <button
                          className="button ghost sm"
                          title="Download Excel"
                          onClick={() => tasksService.downloadAiReport(projectId, task.id, 'xlsx')}
                        >
                          <Download size={13} /> .xlsx
                        </button>
                      </div>
                    )}
                  </header>
                  {aiStatus === 'SUCCEEDED' && task.aiConfidenceReason && (
                    <p
                      className="ai-report-meta"
                      style={{
                        marginTop: 'var(--space-2)',
                        marginBottom: 'var(--space-3)',
                        fontStyle: 'italic',
                      }}
                    >
                      Confidence rationale: {task.aiConfidenceReason}
                    </p>
                  )}

                  {aiStatus === 'QUEUED' || aiStatus === 'RUNNING' ? (
                    <div className="ai-report-loading">
                      <Loader size={18} className="spinning" />
                      <span>
                        Claude is reading your documents. This usually takes
                        30–90 seconds.
                      </span>
                    </div>
                  ) : aiStatus === 'FAILED' ? (
                    <div className="ai-report-error">
                      <AlertCircle size={18} />
                      <div>
                        <strong>Run failed.</strong>
                        <p>
                          {task.aiError ||
                            'Unknown error. Check backend logs, then click Re-run.'}
                        </p>
                      </div>
                    </div>
                  ) : reportLoading ? (
                    <div className="ai-report-loading">
                      <Loader size={18} className="spinning" />
                      <span>Loading report…</span>
                    </div>
                  ) : reportMarkdown ? (
                    <div className="markdown-body ai-report-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {reportMarkdown}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <p className="ai-report-meta">
                      {task.aiReportSummary ||
                        'Report finished but the content could not be fetched.'}
                    </p>
                  )}

                  {aiStatus === 'SUCCEEDED' && (
                    <div className="ai-report-review-actions">
                      <button
                        className="button secondary sm"
                        onClick={handleRequestChanges}
                        disabled={requestingChanges || approving}
                      >
                        <RotateCcw size={14} />
                        {requestingChanges
                          ? 'Resetting…'
                          : 'Request changes'}
                      </button>
                      <button
                        className="button primary sm"
                        onClick={handleApprove}
                        disabled={approving || requestingChanges}
                      >
                        <Check size={14} />
                        {approving ? 'Approving…' : 'Approve → Complete'}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Subtasks, assignees, tags, comments — secondary */}
              <details className="task-secondary-panel">
                <summary>Details &amp; collaboration</summary>

                <div className="task-section">
                  <h4>
                    <Calendar size={14} /> Due date
                  </h4>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                  />
                  {task.dueDate && (
                    <span
                      className="muted"
                      style={{ fontSize: 'var(--text-xs)', marginLeft: 8 }}
                    >
                      Currently: {formatDate(task.dueDate)}
                    </span>
                  )}
                </div>

                <div className="task-section">
                  <h4>
                    <User size={14} /> Assignees
                  </h4>
                  <div className="assignees-list">
                    {task.assignees && task.assignees.filter((a) => a.user).length > 0 ? (
                      task.assignees
                        .filter((a) => a.user)
                        .map((ta) => (
                          <div
                            key={ta.user.id}
                            className="assignee-chip-editable"
                          >
                            {ta.user.avatarUrl ? (
                              <img
                                src={ta.user.avatarUrl}
                                alt={ta.user.name || ''}
                              />
                            ) : (
                              <span className="assignee-initial">
                                {(ta.user.name ||
                                  ta.user.email ||
                                  '?')[0].toUpperCase()}
                              </span>
                            )}
                            <span>{ta.user.name || ta.user.email}</span>
                            {onRemoveAssignee && (
                              <button
                                className="chip-remove-btn"
                                onClick={() => handleRemoveAssignee(ta.user.id)}
                                disabled={assigneeLoading === ta.user.id}
                              >
                                {assigneeLoading === ta.user.id ? (
                                  <div
                                    className="loading-spinner"
                                    style={{ width: 12, height: 12 }}
                                  />
                                ) : (
                                  <X size={14} />
                                )}
                              </button>
                            )}
                          </div>
                        ))
                    ) : (
                      <p className="no-assignees">No assignees</p>
                    )}

                    {onAddAssignee && availableMembers.length > 0 && (
                      <div
                        className="add-assignee-container"
                        ref={assigneeDropdownRef}
                      >
                        <button
                          className="add-assignee-btn"
                          onClick={() =>
                            setShowAssigneeDropdown(!showAssigneeDropdown)
                          }
                        >
                          <Plus size={14} /> Add
                        </button>
                        {showAssigneeDropdown && (
                          <div className="add-assignee-dropdown">
                            {availableMembers.map((m) => (
                              <div
                                key={m.user.id}
                                className="assignee-select-option"
                                onClick={() => handleAddAssignee(m.user.id)}
                              >
                                <span className="assignee-avatar">
                                  {m.user.avatarUrl ? (
                                    <img src={m.user.avatarUrl} alt="" />
                                  ) : (
                                    (m.user.name ||
                                      m.user.email ||
                                      '?')[0].toUpperCase()
                                  )}
                                </span>
                                <div className="assignee-option-info">
                                  <div className="assignee-option-name">
                                    {m.user.name || m.user.email}
                                  </div>
                                  {m.user.name && (
                                    <div className="assignee-option-email">
                                      {m.user.email}
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {task.tags && task.tags.length > 0 && (
                  <div className="task-section">
                    <h4>
                      <Tag size={14} /> Tags
                    </h4>
                    <div className="tags-list">
                      {task.tags.map((tt) => (
                        <span
                          key={tt.tag.id}
                          className="tag-chip"
                          style={{ backgroundColor: tt.tag.color }}
                        >
                          {tt.tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="task-section">
                  <SubtaskList
                    subtasks={subtasks}
                    loading={subtasksLoading}
                    onAddSubtask={handleAddSubtask}
                    onUpdateSubtask={handleUpdateSubtask}
                    onDeleteSubtask={deleteSubtask}
                  />
                </div>

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
              </details>
            </div>

            {/* Footer — save/run + delete */}
            <div className="drawer-footer prompt-workflow-footer">
              <button
                className="button ghost sm"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 size={14} /> Delete
              </button>
              <div className="drawer-footer-actions">
                <button
                  className="button secondary"
                  onClick={handleSaveDraft}
                  disabled={savingDraft || isLocked}
                >
                  <Save size={14} />
                  {savingDraft ? 'Saving…' : 'Save draft'}
                </button>
                <button
                  className="button primary"
                  onClick={handleRunAi}
                  disabled={!hasPrompt || isLocked || runningAi}
                  title={
                    !hasPrompt
                      ? 'Write at least an objective first'
                      : 'Submit prompt to Claude'
                  }
                >
                  {runningAi || isLocked ? (
                    <>
                      <Loader size={14} className="spinning" /> Running…
                    </>
                  ) : (
                    <>
                      <Play size={14} /> Run AI now
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {showDeleteConfirm && (
          <div
            className="modal-overlay"
            onClick={() => setShowDeleteConfirm(false)}
          >
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>Delete task</h3>
              <p>
                Are you sure you want to delete "{task.title}"? This cannot be
                undone.
              </p>
              <div className="modal-actions">
                <button
                  className="button secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </button>
                <button
                  className="button danger"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {projectId && (
          <LinkDocumentModal
            isOpen={showLinkDocumentModal}
            projectId={projectId}
            alreadyLinkedDocumentIds={linkedDocuments.map((ld) => ld.documentId)}
            boardFolderIds={boardFolderIds}
            onClose={() => setShowLinkDocumentModal(false)}
            onLink={handleLinkDocument}
          />
        )}
      </div>
    </div>
  );
}
