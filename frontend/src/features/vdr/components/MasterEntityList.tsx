import { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Users,
  Building2,
  MapPin,
  Scale,
  ChevronLeft,
  ChevronRight,
  FileText,
  Merge,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import type {
  MasterEntityWithCount,
  EntityType,
  DuplicatePair,
} from '../../../types/api';
import { ENTITY_TYPE_LABELS, ENTITY_TYPE_COLORS } from '../../../types/api';

interface MasterEntityListProps {
  entities: MasterEntityWithCount[];
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  entityTypeFilter: EntityType | null;
  searchQuery: string;
  duplicates: DuplicatePair[];
  duplicatesLoading: boolean;
  isAdmin: boolean;
  onEntityClick: (entityId: string) => void;
  onPageChange: (page: number) => void;
  onEntityTypeFilterChange: (type: EntityType | null) => void;
  onSearchQueryChange: (query: string) => void;
  onRunDeduplication: () => void;
  onMergeClick: (entity1Id: string, entity2Id: string) => void;
}

// Entity type icons
const ENTITY_TYPE_ICONS: Record<string, React.FC<{ size?: number; className?: string }>> = {
  PERSON: Users,
  ORGANIZATION: Building2,
  LOCATION: MapPin,
  JURISDICTION: Scale,
};

/**
 * Get the icon component for an entity type
 */
function getEntityTypeIcon(entityType: string): React.FC<{ size?: number; className?: string }> {
  return ENTITY_TYPE_ICONS[entityType] || FileText;
}

/**
 * Master Entity List component for displaying and managing canonical entities
 */
export function MasterEntityList({
  entities,
  loading,
  error,
  pagination,
  entityTypeFilter,
  searchQuery,
  duplicates,
  duplicatesLoading,
  isAdmin,
  onEntityClick,
  onPageChange,
  onEntityTypeFilterChange,
  onSearchQueryChange,
  onRunDeduplication,
  onMergeClick,
}: MasterEntityListProps) {
  const [showDuplicates, setShowDuplicates] = useState(false);

  // Deduplicate-able entity types
  const deduplicatableTypes: EntityType[] = ['PERSON', 'ORGANIZATION', 'LOCATION', 'JURISDICTION'];

  // Entity type filter options
  const entityTypeOptions = useMemo(() => {
    return deduplicatableTypes.map((type) => ({
      value: type,
      label: ENTITY_TYPE_LABELS[type],
    }));
  }, []);

  // Handle search input with debounce via parent
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearchQueryChange(e.target.value);
  };

  return (
    <div className="master-entity-list">
      {/* Header with filters */}
      <div className="entity-list-header">
        <div className="entity-list-filters">
          {/* Search input */}
          <div className="entity-search-input">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search entities..."
              value={searchQuery}
              onChange={handleSearchChange}
            />
          </div>

          {/* Entity type filter */}
          <div className="entity-type-filter">
            <Filter size={16} />
            <select
              value={entityTypeFilter || ''}
              onChange={(e) =>
                onEntityTypeFilterChange(
                  e.target.value ? (e.target.value as EntityType) : null
                )
              }
            >
              <option value="">All Types</option>
              {entityTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="entity-list-actions">
          {isAdmin && (
            <>
              <button
                className={`button small ${showDuplicates ? 'primary' : 'secondary'}`}
                onClick={() => setShowDuplicates(!showDuplicates)}
              >
                <AlertCircle size={14} />
                Duplicates {duplicates.length > 0 && `(${duplicates.length})`}
              </button>
              <button
                className="button small secondary"
                onClick={onRunDeduplication}
                disabled={loading}
              >
                <Sparkles size={14} />
                Run Deduplication
              </button>
            </>
          )}
        </div>
      </div>

      {/* Duplicates panel */}
      {showDuplicates && (
        <div className="duplicates-panel">
          <h4>Potential Duplicates</h4>
          {duplicatesLoading ? (
            <p className="duplicates-loading">Loading duplicates...</p>
          ) : duplicates.length === 0 ? (
            <p className="duplicates-empty">No potential duplicates found.</p>
          ) : (
            <div className="duplicates-list">
              {duplicates.map((pair, index) => (
                <div key={index} className="duplicate-pair">
                  <div className="duplicate-entity">
                    <span
                      className="entity-type-badge"
                      style={{ backgroundColor: ENTITY_TYPE_COLORS[pair.entity1.entityType] }}
                    >
                      {ENTITY_TYPE_LABELS[pair.entity1.entityType]}
                    </span>
                    <span className="entity-name">{pair.entity1.canonicalName}</span>
                  </div>
                  <div className="duplicate-similarity">
                    {Math.round(pair.similarity * 100)}% match
                  </div>
                  <div className="duplicate-entity">
                    <span className="entity-name">{pair.entity2.canonicalName}</span>
                  </div>
                  {isAdmin && (
                    <button
                      className="button small primary"
                      onClick={() => onMergeClick(pair.entity1.id, pair.entity2.id)}
                    >
                      <Merge size={12} />
                      Merge
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="entity-list-error">
          <p>{error}</p>
        </div>
      )}

      {/* Loading state */}
      {loading && entities.length === 0 && (
        <div className="entity-list-loading">
          <div className="loading-spinner" />
          <p>Loading entities...</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && entities.length === 0 && (
        <div className="entity-list-empty">
          <Users size={48} className="empty-icon" />
          <h3>No Entities Found</h3>
          <p>
            {searchQuery || entityTypeFilter
              ? 'Try adjusting your filters or search query.'
              : 'Entities are extracted automatically when documents are processed.'}
          </p>
        </div>
      )}

      {/* Entity list */}
      {entities.length > 0 && (
        <>
          <div className="entity-list-content">
            <table className="entity-table">
              <thead>
                <tr>
                  <th>Entity</th>
                  <th>Type</th>
                  <th>Aliases</th>
                  <th>Documents</th>
                </tr>
              </thead>
              <tbody>
                {entities.map((entity) => (
                    <tr
                      key={entity.id}
                      onClick={() => onEntityClick(entity.id)}
                      className="entity-row"
                    >
                      <td className="entity-name-cell">
                        <div className="entity-name-content">
                          <span style={{ color: ENTITY_TYPE_COLORS[entity.entityType], display: 'inline-flex' }}>
                            {(() => {
                              const IconComponent = getEntityTypeIcon(entity.entityType);
                              return <IconComponent size={16} />;
                            })()}
                          </span>
                          <span className="entity-canonical-name">
                            {entity.canonicalName}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span
                          className="entity-type-badge"
                          style={{ backgroundColor: ENTITY_TYPE_COLORS[entity.entityType] }}
                        >
                          {ENTITY_TYPE_LABELS[entity.entityType]}
                        </span>
                      </td>
                      <td className="entity-aliases-cell">
                        {entity.aliases && entity.aliases.length > 0 ? (
                          <span className="aliases-count">
                            {entity.aliases.length} alias{entity.aliases.length !== 1 ? 'es' : ''}
                          </span>
                        ) : (
                          <span className="no-aliases">—</span>
                        )}
                      </td>
                      <td className="entity-doc-count-cell">
                        <span className="doc-count">
                          <FileText size={14} />
                          {entity.documentCount}
                        </span>
                      </td>
                    </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="entity-list-pagination">
              <button
                className="pagination-button"
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="pagination-info">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                className="pagination-button"
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
