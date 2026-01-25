import { useCallback } from 'react';
import { Search, FileQuestion, ChevronLeft, ChevronRight, Loader } from 'lucide-react';
import { SearchResultItem } from './SearchResultItem';
import type { SearchResult } from '../../../types/api';

interface SearchResultsProps {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  loading: boolean;
  error: string | null;
  hasSearched: boolean;
  onDocumentClick: (documentId: string, folderId: string | null) => void;
  onRequestAccess?: (documentId: string) => void;
  onPageChange: (page: number) => void;
}

/**
 * Calculate pagination info
 */
function getPaginationInfo(total: number, page: number, pageSize: number) {
  const totalPages = Math.ceil(total / pageSize);
  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return { totalPages, startItem, endItem };
}

/**
 * Generate page numbers for pagination
 */
function getPageNumbers(currentPage: number, totalPages: number): (number | 'ellipsis')[] {
  const pages: (number | 'ellipsis')[] = [];
  const maxVisible = 7;

  if (totalPages <= maxVisible) {
    // Show all pages
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i);
    }
  } else {
    // Always show first page
    pages.push(1);

    if (currentPage > 3) {
      pages.push('ellipsis');
    }

    // Show pages around current
    const start = Math.max(2, currentPage - 1);
    const end = Math.min(totalPages - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (currentPage < totalPages - 2) {
      pages.push('ellipsis');
    }

    // Always show last page
    if (totalPages > 1) {
      pages.push(totalPages);
    }
  }

  return pages;
}

/**
 * Search results panel with pagination
 */
export function SearchResults({
  results,
  total,
  page,
  pageSize,
  query,
  loading,
  error,
  hasSearched,
  onDocumentClick,
  onRequestAccess,
  onPageChange,
}: SearchResultsProps) {
  const { totalPages, startItem, endItem } = getPaginationInfo(total, page, pageSize);
  const pageNumbers = getPageNumbers(page, totalPages);

  // Handle page navigation
  const handlePrevPage = useCallback(() => {
    if (page > 1) {
      onPageChange(page - 1);
    }
  }, [page, onPageChange]);

  const handleNextPage = useCallback(() => {
    if (page < totalPages) {
      onPageChange(page + 1);
    }
  }, [page, totalPages, onPageChange]);

  const handlePageClick = useCallback((pageNum: number) => {
    onPageChange(pageNum);
  }, [onPageChange]);

  // Loading state
  if (loading && !results.length) {
    return (
      <div className="search-results-loading">
        <Loader size={32} className="spinning" />
        <p>Searching documents...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="search-results-error">
        <FileQuestion size={48} />
        <h3>Search Error</h3>
        <p>{error}</p>
      </div>
    );
  }

  // Initial state (no search yet)
  if (!hasSearched) {
    return (
      <div className="search-results-empty">
        <Search size={48} />
        <h3>Search Documents</h3>
        <p>Enter a search term above to find documents in the data room.</p>
      </div>
    );
  }

  // No results
  if (results.length === 0) {
    return (
      <div className="search-results-empty">
        <FileQuestion size={48} />
        <h3>No Results Found</h3>
        <p>
          No documents match "{query}". Try different keywords or adjust your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="search-results">
      {/* Results header */}
      <header className="search-results-header">
        <span className="search-results-count">
          {loading && <Loader size={14} className="spinning" />}
          Showing {startItem}–{endItem} of {total} results for "{query}"
        </span>
      </header>

      {/* Results list */}
      <div className="search-results-list">
        {results.map((result) => (
          <SearchResultItem
            key={result.document.id}
            result={result}
            onDocumentClick={onDocumentClick}
            onRequestAccess={onRequestAccess}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="search-pagination" aria-label="Search results pagination">
          <button
            type="button"
            className="pagination-btn pagination-prev"
            onClick={handlePrevPage}
            disabled={page === 1 || loading}
            aria-label="Previous page"
          >
            <ChevronLeft size={18} />
            Previous
          </button>

          <div className="pagination-pages">
            {pageNumbers.map((pageNum, index) => (
              pageNum === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="pagination-ellipsis">
                  ...
                </span>
              ) : (
                <button
                  key={pageNum}
                  type="button"
                  className={`pagination-page ${pageNum === page ? 'active' : ''}`}
                  onClick={() => handlePageClick(pageNum)}
                  disabled={loading}
                  aria-label={`Page ${pageNum}`}
                  aria-current={pageNum === page ? 'page' : undefined}
                >
                  {pageNum}
                </button>
              )
            ))}
          </div>

          <button
            type="button"
            className="pagination-btn pagination-next"
            onClick={handleNextPage}
            disabled={page === totalPages || loading}
            aria-label="Next page"
          >
            Next
            <ChevronRight size={18} />
          </button>
        </nav>
      )}
    </div>
  );
}
