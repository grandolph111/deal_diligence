import { useMemo } from 'react';
import { X, Check, AlertCircle, Loader2, FileUp } from 'lucide-react';
import { type UploadProgress } from '../../../api/services/documents.service';

interface UploadProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  uploadProgress: Map<string, UploadProgress>;
  isUploading: boolean;
}

export function UploadProgressModal({
  isOpen,
  onClose,
  uploadProgress,
  isUploading,
}: UploadProgressModalProps) {
  const progressItems = useMemo(() => Array.from(uploadProgress.values()), [uploadProgress]);

  const stats = useMemo(() => {
    const total = progressItems.length;
    const completed = progressItems.filter((p) => p.status === 'complete').length;
    const failed = progressItems.filter((p) => p.status === 'failed').length;
    const inProgress = progressItems.filter(
      (p) => p.status === 'uploading' || p.status === 'confirming'
    ).length;
    const pending = progressItems.filter((p) => p.status === 'pending').length;

    return { total, completed, failed, inProgress, pending };
  }, [progressItems]);

  const canClose = !isUploading && stats.inProgress === 0 && stats.pending === 0;

  if (!isOpen) {
    return null;
  }

  const getStatusIcon = (status: UploadProgress['status']) => {
    switch (status) {
      case 'complete':
        return <Check size={16} className="status-icon success" />;
      case 'failed':
        return <AlertCircle size={16} className="status-icon error" />;
      case 'uploading':
      case 'confirming':
        return <Loader2 size={16} className="status-icon loading" />;
      default:
        return <FileUp size={16} className="status-icon pending" />;
    }
  };

  const getStatusText = (status: UploadProgress['status']) => {
    switch (status) {
      case 'complete':
        return 'Complete';
      case 'failed':
        return 'Failed';
      case 'uploading':
        return 'Uploading...';
      case 'confirming':
        return 'Confirming...';
      default:
        return 'Pending';
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal upload-progress-modal">
        <div className="modal-header">
          <h2>
            {isUploading
              ? 'Uploading Files...'
              : stats.failed > 0
                ? 'Upload Complete (with errors)'
                : 'Upload Complete'}
          </h2>
          {canClose && (
            <button
              className="modal-close"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <div className="modal-body">
          {/* Summary stats */}
          <div className="upload-stats">
            <div className="upload-stat">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total</span>
            </div>
            <div className="upload-stat success">
              <span className="stat-value">{stats.completed}</span>
              <span className="stat-label">Completed</span>
            </div>
            {stats.failed > 0 && (
              <div className="upload-stat error">
                <span className="stat-value">{stats.failed}</span>
                <span className="stat-label">Failed</span>
              </div>
            )}
            {isUploading && (
              <div className="upload-stat pending">
                <span className="stat-value">{stats.inProgress + stats.pending}</span>
                <span className="stat-label">Remaining</span>
              </div>
            )}
          </div>

          {/* Progress list */}
          <div className="upload-progress-list">
            {progressItems.map((item) => (
              <div
                key={item.filename}
                className={`upload-progress-item ${item.status}`}
              >
                <div className="upload-progress-item-header">
                  {getStatusIcon(item.status)}
                  <span className="upload-filename" title={item.filename}>
                    {item.filename}
                  </span>
                  <span className="upload-status-text">
                    {getStatusText(item.status)}
                  </span>
                </div>

                {(item.status === 'uploading' || item.status === 'confirming') && (
                  <div className="upload-progress-bar-container">
                    <div
                      className="upload-progress-bar"
                      style={{ width: `${item.progress}%` }}
                    />
                    <span className="upload-progress-percent">{item.progress}%</span>
                  </div>
                )}

                {item.status === 'failed' && item.error && (
                  <div className="upload-error-message">{item.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="modal-footer">
          {canClose ? (
            <button className="button primary" onClick={onClose}>
              Done
            </button>
          ) : (
            <button className="button secondary" disabled>
              <Loader2 size={16} className="loading" />
              Uploading...
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
