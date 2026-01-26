import { useState, useCallback } from 'react';
import {
  FileText,
  Grid,
  List,
  Download,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader,
  Lock,
  MoreVertical,
  FolderInput,
  CheckSquare,
  Square,
  X,
  ShieldAlert,
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
  onDocumentMove?: (document: Document) => void;
  onBulkDelete?: (documents: Document[]) => void;
  onBulkDownload?: (documents: Document[]) => void;
  onRequestAccess?: (document: Document) => void;
  isAdmin?: boolean;
  canUpload?: boolean;
  selectedFolderName?: string;
  /** Documents the user cannot access (restricted by folder permissions) */
  restrictedDocumentIds?: Set<string>;
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
  onMove?: () => void;
  onRequestAccess?: () => void;
  isAdmin?: boolean;
  isSelected?: boolean;
  onSelectChange?: (selected: boolean) => void;
  isRestricted?: boolean;
}

/**
 * Document card for grid view
 */
function DocumentCard({
  document,
  onClick,
  onDownload,
  onDelete,
  onMove,
  onRequestAccess,
  isAdmin,
  isSelected,
  onSelectChange,
  isRestricted,
}: DocumentCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const statusInfo = getStatusInfo(document.processingStatus);

  // If restricted, show restricted card
  if (isRestricted) {
    return (
      <div className="document-card document-card-restricted">
        <div className="document-card-icon">
          <ShieldAlert size={32} />
        </div>

        <div className="document-card-info">
          <h4 className="document-name" title={document.name}>
            {document.name}
          </h4>
          <div className="document-meta">
            <span className="document-restricted-label">Access Restricted</span>
          </div>
        </div>

        {onRequestAccess && (
          <div className="document-card-actions">
            <button
              className="button small secondary"
              onClick={(e) => {
                e.stopPropagation();
                onRequestAccess();
              }}
            >
              Request Access
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`document-card ${isSelected ? 'selected' : ''}`}
      onClick={onClick}
    >
      {/* Selection checkbox */}
      {onSelectChange && (
        <button
          className="document-select-checkbox"
          onClick={(e) => {
            e.stopPropagation();
            onSelectChange(!isSelected);
          }}
          title={isSelected ? 'Deselect' : 'Select'}
        >
          {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
        </button>
      )}

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
            {isAdmin && onMove && (
              <button onClick={() => { onMove(); setShowMenu(false); }}>
                <FolderInput size={14} /> Move
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
function DocumentRow({
  document,
  onClick,
  onDownload,
  onDelete,
  onMove,
  onRequestAccess,
  isAdmin,
  isSelected,
  onSelectChange,
  isRestricted,
}: DocumentCardProps) {
  const statusInfo = getStatusInfo(document.processingStatus);

  // If restricted, show restricted row
  if (isRestricted) {
    return (
      <tr className="document-row document-row-restricted">
        <td className="document-select-cell">
          {/* No checkbox for restricted documents */}
        </td>
        <td className="document-name-cell">
          <ShieldAlert size={18} />
          <span title={document.name}>{document.name}</span>
        </td>
        <td className="document-type-cell" colSpan={3}>
          <span className="document-restricted-label">Access Restricted</span>
        </td>
        <td className="document-actions-cell">
          {onRequestAccess && (
            <button
              className="button small secondary"
              onClick={(e) => {
                e.stopPropagation();
                onRequestAccess();
              }}
            >
              Request Access
            </button>
          )}
        </td>
      </tr>
    );
  }

  return (
    <tr className={`document-row ${isSelected ? 'selected' : ''}`} onClick={onClick}>
      <td className="document-select-cell">
        {onSelectChange && (
          <button
            className="document-select-checkbox"
            onClick={(e) => {
              e.stopPropagation();
              onSelectChange(!isSelected);
            }}
            title={isSelected ? 'Deselect' : 'Select'}
          >
            {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
          </button>
        )}
      </td>
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
        {isAdmin && onMove && (
          <button className="icon-button" onClick={(e) => { e.stopPropagation(); onMove(); }} title="Move">
            <FolderInput size={16} />
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
  onDocumentMove,
  onBulkDelete,
  onBulkDownload,
  onRequestAccess,
  isAdmin = false,
  canUpload = false,
  selectedFolderName,
  restrictedDocumentIds = new Set(),
}: DocumentListProps) {
  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Get accessible documents (not restricted)
  const accessibleDocuments = documents.filter((doc) => !restrictedDocumentIds.has(doc.id));
  const hasSelection = selectedIds.size > 0;

  // Handle individual document selection
  const handleSelectChange = useCallback((docId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(docId);
      } else {
        next.delete(docId);
      }
      return next;
    });
  }, []);

  // Handle select all
  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === accessibleDocuments.length) {
      // Deselect all
      setSelectedIds(new Set());
    } else {
      // Select all accessible documents
      setSelectedIds(new Set(accessibleDocuments.map((doc) => doc.id)));
    }
  }, [accessibleDocuments, selectedIds.size]);

  // Clear selection
  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Get selected documents
  const getSelectedDocuments = useCallback(() => {
    return documents.filter((doc) => selectedIds.has(doc.id));
  }, [documents, selectedIds]);

  // Handle bulk delete
  const handleBulkDelete = useCallback(() => {
    if (onBulkDelete) {
      onBulkDelete(getSelectedDocuments());
      handleClearSelection();
    }
  }, [onBulkDelete, getSelectedDocuments, handleClearSelection]);

  // Handle bulk download
  const handleBulkDownload = useCallback(() => {
    if (onBulkDownload) {
      onBulkDownload(getSelectedDocuments());
      handleClearSelection();
    }
  }, [onBulkDownload, getSelectedDocuments, handleClearSelection]);

  // Check if document is restricted
  const isDocumentRestricted = useCallback((docId: string) => {
    return restrictedDocumentIds.has(docId);
  }, [restrictedDocumentIds]);

  // Can show selection controls when bulk actions are available
  const canSelect = Boolean(onBulkDelete || onBulkDownload);

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
        </div>
      </div>

      {/* Bulk action toolbar (shown when documents are selected) */}
      {hasSelection && (
        <div className="bulk-action-toolbar">
          <div className="bulk-action-info">
            <button className="icon-button" onClick={handleClearSelection} title="Clear selection">
              <X size={16} />
            </button>
            <span>{selectedIds.size} selected</span>
          </div>
          <div className="bulk-action-buttons">
            {onBulkDownload && (
              <button className="button secondary small" onClick={handleBulkDownload}>
                <Download size={14} />
                Download
              </button>
            )}
            {isAdmin && onBulkDelete && (
              <button className="button danger small" onClick={handleBulkDelete}>
                <Trash2 size={14} />
                Delete
              </button>
            )}
          </div>
        </div>
      )}

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
                ? 'Drag and drop files above, or use the Upload Files button'
                : 'No documents in this folder'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="document-grid">
            {documents.map((doc) => (
              <DocumentCard
                key={doc.id}
                document={doc}
                onClick={() => !isDocumentRestricted(doc.id) && onDocumentClick?.(doc)}
                onDownload={() => onDocumentDownload?.(doc)}
                onDelete={() => onDocumentDelete?.(doc)}
                onMove={() => onDocumentMove?.(doc)}
                onRequestAccess={() => onRequestAccess?.(doc)}
                isAdmin={isAdmin}
                isSelected={selectedIds.has(doc.id)}
                onSelectChange={canSelect ? (selected) => handleSelectChange(doc.id, selected) : undefined}
                isRestricted={isDocumentRestricted(doc.id)}
              />
            ))}
          </div>
        ) : (
          <table className="document-table">
            <thead>
              <tr>
                {canSelect && (
                  <th className="document-select-header">
                    <button
                      className="document-select-checkbox"
                      onClick={handleSelectAll}
                      title={selectedIds.size === accessibleDocuments.length ? 'Deselect all' : 'Select all'}
                    >
                      {selectedIds.size === accessibleDocuments.length && accessibleDocuments.length > 0 ? (
                        <CheckSquare size={18} />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                  </th>
                )}
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
                  onClick={() => !isDocumentRestricted(doc.id) && onDocumentClick?.(doc)}
                  onDownload={() => onDocumentDownload?.(doc)}
                  onDelete={() => onDocumentDelete?.(doc)}
                  onMove={() => onDocumentMove?.(doc)}
                  onRequestAccess={() => onRequestAccess?.(doc)}
                  isAdmin={isAdmin}
                  isSelected={selectedIds.has(doc.id)}
                  onSelectChange={canSelect ? (selected) => handleSelectChange(doc.id, selected) : undefined}
                  isRestricted={isDocumentRestricted(doc.id)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
