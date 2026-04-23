import {
  X,
  User,
  Building2,
  Calendar,
  DollarSign,
  Percent,
  MapPin,
  FileText,
  Scale,
  Globe,
  AlertTriangle,
  CheckCircle,
  Clock,
  Tag,
} from 'lucide-react';
import type { DocumentEntity, EntityType } from '../../../types/api';
import { ENTITY_TYPE_COLORS, ENTITY_TYPE_LABELS } from '../../../types/api';

interface EntityDetailsModalProps {
  entity: DocumentEntity;
  onClose: () => void;
  onNavigateToPage?: (pageNumber: number) => void;
}

// Icons for each entity type. Partial<> + fallback handles entity types the
// backend extractor emits that aren't in the frontend's closed enum (e.g.
// ADDRESS, REGULATOR, ROLE from Claude's free-form entityType output).
const ENTITY_TYPE_ICONS: Partial<Record<EntityType, React.ElementType>> = {
  PERSON: User,
  ORGANIZATION: Building2,
  DATE: Calendar,
  MONEY: DollarSign,
  PERCENTAGE: Percent,
  LOCATION: MapPin,
  CONTRACT_TERM: FileText,
  CLAUSE_TYPE: Scale,
  JURISDICTION: Globe,
};

const DEFAULT_ENTITY_ICON: React.ElementType = Tag;
const DEFAULT_ENTITY_COLOR = '#6b7280';

const humanizeEntityType = (type: string): string =>
  type
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

/**
 * Format confidence score as percentage with color
 */
function getConfidenceClass(confidence: number): string {
  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.8) return 'medium';
  return 'low';
}

/**
 * Format date to locale string
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Entity Details Modal
 * Shows detailed information about a selected entity
 */
export function EntityDetailsModal({
  entity,
  onClose,
  onNavigateToPage,
}: EntityDetailsModalProps) {
  const Icon = ENTITY_TYPE_ICONS[entity.entityType] ?? DEFAULT_ENTITY_ICON;
  const entityColor =
    ENTITY_TYPE_COLORS[entity.entityType] ?? DEFAULT_ENTITY_COLOR;
  const entityLabel =
    ENTITY_TYPE_LABELS[entity.entityType] ??
    humanizeEntityType(entity.entityType);
  const confidenceClass = getConfidenceClass(entity.confidence);

  const handleGoToPage = () => {
    if (entity.pageNumber && onNavigateToPage) {
      onNavigateToPage(entity.pageNumber);
      onClose();
    }
  };

  return (
    <div className="entity-details-modal-overlay" onClick={onClose}>
      <div
        className="entity-details-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          '--entity-color': entityColor,
        } as React.CSSProperties}
      >
        {/* Header */}
        <div className="entity-details-header">
          <div className="entity-details-type">
            <Icon size={18} />
            <span>{entityLabel}</span>
          </div>
          <button className="icon-button" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="entity-details-content">
          {/* Main value */}
          <div className="entity-details-value">
            <span className="entity-value-text">{entity.text}</span>
            {entity.normalizedText && entity.normalizedText !== entity.text && (
              <span className="entity-value-normalized">
                Normalized: {entity.normalizedText}
              </span>
            )}
          </div>

          {/* Metadata grid */}
          <div className="entity-details-grid">
            {/* Confidence */}
            <div className="entity-detail-item">
              <span className="detail-label">Confidence</span>
              <span className={`detail-value confidence-${confidenceClass}`}>
                {Math.round(entity.confidence * 100)}%
              </span>
            </div>

            {/* Page */}
            {entity.pageNumber && (
              <div className="entity-detail-item">
                <span className="detail-label">Page</span>
                <button
                  className="detail-value-link"
                  onClick={handleGoToPage}
                  title="Go to page"
                >
                  Page {entity.pageNumber}
                </button>
              </div>
            )}

            {/* Position */}
            <div className="entity-detail-item">
              <span className="detail-label">Position</span>
              <span className="detail-value">
                {entity.startOffset} - {entity.endOffset}
              </span>
            </div>

            {/* Created */}
            <div className="entity-detail-item">
              <span className="detail-label">Extracted</span>
              <span className="detail-value">
                <Clock size={12} />
                {formatDate(entity.createdAt)}
              </span>
            </div>
          </div>

          {/* Status */}
          <div className="entity-details-status">
            {entity.needsReview ? (
              <div className="entity-status-badge needs-review">
                <AlertTriangle size={14} />
                <span>Needs Review</span>
              </div>
            ) : (
              <div className="entity-status-badge verified">
                <CheckCircle size={14} />
                <span>Verified</span>
              </div>
            )}
          </div>

          {/* Master entity link (if linked) */}
          {entity.masterEntity && (
            <div className="entity-master-link">
              <span className="master-label">Linked to:</span>
              <span className="master-name">{entity.masterEntity.canonicalName}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="entity-details-actions">
          {entity.pageNumber && onNavigateToPage && (
            <button className="btn btn-primary" onClick={handleGoToPage}>
              Go to Page {entity.pageNumber}
            </button>
          )}
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
