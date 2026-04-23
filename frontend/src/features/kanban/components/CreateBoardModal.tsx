import { useCallback, useEffect, useState } from 'react';
import { X, FolderOpen, Plus, Check } from 'lucide-react';
import { boardsService, foldersService } from '../../../api';
import type { Folder, KanbanBoardDetail } from '../../../types/api';

interface Props {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (board: KanbanBoardDetail) => void;
}

export function CreateBoardModal({ projectId, isOpen, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<string>>(new Set());
  const [folders, setFolders] = useState<Folder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    try {
      setLoadingFolders(true);
      const res = await foldersService.getFoldersFlat(projectId);
      setFolders(res);
    } catch (err) {
      console.error('Failed to load folders:', err);
      setError('Could not load folders');
    } finally {
      setLoadingFolders(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setSelectedFolderIds(new Set());
      setError(null);
      loadFolders();
    }
  }, [isOpen, loadFolders]);

  const toggleFolder = (id: string) => {
    setSelectedFolderIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () =>
    setSelectedFolderIds(new Set(folders.map((f) => f.id)));
  const clearAll = () => setSelectedFolderIds(new Set());

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Board name is required');
      return;
    }
    if (selectedFolderIds.size === 0) {
      setError('Select at least one folder');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const board = await boardsService.create(projectId, {
        name: name.trim(),
        description: description.trim() || null,
        folderIds: [...selectedFolderIds],
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
        <div className="modal-content" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="form-group">
            <label htmlFor="board-name">Board name</label>
            <input
              id="board-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Product & Legal"
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <label>
                Folders this board covers{' '}
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
                  ({selectedFolderIds.size} selected)
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
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>
              Tasks on this board can only attach documents from these folders.
              Members see the board only if they have access to all of them.
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
              {loadingFolders ? (
                <div style={{ padding: 'var(--space-4)', color: 'var(--text-tertiary)' }}>
                  Loading folders…
                </div>
              ) : folders.length === 0 ? (
                <div style={{ padding: 'var(--space-4)', color: 'var(--text-tertiary)' }}>
                  No folders yet. Create folders in the Data Room first.
                </div>
              ) : (
                folders.map((folder) => {
                  const checked = selectedFolderIds.has(folder.id);
                  return (
                    <label
                      key={folder.id}
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
                        onChange={() => toggleFolder(folder.id)}
                        style={{ width: 'auto' }}
                      />
                      <FolderOpen size={14} style={{ color: 'var(--text-tertiary)' }} />
                      <span style={{ flex: 1 }}>{folder.name}</span>
                      {checked && <Check size={14} style={{ color: 'var(--color-primary)' }} />}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {error && (
            <div className="error-container">
              <span className="error-message">{error}</span>
            </div>
          )}
        </div>

        <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', padding: 'var(--space-4)' }}>
          <button className="button secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={handleCreate}
            disabled={saving || !name.trim() || selectedFolderIds.size === 0}
          >
            {saving ? 'Creating…' : 'Create Board'}
          </button>
        </div>
      </div>
    </div>
  );
}
