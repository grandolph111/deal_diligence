import { useEffect, useState, useCallback } from 'react';
import { X, FileText, Link as LinkIcon, ExternalLink } from 'lucide-react';
import { masterEntitiesService } from '../../../api';
import type { MasterEntityDetail, EntityType } from '../../../types/api';
import { ENTITY_TYPE_COLORS, ENTITY_TYPE_LABELS } from '../../../types/api';

interface NodeDetailPanelProps {
  nodeId: string | null;
  projectId: string;
  onClose: () => void;
  onEntityClick: (entityId: string) => void;
  onDocumentClick: (documentId: string) => void;
}

/**
 * Panel showing details of a selected node in the graph
 */
export function NodeDetailPanel({
  nodeId,
  projectId,
  onClose,
  onEntityClick,
  onDocumentClick,
}: NodeDetailPanelProps) {
  const [entity, setEntity] = useState<MasterEntityDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch entity details when nodeId changes
  useEffect(() => {
    if (!nodeId || !projectId) {
      setEntity(null);
      return;
    }

    let cancelled = false;
    const entityId = nodeId; // Capture for async closure
    const projId = projectId; // Capture for async closure

    async function fetchEntity() {
      setLoading(true);
      setError(null);

      try {
        const data = await masterEntitiesService.getMasterEntity(projId, entityId);
        if (!cancelled) {
          setEntity(data);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Failed to load entity details';
          setError(message);
          setEntity(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchEntity();

    return () => {
      cancelled = true;
    };
  }, [nodeId, projectId]);

  // Handle related entity click
  const handleRelatedEntityClick = useCallback(
    (entityId: string) => {
      onEntityClick(entityId);
    },
    [onEntityClick]
  );

  // Handle document click
  const handleDocumentClick = useCallback(
    (documentId: string) => {
      onDocumentClick(documentId);
    },
    [onDocumentClick]
  );

  if (!nodeId) {
    return null;
  }

  return (
    <div className="node-detail-panel">
      <div className="node-detail-header">
        <h3>Entity Details</h3>
        <button className="close-button" onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>

      {loading && (
        <div className="node-detail-loading">
          <div className="loading-spinner small" />
          <span>Loading...</span>
        </div>
      )}

      {error && (
        <div className="node-detail-error">
          <p>{error}</p>
        </div>
      )}

      {entity && !loading && (
        <div className="node-detail-content">
          {/* Entity Info */}
          <div className="node-detail-info">
            <div className="entity-name">
              <span
                className="entity-type-badge"
                style={{ backgroundColor: ENTITY_TYPE_COLORS[entity.entityType as EntityType] }}
              >
                {ENTITY_TYPE_LABELS[entity.entityType as EntityType] || entity.entityType}
              </span>
              <h4>{entity.canonicalName}</h4>
            </div>

            {entity.aliases && entity.aliases.length > 0 && (
              <div className="entity-aliases">
                <span className="label">Also known as:</span>
                <div className="alias-list">
                  {entity.aliases.map((alias, i) => (
                    <span key={i} className="alias-chip">
                      {alias}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="entity-stat">
              <FileText size={14} />
              <span>{entity.documentCount || 0} documents</span>
            </div>
          </div>

          {/* Related Entities */}
          {(entity.relatedEntities?.length > 0 || entity.relatedFrom?.length > 0) && (
            <div className="node-detail-section">
              <h5>
                <LinkIcon size={14} />
                Related Entities
              </h5>
              <div className="related-entities-list">
                {entity.relatedEntities?.map((rel) => (
                  <button
                    key={rel.targetEntity.id}
                    className="related-entity-item"
                    onClick={() => handleRelatedEntityClick(rel.targetEntity.id)}
                  >
                    <span
                      className="entity-type-dot"
                      style={{
                        backgroundColor:
                          ENTITY_TYPE_COLORS[rel.targetEntity.entityType as EntityType] ||
                          '#6b7280',
                      }}
                    />
                    <span className="entity-name">{rel.targetEntity.canonicalName}</span>
                    <ExternalLink size={12} />
                  </button>
                ))}
                {entity.relatedFrom?.map((rel) => (
                  <button
                    key={rel.sourceEntity.id}
                    className="related-entity-item"
                    onClick={() => handleRelatedEntityClick(rel.sourceEntity.id)}
                  >
                    <span
                      className="entity-type-dot"
                      style={{
                        backgroundColor:
                          ENTITY_TYPE_COLORS[rel.sourceEntity.entityType as EntityType] ||
                          '#6b7280',
                      }}
                    />
                    <span className="entity-name">{rel.sourceEntity.canonicalName}</span>
                    <ExternalLink size={12} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Documents */}
          {entity.documentEntities && entity.documentEntities.length > 0 && (
            <div className="node-detail-section">
              <h5>
                <FileText size={14} />
                Documents
              </h5>
              <div className="documents-list">
                {entity.documentEntities.slice(0, 10).map((de) => (
                  <button
                    key={de.id}
                    className="document-item"
                    onClick={() => handleDocumentClick(de.document.id)}
                  >
                    <FileText size={14} />
                    <span className="document-name">{de.document.name}</span>
                    {de.pageNumber && (
                      <span className="page-number">p. {de.pageNumber}</span>
                    )}
                  </button>
                ))}
                {entity.documentEntities.length > 10 && (
                  <p className="more-items">
                    +{entity.documentEntities.length - 10} more documents
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
