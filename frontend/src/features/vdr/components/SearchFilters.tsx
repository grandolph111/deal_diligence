import { useCallback } from 'react';
import { Filter, ChevronDown, X } from 'lucide-react';
import type { SearchFilters as SearchFiltersType, SearchType, FolderTreeNode, DocumentType, RiskLevel } from '../../../types/api';
import { DOCUMENT_TYPE_LABELS, RISK_LEVEL_LABELS } from '../../../types/api';

interface SearchFiltersProps {
  filters: SearchFiltersType;
  searchType: SearchType;
  folders: FolderTreeNode[];
  onFiltersChange: (filters: Partial<SearchFiltersType>) => void;
  onSearchTypeChange: (type: SearchType) => void;
  onClearFilters: () => void;
}

// Document type options from backend enum
const DOCUMENT_TYPES: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Types' },
  ...Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({
    value: value as DocumentType,
    label,
  })),
];

// Risk level options from backend enum
const RISK_LEVELS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All Risk Levels' },
  ...Object.entries(RISK_LEVEL_LABELS).map(([value, label]) => ({
    value: value as RiskLevel,
    label,
  })),
];

// Search type options
const SEARCH_TYPES: { value: SearchType; label: string; description: string }[] = [
  { value: 'keyword', label: 'Keyword', description: 'Exact text matching' },
  { value: 'semantic', label: 'Semantic', description: 'AI-powered meaning search' },
  { value: 'hybrid', label: 'Hybrid', description: 'Combined keyword + semantic' },
];

/**
 * Flatten folder tree for dropdown
 */
function flattenFolders(folders: FolderTreeNode[], depth = 0): Array<{ id: string; name: string; depth: number }> {
  const result: Array<{ id: string; name: string; depth: number }> = [];
  for (const folder of folders) {
    result.push({ id: folder.id, name: folder.name, depth });
    if (folder.children?.length) {
      result.push(...flattenFolders(folder.children, depth + 1));
    }
  }
  return result;
}

/**
 * Check if any filters are active
 */
function hasActiveFilters(filters: SearchFiltersType): boolean {
  return !!(
    filters.folderId ||
    filters.documentType ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.riskLevel
  );
}

/**
 * Search filters panel for VDR search
 */
export function SearchFilters({
  filters,
  searchType,
  folders,
  onFiltersChange,
  onSearchTypeChange,
  onClearFilters,
}: SearchFiltersProps) {
  const flatFolders = flattenFolders(folders);
  const activeFiltersCount = [
    filters.folderId,
    filters.documentType,
    filters.dateFrom || filters.dateTo,
    filters.riskLevel,
  ].filter(Boolean).length;

  // Handle folder change
  const handleFolderChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onFiltersChange({ folderId: e.target.value || null });
  }, [onFiltersChange]);

  // Handle document type change
  const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onFiltersChange({ documentType: e.target.value || null });
  }, [onFiltersChange]);

  // Handle risk level change
  const handleRiskChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onFiltersChange({ riskLevel: e.target.value || null });
  }, [onFiltersChange]);

  // Handle date from change
  const handleDateFromChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ dateFrom: e.target.value || null });
  }, [onFiltersChange]);

  // Handle date to change
  const handleDateToChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({ dateTo: e.target.value || null });
  }, [onFiltersChange]);

  // Handle search type change
  const handleSearchTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    onSearchTypeChange(e.target.value as SearchType);
  }, [onSearchTypeChange]);

  return (
    <div className="search-filters">
      <div className="search-filters-header">
        <span className="search-filters-title">
          <Filter size={16} />
          Filters
          {activeFiltersCount > 0 && (
            <span className="search-filters-badge">{activeFiltersCount}</span>
          )}
        </span>
        {hasActiveFilters(filters) && (
          <button
            type="button"
            className="search-filters-clear"
            onClick={onClearFilters}
          >
            <X size={14} />
            Clear all
          </button>
        )}
      </div>

      <div className="search-filters-grid">
        {/* Search Type */}
        <div className="search-filter-group">
          <label htmlFor="search-type">Search Type</label>
          <div className="select-wrapper">
            <select
              id="search-type"
              value={searchType}
              onChange={handleSearchTypeChange}
            >
              {SEARCH_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="select-icon" />
          </div>
        </div>

        {/* Folder Filter */}
        <div className="search-filter-group">
          <label htmlFor="folder-filter">Folder</label>
          <div className="select-wrapper">
            <select
              id="folder-filter"
              value={filters.folderId || ''}
              onChange={handleFolderChange}
            >
              <option value="">All Folders</option>
              {flatFolders.map(folder => (
                <option key={folder.id} value={folder.id}>
                  {'  '.repeat(folder.depth)}{folder.name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="select-icon" />
          </div>
        </div>

        {/* Document Type Filter */}
        <div className="search-filter-group">
          <label htmlFor="type-filter">Document Type</label>
          <div className="select-wrapper">
            <select
              id="type-filter"
              value={filters.documentType || ''}
              onChange={handleTypeChange}
            >
              {DOCUMENT_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="select-icon" />
          </div>
        </div>

        {/* Risk Level Filter */}
        <div className="search-filter-group">
          <label htmlFor="risk-filter">Risk Level</label>
          <div className="select-wrapper">
            <select
              id="risk-filter"
              value={filters.riskLevel || ''}
              onChange={handleRiskChange}
            >
              {RISK_LEVELS.map(level => (
                <option key={level.value} value={level.value}>
                  {level.label}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="select-icon" />
          </div>
        </div>

        {/* Date Range */}
        <div className="search-filter-group search-filter-date-range">
          <label>Upload Date Range</label>
          <div className="date-range-inputs">
            <input
              type="date"
              value={filters.dateFrom || ''}
              onChange={handleDateFromChange}
              placeholder="From"
              aria-label="Date from"
            />
            <span className="date-range-separator">to</span>
            <input
              type="date"
              value={filters.dateTo || ''}
              onChange={handleDateToChange}
              placeholder="To"
              aria-label="Date to"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
