import { useState } from 'react';
import { X, Trash2, AlertTriangle } from 'lucide-react';

interface DeleteFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  folderName: string;
  hasChildren?: boolean;
  documentCount?: number;
}

/**
 * Confirmation modal for deleting a folder
 */
export function DeleteFolderModal({
  isOpen,
  onClose,
  onConfirm,
  folderName,
  hasChildren = false,
  documentCount = 0,
}: DeleteFolderModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const canDelete = !hasChildren && documentCount === 0;

  const handleConfirm = async () => {
    if (!canDelete) return;

    try {
      setDeleting(true);
      setError(null);
      await onConfirm();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete folder';
      setError(message);
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = () => {
    if (!deleting) {
      setError(null);
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <Trash2 size={20} />
            Delete Folder
          </h2>
          <button
            className="modal-close"
            onClick={handleClose}
            disabled={deleting}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {error && (
            <div className="form-error">{error}</div>
          )}

          {!canDelete ? (
            <div className="delete-warning">
              <AlertTriangle size={48} className="warning-icon" />
              <h3>Cannot Delete Folder</h3>
              <p>
                The folder <strong>{folderName}</strong> cannot be deleted because it is not empty.
              </p>
              <ul className="warning-list">
                {hasChildren && <li>Contains subfolders that must be removed first</li>}
                {documentCount > 0 && (
                  <li>Contains {documentCount} document{documentCount === 1 ? '' : 's'} that must be moved or deleted first</li>
                )}
              </ul>
            </div>
          ) : (
            <div className="delete-confirm">
              <AlertTriangle size={48} className="warning-icon" />
              <p>
                Are you sure you want to delete the folder <strong>{folderName}</strong>?
              </p>
              <p className="delete-note">This action cannot be undone.</p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="button secondary"
            onClick={handleClose}
            disabled={deleting}
          >
            Cancel
          </button>
          {canDelete && (
            <button
              type="button"
              className="button danger"
              onClick={handleConfirm}
              disabled={deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Folder'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
