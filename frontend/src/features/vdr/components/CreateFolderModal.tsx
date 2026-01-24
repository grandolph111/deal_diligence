import { useState } from 'react';
import { X, FolderPlus } from 'lucide-react';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, isViewOnly: boolean) => Promise<void>;
  parentFolderName?: string;
}

/**
 * Modal for creating a new folder
 */
export function CreateFolderModal({
  isOpen,
  onClose,
  onSubmit,
  parentFolderName,
}: CreateFolderModalProps) {
  const [name, setName] = useState('');
  const [isViewOnly, setIsViewOnly] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Folder name is required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      await onSubmit(trimmedName, isViewOnly);
      // Reset form and close
      setName('');
      setIsViewOnly(false);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create folder';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setName('');
      setIsViewOnly(false);
      setError(null);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <FolderPlus size={20} />
            Create Folder
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
            {parentFolderName && (
              <p className="modal-info">
                Creating subfolder in: <strong>{parentFolderName}</strong>
              </p>
            )}

            {error && (
              <div className="form-error">{error}</div>
            )}

            <div className="form-group">
              <label htmlFor="folder-name">Folder Name</label>
              <input
                id="folder-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter folder name"
                disabled={submitting}
                autoFocus
                maxLength={100}
              />
            </div>

            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={isViewOnly}
                  onChange={(e) => setIsViewOnly(e.target.checked)}
                  disabled={submitting}
                />
                <span>View-only folder</span>
              </label>
              <p className="form-help">
                Documents in view-only folders cannot be downloaded
              </p>
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
              disabled={submitting || !name.trim()}
            >
              {submitting ? 'Creating...' : 'Create Folder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
