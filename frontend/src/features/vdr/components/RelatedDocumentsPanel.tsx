import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Link2,
  Loader,
  AlertCircle,
  ChevronRight,
  RefreshCw,
  Users,
  Building2,
  Calendar,
  MapPin,
  Hash,
  Briefcase,
} from 'lucide-react';
import type { EntityType } from '../../../types/api';
import type { RelatedDocumentsResponse } from '../../../api/services/relationships.service';
import { relationshipsService } from '../../../api/services/relationships.service';
import { DOCUMENT_TYPE_LABELS } from '../../../types/api';

interface RelatedDocumentsPanelProps {
  projectId: string;
  documentId: string;
  documentName: string;
  onNavigateToDocument?: (documentId: string, documentName: string) => void;
}

/**
 * Entity type icon mapping
 */
const ENTITY_TYPE_ICONS: Record<EntityType, React.ComponentType<{ size?: number }>> = {
  PERSON: Users,
  ORGANIZATION: Building2,
  DATE: Calendar,
  MONEY: Hash,
  PERCENTAGE: Hash,
  LOCATION: MapPin,
  CONTRACT_TERM: FileText,
  CLAUSE_TYPE: FileText,
  JURISDICTION: Briefcase,
};

/**
 * Entity type colors for badges
 */
const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
  PERSON: '#3b82f6',
  ORGANIZATION: '#8b5cf6',
  DATE: '#f59e0b',
  MONEY: '#10b981',
  PERCENTAGE: '#06b6d4',
  LOCATION: '#ef4444',
  CONTRACT_TERM: '#6366f1',
  CLAUSE_TYPE: '#ec4899',
  JURISDICTION: '#84cc16',
};

/**
 * Related Documents Panel component
 * Displays documents related to the current document based on shared entities
 */
export function RelatedDocumentsPanel({
  projectId,
  documentId,
  documentName,
  onNavigateToDocument,
}: RelatedDocumentsPanelProps) {
  const [data, setData] = useState<RelatedDocumentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  // Fetch related documents
  const fetchRelatedDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await relationshipsService.getRelatedDocuments(
        projectId,
        documentId,
        1,
        20
      );
      setData(response);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load related documents'
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, documentId]);

  useEffect(() => {
    fetchRelatedDocuments();
  }, [fetchRelatedDocuments]);

  // Toggle expanded state for a related document
  const toggleExpanded = useCallback((docId: string) => {
    setExpandedDocId((prev) => (prev === docId ? null : docId));
  }, []);

  // Handle clicking a document to navigate
  const handleDocumentClick = useCallback(
    (relatedDocId: string, relatedDocName: string) => {
      onNavigateToDocument?.(relatedDocId, relatedDocName);
    },
    [onNavigateToDocument]
  );

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  // Loading state
  if (loading) {
    return (
      <div className="related-documents-panel">
        <div className="related-documents-loading">
          <Loader size={24} className="spinning" />
          <p>Finding related documents...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="related-documents-panel">
        <div className="related-documents-error">
          <AlertCircle size={24} />
          <p>{error}</p>
          <button
            className="btn btn-secondary btn-sm"
            onClick={fetchRelatedDocuments}
          >
            <RefreshCw size={14} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  // No related documents
  if (!data || data.relatedDocuments.length === 0) {
    return (
      <div className="related-documents-panel">
        <div className="related-documents-empty">
          <Link2 size={32} />
          <h4>No Related Documents</h4>
          <p>
            No documents share entities with "{documentName}". Related documents
            will appear here once entities are extracted and linked.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="related-documents-panel">
      <div className="related-documents-header">
        <h4>
          <Link2 size={16} />
          Related Documents
        </h4>
        <span className="related-count">{data.relatedDocuments.length}</span>
      </div>

      <div className="related-documents-list">
        {data.relatedDocuments.map((item) => {
          const isExpanded = expandedDocId === item.document.id;
          const EntityIcon =
            item.sharedEntities.length > 0
              ? ENTITY_TYPE_ICONS[item.sharedEntities[0].entityType] || Link2
              : Link2;

          return (
            <div
              key={item.document.id}
              className={`related-document-item ${isExpanded ? 'expanded' : ''}`}
            >
              <div
                className="related-document-main"
                onClick={() => toggleExpanded(item.document.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleExpanded(item.document.id);
                  }
                }}
              >
                <div className="related-document-icon">
                  <FileText size={18} />
                </div>
                <div className="related-document-info">
                  <span className="related-document-name">
                    {item.document.name}
                  </span>
                  <div className="related-document-meta">
                    {item.document.documentType && (
                      <span className="document-type-badge">
                        {DOCUMENT_TYPE_LABELS[
                          item.document.documentType as keyof typeof DOCUMENT_TYPE_LABELS
                        ] || item.document.documentType}
                      </span>
                    )}
                    <span className="shared-count">
                      <EntityIcon size={12} />
                      {item.sharedEntityCount} shared{' '}
                      {item.sharedEntityCount === 1 ? 'entity' : 'entities'}
                    </span>
                  </div>
                </div>
                <ChevronRight
                  size={16}
                  className={`expand-icon ${isExpanded ? 'rotated' : ''}`}
                />
              </div>

              {isExpanded && (
                <div className="related-document-details">
                  <div className="related-document-date">
                    <Calendar size={12} />
                    <span>Uploaded {formatDate(item.document.createdAt)}</span>
                  </div>

                  <div className="shared-entities-section">
                    <h5>Shared Entities</h5>
                    <div className="shared-entities-list">
                      {item.sharedEntities.map((entity) => {
                        const Icon =
                          ENTITY_TYPE_ICONS[entity.entityType] || Link2;
                        const color = ENTITY_TYPE_COLORS[entity.entityType];
                        return (
                          <div
                            key={entity.id}
                            className="shared-entity-badge"
                            style={{ borderColor: color }}
                          >
                            <span style={{ color, display: 'flex' }}>
                              <Icon size={12} />
                            </span>
                            <span>{entity.canonicalName}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    className="view-document-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDocumentClick(item.document.id, item.document.name);
                    }}
                  >
                    <FileText size={14} />
                    View Document
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {data.pagination.totalPages > 1 && (
        <div className="related-documents-footer">
          <span className="pagination-info">
            Showing {data.relatedDocuments.length} of {data.pagination.total}
          </span>
        </div>
      )}
    </div>
  );
}
