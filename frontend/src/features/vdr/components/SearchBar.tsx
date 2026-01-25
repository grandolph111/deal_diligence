import { useCallback, useRef, useEffect } from 'react';
import { Search, X, Loader } from 'lucide-react';

interface SearchBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onFocus?: () => void;
  loading?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Search input bar for VDR document search
 */
export function SearchBar({
  query,
  onQueryChange,
  onFocus,
  loading = false,
  placeholder = 'Search documents...',
  autoFocus = false,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Handle input change
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    onQueryChange(e.target.value);
  }, [onQueryChange]);

  // Handle clear button click
  const handleClear = useCallback(() => {
    onQueryChange('');
    inputRef.current?.focus();
  }, [onQueryChange]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && query) {
      e.preventDefault();
      onQueryChange('');
    }
  }, [query, onQueryChange]);

  // Auto-focus on mount if requested
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  return (
    <div className="search-bar">
      <div className="search-bar-wrapper">
        <span className="search-bar-icon">
          {loading ? (
            <Loader size={18} className="spinning" />
          ) : (
            <Search size={18} />
          )}
        </span>
        <input
          ref={inputRef}
          type="text"
          className="search-bar-input"
          value={query}
          onChange={handleChange}
          onFocus={onFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Search documents"
        />
        {query && (
          <button
            type="button"
            className="search-bar-clear"
            onClick={handleClear}
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
