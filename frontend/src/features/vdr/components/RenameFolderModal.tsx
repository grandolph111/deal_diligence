import { useState, useEffect } from 'react';
import { X, Edit2 } from 'lucide-react';

interface RenameFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (newName: string) => Promise<void>;
  currentName: string;
}

/**
 * Modal for renaming a folder
 */
export function RenameFolderModal({
  isOpen,
  onClose,
  onSubmit,
  currentName,
}: RenameFolderModalProps) {
  const [name, setName] = useState(currentName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens with new folder
  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setError(null);
    }
  }, [isOpen, currentName]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Folder name is required');
      return;
    }

    if (trimmedName === currentName) {
      // No change, just close
      onClose();
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await onSubmit(trimmedName);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to rename folder';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setName(currentName);
      setError(null);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <Edit2 size={20} />
            Rename Folder
          </h2>
          <button
            className="modal-close"
            onClick={handleClose}
            disabled={submitting}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && (
              <div className="form-error">{error}</div>
            )}

            <div className="form-group">
              <label htmlFor="folder-rename">Folder Name</label>
              <input
                id="folder-rename"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter folder name"
                disabled={submitting}
                autoFocus
                maxLength={100}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="button secondary"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={submitting || !name.trim() || name.trim() === currentName}
            >
              {submitting ? 'Renaming...' : 'Rename'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
