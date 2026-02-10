import { FileText, ExternalLink } from 'lucide-react';
import type { Citation } from '../../../types/api';

interface CitationCardProps {
  citation: Citation;
  index: number;
  onDocumentClick?: (documentId: string) => void;
}

/**
 * Displays a single citation from an AI response
 */
export function CitationCard({ citation, index, onDocumentClick }: CitationCardProps) {
  const handleClick = () => {
    if (onDocumentClick) {
      onDocumentClick(citation.documentId);
    }
  };

  // Format relevance score as percentage
  const relevancePercent = Math.round(citation.relevanceScore * 100);

  return (
    <div
      className={`citation-card ${onDocumentClick ? 'clickable' : ''}`}
      onClick={handleClick}
      role={onDocumentClick ? 'button' : undefined}
      tabIndex={onDocumentClick ? 0 : undefined}
    >
      <div className="citation-header">
        <span className="citation-number">[{index + 1}]</span>
        <FileText size={14} className="citation-icon" />
        <span className="citation-filename" title={citation.filename}>
          {citation.filename}
        </span>
        {onDocumentClick && <ExternalLink size={12} className="citation-link-icon" />}
      </div>

      {citation.pageNumber && (
        <div className="citation-page">Page {citation.pageNumber}</div>
      )}

      <div className="citation-excerpt">
        "{citation.textExcerpt}"
      </div>

      <div className="citation-relevance">
        <div
          className="citation-relevance-bar"
          style={{ width: `${relevancePercent}%` }}
        />
        <span className="citation-relevance-text">{relevancePercent}% relevant</span>
      </div>
    </div>
  );
}
