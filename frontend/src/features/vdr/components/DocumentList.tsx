import { useState } from 'react';
import {
  FileText,
  Grid,
  List,
  Upload,
  Download,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader,
  Lock,
  MoreVertical,
} from 'lucide-react';
import type { Document, DocumentStatus } from '../../../types/api';

interface DocumentListProps {
  documents: Document[];
  loading: boolean;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onUploadClick?: () => void;
  onDocumentClick?: (document: Document) => void;
  onDocumentDownload?: (document: Document) => void;
  onDocumentDelete?: (document: Document) => void;
  isAdmin?: boolean;
  canUpload?: boolean;
  selectedFolderName?: string;
}

/**
 * Get status icon and color based on processing status
 */
function getStatusInfo(status: DocumentStatus): { icon: React.ReactNode; color: string; label: string } {
  switch (status) {
    case 'COMPLETE':
      return { icon: <CheckCircle size={14} />, color: 'var(--color-success)', label: 'Processed' };
    case 'PROCESSING':
      return { icon: <Loader size={14} className="spinning" />, color: 'var(--color-warning)', label: 'Processing' };
    case 'FAILED':
      return { icon: <AlertCircle size={14} />, color: 'var(--color-error)', label: 'Failed' };
    case 'PENDING':
    default:
      return { icon: <Clock size={14} />, color: 'var(--color-text-secondary)', label: 'Pending' };
  }
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
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface DocumentCardProps {
  document: Document;
  onClick?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  isAdmin?: boolean;
}

/**
 * Document card for grid view
 */
function DocumentCard({ document, onClick, onDownload, onDelete, isAdmin }: DocumentCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const statusInfo = getStatusInfo(document.processingStatus);

  return (
    <div className="document-card" onClick={onClick}>
      <div className="document-card-icon">
        <FileText size={32} />
        {document.isViewOnly && (
          <span className="document-lock-badge" title="View-only">
            <Lock size={10} />
          </span>
        )}
      </div>

      <div className="document-card-info">
        <h4 className="document-name" title={document.name}>
          {document.name}
        </h4>
        <div className="document-meta">
          <span className="document-size">{formatFileSize(document.sizeBytes)}</span>
          <span className="document-status" style={{ color: statusInfo.color }} title={statusInfo.label}>
            {statusInfo.icon}
          </span>
        </div>
      </div>

      <div className="document-card-actions">
        <button
          className="icon-button"
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          title="More actions"
        >
          <MoreVertical size={16} />
        </button>

        {showMenu && (
          <div className="document-menu" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => { onClick?.(); setShowMenu(false); }}>
              <Eye size={14} /> View
            </button>
            {!document.isViewOnly && onDownload && (
              <button onClick={() => { onDownload(); setShowMenu(false); }}>
                <Download size={14} /> Download
              </button>
            )}
            {isAdmin && onDelete && (
              <button className="danger" onClick={() => { onDelete(); setShowMenu(false); }}>
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Document row for list view
 */
function DocumentRow({ document, onClick, onDownload, onDelete, isAdmin }: DocumentCardProps) {
  const statusInfo = getStatusInfo(document.processingStatus);

  return (
    <tr className="document-row" onClick={onClick}>
      <td className="document-name-cell">
        <FileText size={18} />
        <span title={document.name}>{document.name}</span>
        {document.isViewOnly && (
          <span className="document-lock-badge" title="View-only">
            <Lock size={10} />
          </span>
        )}
      </td>
      <td className="document-type-cell">{document.documentType || 'Unknown'}</td>
      <td className="document-size-cell">{formatFileSize(document.sizeBytes)}</td>
      <td className="document-status-cell">
        <span className="status-badge" style={{ color: statusInfo.color }} title={statusInfo.label}>
          {statusInfo.icon}
          <span>{statusInfo.label}</span>
        </span>
      </td>
      <td className="document-date-cell">{formatDate(document.createdAt)}</td>
      <td className="document-actions-cell">
        <button className="icon-button" onClick={(e) => { e.stopPropagation(); onClick?.(); }} title="View">
          <Eye size={16} />
        </button>
        {!document.isViewOnly && onDownload && (
          <button className="icon-button" onClick={(e) => { e.stopPropagation(); onDownload(); }} title="Download">
            <Download size={16} />
          </button>
        )}
        {isAdmin && onDelete && (
          <button className="icon-button danger" onClick={(e) => { e.stopPropagation(); onDelete(); }} title="Delete">
            <Trash2 size={16} />
          </button>
        )}
      </td>
    </tr>
  );
}

/**
 * Document list/grid component
 */
export function DocumentList({
  documents,
  loading,
  viewMode,
  onViewModeChange,
  onUploadClick,
  onDocumentClick,
  onDocumentDownload,
  onDocumentDelete,
  isAdmin = false,
  canUpload = false,
  selectedFolderName,
}: DocumentListProps) {
  return (
    <div className="document-list-container">
      {/* Header with view controls */}
      <div className="document-list-header">
        <div className="document-list-title">
          <h2>{selectedFolderName || 'All Documents'}</h2>
          <span className="document-count">{documents.length} document{documents.length !== 1 ? 's' : ''}</span>
        </div>

        <div className="document-list-controls">
          {/* View mode toggle */}
          <div className="view-toggle">
            <button
              className={`icon-button ${viewMode === 'grid' ? 'active' : ''}`}
              onClick={() => onViewModeChange('grid')}
              title="Grid view"
            >
              <Grid size={18} />
            </button>
            <button
              className={`icon-button ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => onViewModeChange('list')}
              title="List view"
            >
              <List size={18} />
            </button>
          </div>

          {/* Upload button */}
          {canUpload && onUploadClick && (
            <button className="button primary" onClick={onUploadClick}>
              <Upload size={16} />
              Upload
            </button>
          )}
        </div>
      </div>

      {/* Document content */}
      <div className="document-list-content">
        {loading ? (
          <div className="document-list-loading">
            <div className="loading-spinner" />
            <p>Loading documents...</p>
          </div>
        ) : documents.length === 0 ? (
          <div className="document-list-empty">
            <FileText size={48} />
            <h3>No documents</h3>
            <p>
              {canUpload
                ? 'Upload documents to get started'
                : 'No documents in this folder'}
            </p>
            {canUpload && onUploadClick && (
              <button className="button primary" onClick={onUploadClick}>
                <Upload size={16} />
                Upload Documents
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="document-grid">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                onClick={() => onDocumentClick?.(doc)}
                onDownload={() => onDocumentDownload?.(doc)}
                onDelete={() => onDocumentDelete?.(doc)}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        ) : (
          <table className="document-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Size</th>
                <th>Status</th>
                <th>Uploaded</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  document={doc}
                  onClick={() => onDocumentClick?.(doc)}
                  onDownload={() => onDocumentDownload?.(doc)}
                  onDelete={() => onDocumentDelete?.(doc)}
                  isAdmin={isAdmin}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
