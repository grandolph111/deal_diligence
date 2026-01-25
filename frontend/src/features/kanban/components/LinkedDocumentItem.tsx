import { FileText, X, ExternalLink, Loader, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import type { LinkedDocument, DocumentStatus } from '../../../types/api';

interface LinkedDocumentItemProps {
  linkedDocument: LinkedDocument;
  onUnlink?: () => void;
  onView?: () => void;
  canUnlink?: boolean;
  isUnlinking?: boolean;
}

/**
 * Format file size in human-readable format
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Get status icon based on processing status
 */
function getStatusIcon(status: DocumentStatus): React.ReactNode {
  switch (status) {
    case 'COMPLETE':
      return <CheckCircle size={12} style={{ color: 'var(--color-success)' }} />;
    case 'PROCESSING':
      return <Loader size={12} className="spinning" style={{ color: 'var(--color-warning)' }} />;
    case 'FAILED':
      return <AlertCircle size={12} style={{ color: 'var(--color-error)' }} />;
    case 'PENDING':
    default:
      return <Clock size={12} style={{ color: 'var(--text-muted)' }} />;
  }
}

/**
 * Individual linked document item
 */
export function LinkedDocumentItem({
  linkedDocument,
  onUnlink,
  onView,
  canUnlink = false,
  isUnlinking = false,
}: LinkedDocumentItemProps) {
  const { document } = linkedDocument;

  return (
    <div className="linked-document-item">
      <div className="linked-document-icon">
        <FileText size={18} />
      </div>

      <div className="linked-document-info" onClick={onView} style={{ cursor: onView ? 'pointer' : 'default' }}>
        <div className="linked-document-name" title={document.name}>
          {document.name}
          {onView && <ExternalLink size={12} className="linked-document-link-icon" />}
        </div>
        <div className="linked-document-meta">
          {document.folder && (
            <span className="linked-document-folder" title={`In folder: ${document.folder.name}`}>
              {document.folder.name}
            </span>
          )}
          <span className="linked-document-size">{formatFileSize(document.sizeBytes)}</span>
          <span className="linked-document-status" title={document.processingStatus}>
            {getStatusIcon(document.processingStatus)}
          </span>
        </div>
      </div>

      {canUnlink && onUnlink && (
        <button
          className="linked-document-unlink-btn"
          onClick={onUnlink}
          disabled={isUnlinking}
          title="Unlink document"
        >
          {isUnlinking ? (
            <Loader size={14} className="spinning" />
          ) : (
            <X size={14} />
          )}
        </button>
      )}
    </div>
  );
}
