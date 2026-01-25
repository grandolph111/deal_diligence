import { useState, useCallback, useRef, useEffect } from 'react';
import { searchService } from '../../../api';
import type { SearchResult, SearchFilters, SearchType } from '../../../types/api';

interface UseSearchProps {
  projectId: string | undefined;
  debounceMs?: number;
}

interface UseSearchReturn {
  // State
  query: string;
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  loading: boolean;
  error: string | null;
  hasSearched: boolean;
  searchType: SearchType;
  filters: SearchFilters;

  // Actions
  setQuery: (query: string) => void;
  setSearchType: (type: SearchType) => void;
  setFilters: (filters: Partial<SearchFilters>) => void;
  setPage: (page: number) => void;
  search: () => Promise<void>;
  clearSearch: () => void;
}

const DEFAULT_PAGE_SIZE = 20;

/**
 * Hook for managing VDR document search
 */
export function useSearch({
  projectId,
  debounceMs = 300,
}: UseSearchProps): UseSearchReturn {
  // Search state
  const [query, setQueryInternal] = useState('');
  const [searchType, setSearchType] = useState<SearchType>('keyword');
  const [filters, setFiltersInternal] = useState<SearchFilters>({});
  const [page, setPage] = useState(1);
  const [pageSize] = useState(DEFAULT_PAGE_SIZE);

  // Results state
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Debounce timer ref
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Abort controller for canceling pending requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Perform search
  const performSearch = useCallback(async (
    searchQuery: string,
    searchPage: number = 1
  ) => {
    if (!projectId || !searchQuery.trim()) {
      return;
    }

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const response = await searchService.search(projectId, {
        query: searchQuery.trim(),
        searchType,
        ...filters,
        page: searchPage,
        pageSize,
      });

      setResults(response.results);
      setTotal(response.total);
      setPage(response.page);
      setHasSearched(true);
    } catch (err) {
      // Don't set error if request was aborted
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [projectId, searchType, filters, pageSize]);

  // Debounced search trigger
  const triggerSearch = useCallback((searchQuery: string) => {
    // Clear any existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // If query is empty, clear results
    if (!searchQuery.trim()) {
      setResults([]);
      setTotal(0);
      setHasSearched(false);
      return;
    }

    // Set debounce timer
    debounceTimerRef.current = setTimeout(() => {
      performSearch(searchQuery, 1);
    }, debounceMs);
  }, [performSearch, debounceMs]);

  // Set query with debounced search
  const setQuery = useCallback((newQuery: string) => {
    setQueryInternal(newQuery);
    triggerSearch(newQuery);
  }, [triggerSearch]);

  // Set filters and re-search
  const setFilters = useCallback((newFilters: Partial<SearchFilters>) => {
    setFiltersInternal(prev => ({ ...prev, ...newFilters }));
    // Re-search with new filters if we have a query
    if (query.trim()) {
      // Clear existing timer and search immediately
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      performSearch(query, 1);
    }
  }, [query, performSearch]);

  // Manual search trigger
  const search = useCallback(async () => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    await performSearch(query, page);
  }, [performSearch, query, page]);

  // Clear search
  const clearSearch = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setQueryInternal('');
    setResults([]);
    setTotal(0);
    setPage(1);
    setHasSearched(false);
    setError(null);
    setFiltersInternal({});
    setSearchType('keyword');
  }, []);

  // Set page and fetch results
  const handleSetPage = useCallback((newPage: number) => {
    setPage(newPage);
    if (query.trim()) {
      performSearch(query, newPage);
    }
  }, [query, performSearch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // State
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

    // Actions
    setQuery,
    setSearchType,
    setFilters,
    setPage: handleSetPage,
    search,
    clearSearch,
  };
}
