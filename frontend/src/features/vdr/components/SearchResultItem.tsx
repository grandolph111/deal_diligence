import { useCallback } from 'react';
import { FileText, Folder, Calendar, Shield, AlertTriangle, ExternalLink, Sparkles, BarChart3 } from 'lucide-react';
import type { SearchResult, SearchSnippet, SearchType } from '../../../types/api';

interface SearchResultItemProps {
  result: SearchResult;
  searchType?: SearchType;
  onDocumentClick: (documentId: string, folderId: string | null) => void;
  onRequestAccess?: (documentId: string) => void;
  onFindSimilar?: (documentId: string) => void;
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Render snippet text with highlights
 */
function renderSnippetWithHighlights(snippet: SearchSnippet): React.ReactNode {
  const { text, highlights } = snippet;

  if (!highlights.length) {
    return text;
  }

  // Sort highlights by start position
  const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start);

  const parts: React.ReactNode[] = [];
  let lastEnd = 0;

  sortedHighlights.forEach((highlight, index) => {
    // Add text before highlight
    if (highlight.start > lastEnd) {
      parts.push(text.slice(lastEnd, highlight.start));
    }
    // Add highlighted text
    parts.push(
      <mark key={index} className="search-highlight">
        {text.slice(highlight.start, highlight.end)}
      </mark>
    );
    lastEnd = highlight.end;
  });

  // Add remaining text after last highlight
  if (lastEnd < text.length) {
    parts.push(text.slice(lastEnd));
  }

  return parts;
}

/**
 * Get risk level badge color class
 */
function getRiskClass(riskLevel: string | null): string {
  switch (riskLevel?.toLowerCase()) {
    case 'high':
      return 'risk-high';
    case 'medium':
      return 'risk-medium';
    case 'low':
      return 'risk-low';
    default:
      return '';
  }
}

/**
 * Format similarity/relevance score as percentage
 */
function formatScore(score: number): string {
  // Score is typically between 0 and 1, convert to percentage
  if (score <= 1) {
    return `${Math.round(score * 100)}%`;
  }
  // If score is already a percentage or larger, format accordingly
  return `${Math.round(score)}%`;
}

/**
 * Get score level class based on value
 */
function getScoreClass(score: number): string {
  const normalizedScore = score <= 1 ? score : score / 100;
  if (normalizedScore >= 0.8) return 'score-high';
  if (normalizedScore >= 0.5) return 'score-medium';
  return 'score-low';
}

/**
 * Get score label based on search type
 */
function getScoreLabel(searchType?: SearchType): string {
  switch (searchType) {
    case 'semantic':
      return 'Relevance';
    case 'hybrid':
      return 'Match Score';
    case 'keyword':
    default:
      return 'Match';
  }
}

/**
 * Search result item component
 */
export function SearchResultItem({
  result,
  searchType,
  onDocumentClick,
  onRequestAccess,
  onFindSimilar,
}: SearchResultItemProps) {
  const { document, score, snippets, matchedEntities, isRestricted } = result;

  // Handle document click
  const handleClick = useCallback(() => {
    if (isRestricted) {
      return;
    }
    onDocumentClick(document.id, document.folderId);
  }, [isRestricted, document.id, document.folderId, onDocumentClick]);

  // Handle request access
  const handleRequestAccess = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onRequestAccess?.(document.id);
  }, [document.id, onRequestAccess]);

  // Handle find similar
  const handleFindSimilar = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onFindSimilar?.(document.id);
  }, [document.id, onFindSimilar]);

  return (
    <article
      className={`search-result-item ${isRestricted ? 'restricted' : ''}`}
      onClick={handleClick}
      role={isRestricted ? undefined : 'button'}
      tabIndex={isRestricted ? undefined : 0}
      onKeyDown={isRestricted ? undefined : (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      {/* Header with document info */}
      <header className="search-result-header">
        <div className="search-result-icon">
          {isRestricted ? (
            <Shield size={20} />
          ) : (
            <FileText size={20} />
          )}
        </div>
        <div className="search-result-info">
          <h3 className="search-result-name">
            {document.name}
            {!isRestricted && <ExternalLink size={14} className="search-result-link-icon" />}
          </h3>
          <div className="search-result-meta">
            {document.folder && (
              <span className="search-result-folder">
                <Folder size={12} />
                {document.folder.name}
              </span>
            )}
            <span className="search-result-size">
              {formatFileSize(document.sizeBytes)}
            </span>
            <span className="search-result-date">
              <Calendar size={12} />
              {formatDate(document.createdAt)}
            </span>
          </div>
        </div>

        {/* Score and Badges */}
        <div className="search-result-badges">
          {/* Similarity/Relevance Score */}
          {(searchType === 'semantic' || searchType === 'hybrid') && score > 0 && (
            <span className={`search-result-score ${getScoreClass(score)}`} title={getScoreLabel(searchType)}>
              <BarChart3 size={12} />
              {formatScore(score)} {getScoreLabel(searchType)}
            </span>
          )}
          {document.documentType && (
            <span className="search-result-type-badge">
              {document.documentType}
            </span>
          )}
          {document.riskLevel && (
            <span className={`search-result-risk-badge ${getRiskClass(document.riskLevel)}`}>
              {document.riskLevel === 'high' && <AlertTriangle size={12} />}
              {document.riskLevel}
            </span>
          )}
        </div>
      </header>

      {/* Matched Entities */}
      {matchedEntities && matchedEntities.length > 0 && !isRestricted && (
        <div className="search-result-matched-entities">
          <span className="matched-entities-label">Matched entities:</span>
          {matchedEntities.slice(0, 5).map((entity, index) => (
            <span key={index} className="matched-entity-badge">
              {entity}
            </span>
          ))}
          {matchedEntities.length > 5 && (
            <span className="matched-entities-more">+{matchedEntities.length - 5} more</span>
          )}
        </div>
      )}

      {/* Snippets */}
      {snippets.length > 0 && !isRestricted && (
        <div className="search-result-snippets">
          {snippets.slice(0, 3).map((snippet, index) => (
            <div key={index} className="search-result-snippet">
              {snippet.pageNumber && (
                <span className="snippet-page">Page {snippet.pageNumber}</span>
              )}
              <p className="snippet-text">
                ...{renderSnippetWithHighlights(snippet)}...
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Find Similar button */}
      {!isRestricted && onFindSimilar && (
        <div className="search-result-actions">
          <button
            type="button"
            className="search-result-find-similar"
            onClick={handleFindSimilar}
            title="Find similar documents"
          >
            <Sparkles size={14} />
            Find Similar
          </button>
        </div>
      )}

      {/* Restricted overlay */}
      {isRestricted && (
        <div className="search-result-restricted">
          <p className="restricted-message">
            <Shield size={14} />
            This document is in a restricted folder
          </p>
          {onRequestAccess && (
            <button
              type="button"
              className="button small secondary"
              onClick={handleRequestAccess}
            >
              Request Access
            </button>
          )}
        </div>
      )}
    </article>
  );
}
