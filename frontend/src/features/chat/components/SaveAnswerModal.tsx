import { useCallback, useEffect, useState } from 'react';
import { X, BookmarkPlus, Check } from 'lucide-react';
import { libraryService } from '../../../api/services/library.service';
import type { SuggestedNoteItem } from '../../../api/services/library.service';

interface Props {
  projectId: string;
  isOpen: boolean;
  /** The answer being filed. */
  content: string;
  /** Documents the answer cited. */
  documentIds: string[];
  /** The question it answered — seeds the title. */
  question?: string;
  onClose: () => void;
  onSaved: () => void;
}

function toTitle(question: string | undefined, content: string): string {
  const raw = (question ?? content).trim().replace(/\s+/g, ' ');
  const stripped = raw.replace(/[?.!]+$/, '');
  return stripped.length > 120 ? `${stripped.slice(0, 117)}…` : stripped || 'Filed answer';
}

/**
 * Confirm where an answer files before it becomes part of the deal record.
 *
 * The suggestions come from the evidence in the documents the answer actually
 * cited, but a person picks. Silently auto-filing a written conclusion into a
 * diligence checklist would put a claim in the record that no one signed off
 * on, and mis-filed is worse than unfiled.
 */
export function SaveAnswerModal({
  projectId,
  isOpen,
  content,
  documentIds,
  question,
  onClose,
  onSaved,
}: Props) {
  const [title, setTitle] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestedNoteItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setTitle(toTitle(question, content));
    setError(null);
    if (documentIds.length === 0) {
      setSuggestions([]);
      setSelected(new Set());
      return;
    }
    setLoading(true);
    try {
      const items = await libraryService.suggestNoteItems(projectId, documentIds);
      setSuggestions(items);
      // Pre-select the strongest matches; the user trims rather than hunts.
      setSelected(new Set(items.slice(0, 3).map((i) => i.itemId)));
    } catch {
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, documentIds, question, content]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const save = async () => {
    if (!title.trim()) {
      setError('Give this note a title');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await libraryService.createNote(projectId, {
        title: title.trim(),
        content,
        itemIds: [...selected],
        documentIds,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 560, width: '92%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <BookmarkPlus size={18} aria-hidden="true" /> Save to deal
          </h3>
          <button className="button ghost sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div
          className="modal-content"
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          <div className="form-group">
            <label htmlFor="note-title">Title</label>
            <input
              id="note-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>
              File under{' '}
              <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
                ({selected.size} selected)
              </span>
            </label>
            <p
              style={{
                margin: 'var(--space-1) 0 var(--space-2)',
                fontSize: 'var(--text-xs)',
                lineHeight: 1.6,
                color: 'var(--text-tertiary)',
              }}
            >
              Suggested from the documents this answer cited. Saved notes are reference material —
              they never count as evidence toward a question's coverage.
            </p>

            {loading ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
                Finding where this belongs…
              </p>
            ) : suggestions.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)', margin: 0 }}>
                {documentIds.length === 0
                  ? 'This answer cited no documents, so it will be saved to triage for someone to file later.'
                  : 'None of the cited documents have extracted evidence to file against — this will be saved to triage.'}
              </p>
            ) : (
              <div
                style={{
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                  maxHeight: 240,
                  overflowY: 'auto',
                }}
              >
                {suggestions.map((s) => {
                  const checked = selected.has(s.itemId);
                  return (
                    <label
                      key={s.itemId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-2) var(--space-3)',
                        borderBottom: '1px solid var(--border-primary)',
                        background: checked ? 'var(--color-primary-soft)' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(s.itemId)}
                        style={{ width: 'auto' }}
                      />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 'var(--text-sm)' }}>
                          {s.title}
                        </span>
                        <span
                          style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}
                        >
                          {s.workstreamTitle}
                        </span>
                      </span>
                      <span
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--text-muted)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {s.documentCount} cited doc{s.documentCount === 1 ? '' : 's'}
                      </span>
                      {checked && <Check size={14} style={{ color: 'var(--color-primary)' }} />}
                    </label>
                  );
                })}
              </div>
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
          <button className="button primary" onClick={save} disabled={saving || !title.trim()}>
            {saving ? 'Saving…' : 'Save to deal'}
          </button>
        </div>
      </div>
    </div>
  );
}
