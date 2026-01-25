import { useCallback, useState } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';
import { SearchBar } from './SearchBar';
import { SearchFilters } from './SearchFilters';
import { SearchResults } from './SearchResults';
import { useSearch } from '../hooks/useSearch';
import type { FolderTreeNode } from '../../../types/api';

interface SearchPanelProps {
  projectId: string | undefined;
  folders: FolderTreeNode[];
  isOpen: boolean;
  onClose: () => void;
  onDocumentClick: (documentId: string, folderId: string | null) => void;
  onRequestAccess?: (documentId: string) => void;
}

/**
 * Full search panel overlay for VDR document search
 */
export function SearchPanel({
  projectId,
  folders,
  isOpen,
  onClose,
  onDocumentClick,
  onRequestAccess,
}: SearchPanelProps) {
  // Show/hide filters panel
  const [showFilters, setShowFilters] = useState(false);

  // Search hook
  const {
    query,
    results,
    total,
    page,
    pageSize,
    loading,
    error,
    hasSearched,
    searchType,
    filters,
    setQuery,
    setSearchType,
    setFilters,
    setPage,
    clearSearch,
  } = useSearch({ projectId });

  // Toggle filters panel
  const toggleFilters = useCallback(() => {
    setShowFilters(prev => !prev);
  }, []);

  // Handle document click - close search and navigate
  const handleDocumentClick = useCallback((documentId: string, folderId: string | null) => {
    onDocumentClick(documentId, folderId);
    onClose();
  }, [onDocumentClick, onClose]);

  // Handle close
  const handleClose = useCallback(() => {
    clearSearch();
    onClose();
  }, [clearSearch, onClose]);

  // Clear filters
  const handleClearFilters = useCallback(() => {
    setFilters({
      folderId: null,
      documentType: null,
      dateFrom: null,
      dateTo: null,
      riskLevel: null,
    });
    setSearchType('keyword');
  }, [setFilters, setSearchType]);

  // Check if any filters are active
  const hasActiveFilters = !!(
    filters.folderId ||
    filters.documentType ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.riskLevel ||
    searchType !== 'keyword'
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="search-panel-overlay">
      <div className="search-panel">
        {/* Header */}
        <header className="search-panel-header">
          <div className="search-panel-search">
            <SearchBar
              query={query}
              onQueryChange={setQuery}
              loading={loading}
              placeholder="Search documents, contracts, agreements..."
              autoFocus
            />
          </div>

          <div className="search-panel-actions">
            <button
              type="button"
              className={`icon-button ${showFilters ? 'active' : ''} ${hasActiveFilters ? 'has-filters' : ''}`}
              onClick={toggleFilters}
              title="Toggle filters"
            >
              <SlidersHorizontal size={20} />
              {hasActiveFilters && <span className="filter-dot" />}
            </button>
            <button
              type="button"
              className="icon-button"
              onClick={handleClose}
              title="Close search"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* Filters panel (collapsible) */}
        {showFilters && (
          <SearchFilters
            filters={filters}
            searchType={searchType}
            folders={folders}
            onFiltersChange={setFilters}
            onSearchTypeChange={setSearchType}
            onClearFilters={handleClearFilters}
          />
        )}

        {/* Results */}
        <div className="search-panel-content">
          <SearchResults
            results={results}
            total={total}
            page={page}
            pageSize={pageSize}
            query={query}
            loading={loading}
            error={error}
            hasSearched={hasSearched}
            onDocumentClick={handleDocumentClick}
            onRequestAccess={onRequestAccess}
            onPageChange={setPage}
          />
        </div>
      </div>
    </div>
  );
}
