import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  User,
  Building2,
  Calendar,
  DollarSign,
  Percent,
  MapPin,
  FileText,
  Scale,
  Globe,
  Eye,
  EyeOff,
  AlertTriangle,
  Loader,
  Info,
} from 'lucide-react';
import type { DocumentEntity, EntityType } from '../../../types/api';
import { ENTITY_TYPE_COLORS, ENTITY_TYPE_LABELS } from '../../../types/api';

interface EntitiesPanelProps {
  entities: DocumentEntity[];
  loading: boolean;
  error: string | null;
  highlightEnabled: boolean;
  highlightedTypes: Set<EntityType>;
  selectedEntity: DocumentEntity | null;
  onToggleHighlight: () => void;
  onToggleTypeHighlight: (type: EntityType) => void;
  onSelectEntity: (entity: DocumentEntity | null) => void;
  onNavigateToPage?: (pageNumber: number) => void;
}

// Icons for each entity type
const ENTITY_TYPE_ICONS: Record<EntityType, React.ElementType> = {
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

/**
 * Format confidence score as percentage
 */
function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

/**
 * Group entities by type
 */
function groupEntitiesByType(entities: DocumentEntity[]): Map<EntityType, DocumentEntity[]> {
  const grouped = new Map<EntityType, DocumentEntity[]>();

  for (const entity of entities) {
    const existing = grouped.get(entity.entityType) || [];
    existing.push(entity);
    grouped.set(entity.entityType, existing);
  }

  // Sort entities within each group by page number, then by start offset
  for (const [type, typeEntities] of grouped) {
    typeEntities.sort((a, b) => {
      if (a.pageNumber !== b.pageNumber) {
        return (a.pageNumber || 0) - (b.pageNumber || 0);
      }
      return a.startOffset - b.startOffset;
    });
    grouped.set(type, typeEntities);
  }

  return grouped;
}

/**
 * Entities Panel component for document viewer
 * Displays extracted entities grouped by type with highlighting controls
 */
export function EntitiesPanel({
  entities,
  loading,
  error,
  highlightEnabled,
  highlightedTypes,
  selectedEntity,
  onToggleHighlight,
  onToggleTypeHighlight,
  onSelectEntity,
  onNavigateToPage,
}: EntitiesPanelProps) {
  const [expandedTypes, setExpandedTypes] = useState<Set<EntityType>>(new Set());

  // Group entities by type
  const groupedEntities = useMemo(() => groupEntitiesByType(entities), [entities]);

  // Toggle type expansion
  const toggleTypeExpansion = (type: EntityType) => {
    setExpandedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // Handle entity click
  const handleEntityClick = (entity: DocumentEntity) => {
    onSelectEntity(entity);
    if (entity.pageNumber && onNavigateToPage) {
      onNavigateToPage(entity.pageNumber);
    }
  };

  // Count entities needing review
  const needsReviewCount = entities.filter((e) => e.needsReview).length;

  if (loading) {
    return (
      <div className="entities-panel">
        <div className="entities-panel-loading">
          <Loader size={20} className="spinning" />
          <span>Loading entities...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="entities-panel">
        <div className="entities-panel-error">
          <AlertTriangle size={20} />
          <span>{error}</span>
        </div>
      </div>
    );
  }

  if (entities.length === 0) {
    return (
      <div className="entities-panel">
        <div className="entities-panel-empty">
          <Info size={20} />
          <span>No entities extracted</span>
          <p>Entities will appear here after document processing completes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="entities-panel">
      {/* Header with highlight toggle */}
      <div className="entities-panel-header">
        <h4>Entities ({entities.length})</h4>
        <button
          className={`icon-button small ${highlightEnabled ? 'active' : ''}`}
          onClick={onToggleHighlight}
          title={highlightEnabled ? 'Hide highlights' : 'Show highlights'}
        >
          {highlightEnabled ? <Eye size={16} /> : <EyeOff size={16} />}
        </button>
      </div>

      {/* Review warning */}
      {needsReviewCount > 0 && (
        <div className="entities-review-warning">
          <AlertTriangle size={14} />
          <span>{needsReviewCount} entities need review</span>
        </div>
      )}

      {/* Entity legend */}
      <div className="entities-legend">
        {Array.from(groupedEntities.keys()).map((type) => {
          const Icon = ENTITY_TYPE_ICONS[type];
          const isHighlighted = highlightedTypes.has(type);
          const count = groupedEntities.get(type)?.length || 0;

          return (
            <button
              key={type}
              className={`entity-legend-item ${isHighlighted ? 'active' : ''}`}
              onClick={() => onToggleTypeHighlight(type)}
              title={`${ENTITY_TYPE_LABELS[type]} (${count}) - Click to toggle`}
              style={{
                '--entity-color': ENTITY_TYPE_COLORS[type],
              } as React.CSSProperties}
            >
              <Icon size={12} />
              <span>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Entity groups */}
      <div className="entities-list">
        {Array.from(groupedEntities.entries()).map(([type, typeEntities]) => {
          const Icon = ENTITY_TYPE_ICONS[type];
          const isExpanded = expandedTypes.has(type);
          const isHighlighted = highlightedTypes.has(type);

          return (
            <div
              key={type}
              className={`entity-group ${isHighlighted ? 'highlighted' : ''}`}
              style={{
                '--entity-color': ENTITY_TYPE_COLORS[type],
              } as React.CSSProperties}
            >
              {/* Group header */}
              <button
                className="entity-group-header"
                onClick={() => toggleTypeExpansion(type)}
              >
                <div className="entity-group-icon">
                  <Icon size={14} />
                </div>
                <span className="entity-group-label">
                  {ENTITY_TYPE_LABELS[type]}
                </span>
                <span className="entity-group-count">{typeEntities.length}</span>
                <span className="entity-group-chevron">
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </span>
              </button>

              {/* Group items */}
              {isExpanded && (
                <div className="entity-group-items">
                  {typeEntities.map((entity) => (
                    <button
                      key={entity.id}
                      className={`entity-item ${
                        selectedEntity?.id === entity.id ? 'selected' : ''
                      } ${entity.needsReview ? 'needs-review' : ''}`}
                      onClick={() => handleEntityClick(entity)}
                    >
                      <div className="entity-item-content">
                        <span className="entity-item-text">{entity.text}</span>
                        {entity.normalizedText && entity.normalizedText !== entity.text && (
                          <span className="entity-item-normalized">
                            ({entity.normalizedText})
                          </span>
                        )}
                      </div>
                      <div className="entity-item-meta">
                        {entity.pageNumber && (
                          <span className="entity-item-page">p.{entity.pageNumber}</span>
                        )}
                        <span
                          className={`entity-item-confidence ${
                            entity.confidence < 0.8 ? 'low' : ''
                          }`}
                          title={`Confidence: ${formatConfidence(entity.confidence)}`}
                        >
                          {formatConfidence(entity.confidence)}
                        </span>
                        {entity.needsReview && (
                          <AlertTriangle size={12} className="review-icon" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
