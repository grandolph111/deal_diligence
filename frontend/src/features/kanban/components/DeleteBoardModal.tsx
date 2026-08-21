import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Confirm deleting a board.
 *
 * Deliberately lighter than the delete-deal dialog, which makes you type the
 * project name: deleting a board does not destroy work. Its tasks move to the
 * default board rather than going with it. That is the part worth saying out
 * loud, so the dialog states where the tasks land and how many are moving
 * rather than warning about a loss that does not happen.
 */
interface DeleteBoardModalProps {
  boardName: string;
  taskCount: number;
  isOpen: boolean;
  deleting: boolean;
  error?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function DeleteBoardModal({
  boardName,
  taskCount,
  isOpen,
  deleting,
  error,
  onConfirm,
  onCancel,
}: DeleteBoardModalProps) {
  // Escape closes it, the way every other dismissable surface in the app does.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deleting) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, deleting, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!deleting) onCancel();
      }}
    >
      <div
        className="modal confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-board-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-dialog-content">
          <div className="confirm-dialog-icon">
            <AlertTriangle size={48} />
          </div>
          <h3 className="confirm-dialog-title" id="delete-board-title">
            Delete this board?
          </h3>
          <p className="confirm-dialog-message">
            <strong>{boardName}</strong> will be removed from this deal.
          </p>
          <p className="confirm-dialog-message">
            {taskCount === 0
              ? 'It has no tasks, so nothing moves.'
              : `Its ${taskCount} task${taskCount === 1 ? '' : 's'} will move to the default board rather than being deleted. ${
                  taskCount === 1 ? 'It stays' : 'They stay'
                } assigned, with ${taskCount === 1 ? 'its' : 'their'} comments and attachments intact.`}
          </p>
          {error && (
            <p className="confirm-dialog-message" role="alert" style={{ color: 'var(--color-error)' }}>
              {error}
            </p>
          )}
        </div>
        <div className="confirm-dialog-actions">
          <button type="button" className="button secondary" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button
            type="button"
            className="button danger"
            onClick={() => void onConfirm()}
            disabled={deleting}
            autoFocus
          >
            {deleting ? 'Deleting…' : 'Delete board'}
          </button>
        </div>
      </div>
    </div>
  );
}
