import { useState, type FormEvent } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDeleteModalProps {
  projectName: string;
  isOpen: boolean;
  deleting: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}

export function ConfirmDeleteModal({
  projectName,
  isOpen,
  deleting,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const isValid = confirmText === projectName;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid || deleting) return;
    await onConfirm();
  };

  const handleClose = () => {
    if (deleting) return;
    setConfirmText('');
    onCancel();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal confirm-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <div className="confirm-dialog-content">
            <div className="confirm-dialog-icon">
              <AlertTriangle size={48} />
            </div>
            <h3 className="confirm-dialog-title">Delete Project</h3>
            <p className="confirm-dialog-message">
              This action cannot be undone. All data including tasks, documents,
              and members will be permanently deleted.
            </p>
            <p className="confirm-dialog-message">
              Type <strong>{projectName}</strong> to confirm:
            </p>
            <input
              type="text"
              className={`confirm-dialog-input ${confirmText && !isValid ? 'error' : ''}`}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="Enter project name"
              autoFocus
              disabled={deleting}
            />
          </div>
          <div className="confirm-dialog-actions">
            <button
              type="button"
              className="button secondary"
              onClick={handleClose}
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button danger"
              disabled={!isValid || deleting}
            >
              {deleting ? 'Deleting...' : 'Delete Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
