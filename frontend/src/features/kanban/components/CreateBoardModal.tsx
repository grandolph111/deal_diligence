import { useCallback, useEffect, useState } from 'react';
import { X, Plus, Check, CircleAlert } from 'lucide-react';
import { boardsService } from '../../../api';
import { libraryService } from '../../../api/services/library.service';
import type { TocWorkstream } from '../../../api/services/library.service';
import type { KanbanBoardDetail } from '../../../types/api';

interface Props {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (board: KanbanBoardDetail) => void;
}

/**
 * Carve a board out for a specialist.
 *
 * Scoping is by diligence workstream rather than folder, because that is the
 * axis a deal is actually divided along — an IP lawyer wants every contract
 * with IP evidence in it, not whichever files happened to be dropped in an "IP"
 * folder. Document counts are shown per workstream so the admin can see the
 * size of the slice they are handing over before they hand it over.
 */
export function CreateBoardModal({ projectId, isOpen, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [workstreams, setWorkstreams] = useState<TocWorkstream[]>([]);
  const [loadingToc, setLoadingToc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadToc = useCallback(async () => {
    try {
      setLoadingToc(true);
      const toc = await libraryService.getToc(projectId);
      setWorkstreams(toc.workstreams);
    } catch (err) {
      console.error('Failed to load checklist:', err);
      setError('Could not load the deal checklist');
    } finally {
      setLoadingToc(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setSelectedIds(new Set());
      setError(null);
      loadToc();
    }
  }, [isOpen, loadToc]);

  const toggle = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(workstreams.map((w) => w.id)));
  const clearAll = () => setSelectedIds(new Set());

  // Distinct documents across the selection — not the sum of per-workstream
  // counts, since a document usually has evidence in several of them.
  const selectedWorkstreams = workstreams.filter((w) => selectedIds.has(w.id));
  const maxReach = selectedWorkstreams.reduce((n, w) => Math.max(n, w.documentCount), 0);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Board name is required');
      return;
    }
    if (selectedIds.size === 0) {
      setError('Select at least one workstream');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const board = await boardsService.create(projectId, {
        name: name.trim(),
        description: description.trim() || null,
        workstreamIds: [...selectedIds],
      });
      onCreated(board);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 560, width: '90%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Plus size={18} /> Create Kanban Board
          </h3>
          <button className="button ghost sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div
          className="modal-content"
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          <div className="form-group">
            <label htmlFor="board-name">Board name</label>
            <input
              id="board-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. IP Diligence"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="board-desc">Description (optional)</label>
            <textarea
              id="board-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this board covers and who should work on it."
              rows={2}
            />
          </div>

          <div className="form-group">
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
            >
              <label>
                Workstreams this board covers{' '}
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
                  ({selectedIds.size} selected)
                </span>
              </label>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <button type="button" className="button ghost sm" onClick={selectAll}>
                  Select all
                </button>
                <button type="button" className="button ghost sm" onClick={clearAll}>
                  Clear
                </button>
              </div>
            </div>
            <p
              style={{
                color: 'var(--text-tertiary)',
                fontSize: 'var(--text-xs)',
                marginTop: 'var(--space-1)',
                lineHeight: 1.6,
              }}
            >
              Tasks on this board can attach any document with evidence in these workstreams.
              Members see the board only if all of them are within their access.
            </p>
            <div
              style={{
                marginTop: 'var(--space-2)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                maxHeight: 280,
                overflowY: 'auto',
              }}
            >
              {loadingToc ? (
                <div style={{ padding: 'var(--space-4)', color: 'var(--text-tertiary)' }}>
                  Loading checklist…
                </div>
              ) : workstreams.length === 0 ? (
                <div style={{ padding: 'var(--space-4)', color: 'var(--text-tertiary)' }}>
                  The checklist populates as documents are analyzed.
                </div>
              ) : (
                workstreams.map((ws) => {
                  const checked = selectedIds.has(ws.id);
                  const flagged = ws.items.filter((i) => i.status === 'FLAGGED').length;
                  return (
                    <label
                      key={ws.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-2) var(--space-3)',
                        cursor: 'pointer',
                        borderBottom: '1px solid var(--border-primary)',
                        background: checked ? 'var(--color-primary-soft)' : 'transparent',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(ws.id)}
                        style={{ width: 'auto' }}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>{ws.title}</span>
                      {flagged > 0 && (
                        <span
                          className="chip"
                          title={`${flagged} flagged item${flagged === 1 ? '' : 's'}`}
                          style={{
                            background: 'var(--risk-high-bg)',
                            color: 'var(--risk-high)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3,
                          }}
                        >
                          <CircleAlert size={11} /> {flagged}
                        </span>
                      )}
                      <span
                        style={{
                          color: 'var(--text-muted)',
                          fontSize: 'var(--text-xs)',
                          fontVariantNumeric: 'tabular-nums',
                          minWidth: 58,
                          textAlign: 'right',
                        }}
                      >
                        {ws.documentCount} doc{ws.documentCount === 1 ? '' : 's'}
                      </span>
                      {checked && <Check size={14} style={{ color: 'var(--color-primary)' }} />}
                    </label>
                  );
                })
              )}
            </div>
            {selectedIds.size > 0 && (
              <p
                style={{
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--text-xs)',
                  marginTop: 'var(--space-2)',
                }}
              >
                At least {maxReach} document{maxReach === 1 ? '' : 's'} in scope — documents
                overlap across workstreams, so the exact total is usually higher.
              </p>
            )}
          </div>

          {error && (
            <div className="error-container">
              <span className="error-message">{error}</span>
            </div>
          )}
        </div>

        <div
          className="modal-actions"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-2)',
            padding: 'var(--space-4)',
          }}
        >
          <button className="button secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={handleCreate}
            disabled={saving || !name.trim() || selectedIds.size === 0}
          >
            {saving ? 'Creating…' : 'Create Board'}
          </button>
        </div>
      </div>
    </div>
  );
}
