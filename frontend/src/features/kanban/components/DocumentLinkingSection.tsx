import { useState } from 'react';
import { FileText, Plus, Loader } from 'lucide-react';
import { LinkedDocumentItem } from './LinkedDocumentItem';
import type { LinkedDocument } from '../../../types/api';

interface DocumentLinkingSectionProps {
  linkedDocuments: LinkedDocument[];
  loading: boolean;
  onUnlink: (documentId: string) => Promise<void>;
  onAddClick: () => void;
  onViewDocument?: (documentId: string, folderId: string | null) => void;
  canLink?: boolean;
  canUnlink?: boolean;
}

/**
 * Document linking section for task detail drawer
 */
export function DocumentLinkingSection({
  linkedDocuments,
  loading,
  onUnlink,
  onAddClick,
  onViewDocument,
  canLink = false,
  canUnlink = false,
}: DocumentLinkingSectionProps) {
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  const handleUnlink = async (documentId: string) => {
    setUnlinkingId(documentId);
    try {
      await onUnlink(documentId);
    } finally {
      setUnlinkingId(null);
    }
  };

  const handleView = (documentId: string, folderId: string | null) => {
    if (onViewDocument) {
      onViewDocument(documentId, folderId);
    }
  };

  return (
    <div className="document-linking-section">
      <div className="section-header">
        <h4>
          <FileText size={14} />
          Documents
          {linkedDocuments.length > 0 && (
            <span className="section-count">{linkedDocuments.length}</span>
          )}
        </h4>
        {canLink && (
          <button className="add-document-btn" onClick={onAddClick}>
            <Plus size={14} />
            Attach
          </button>
        )}
      </div>

      <div className="linked-documents-list">
        {loading ? (
          <div className="linked-documents-loading">
            <Loader size={16} className="spinning" />
            <span>Loading documents...</span>
          </div>
        ) : linkedDocuments.length === 0 ? (
          <div className="linked-documents-empty">
            <p>No documents attached</p>
            {canLink && (
              <button className="button secondary small" onClick={onAddClick}>
                <Plus size={12} />
                Attach Document
              </button>
            )}
          </div>
        ) : (
          linkedDocuments.map((linkedDoc) => (
            <LinkedDocumentItem
              key={linkedDoc.id}
              linkedDocument={linkedDoc}
              onUnlink={() => handleUnlink(linkedDoc.documentId)}
              onView={onViewDocument ? () => handleView(linkedDoc.documentId, linkedDoc.document.folderId) : undefined}
              canUnlink={canUnlink}
              isUnlinking={unlinkingId === linkedDoc.documentId}
            />
          ))
        )}
      </div>
    </div>
  );
}
