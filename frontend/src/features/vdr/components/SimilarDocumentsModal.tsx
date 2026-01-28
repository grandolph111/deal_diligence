import { useState, useEffect, useCallback } from 'react';
import { X, FileText, Folder, Sparkles, ExternalLink, Loader } from 'lucide-react';
import { searchService } from '../../../api';
import type { Document, SimilarDocument } from '../../../types/api';

interface SimilarDocumentsModalProps {
  document: Document;
  projectId: string;
  onClose: () => void;
  onDocumentClick: (documentId: string, folderId: string | null) => void;
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
 * Format similarity score as percentage
 */
function formatSimilarityScore(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * Get similarity level class
 */
function getSimilarityClass(score: number): string {
  if (score >= 0.8) return 'similarity-high';
  if (score >= 0.5) return 'similarity-medium';
  return 'similarity-low';
}

/**
 * Modal to display similar documents based on semantic search
 */
export function SimilarDocumentsModal({
  document,
  projectId,
  onClose,
  onDocumentClick,
}: SimilarDocumentsModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [similarDocuments, setSimilarDocuments] = useState<SimilarDocument[]>([]);

  // Fetch similar documents on mount
  useEffect(() => {
    const fetchSimilarDocuments = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await searchService.findSimilar(projectId, document.id, { limit: 10 });
        setSimilarDocuments(response.similarDocuments);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to find similar documents');
      } finally {
        setLoading(false);
      }
    };

    fetchSimilarDocuments();
  }, [projectId, document.id]);

  // Handle document click
  const handleDocumentClick = useCallback((doc: SimilarDocument) => {
    onDocumentClick(doc.document.id, doc.document.folderId);
    onClose();
  }, [onDocumentClick, onClose]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  return (
    <div
      className="similar-documents-modal-overlay"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="similar-documents-title"
    >
      <div
        className="similar-documents-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="similar-documents-header">
          <div className="similar-documents-title-section">
            <Sparkles size={20} className="similar-documents-icon" />
            <div>
              <h2 id="similar-documents-title">Similar Documents</h2>
              <p className="similar-documents-subtitle">
                Documents similar to &quot;{document.name}&quot;
              </p>
            </div>
          </div>
          <button
            className="similar-documents-close"
            onClick={onClose}
            title="Close"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </header>

        {/* Content */}
        <div className="similar-documents-content">
          {loading ? (
            <div className="similar-documents-loading">
              <Loader size={24} className="spinning" />
              <p>Finding similar documents...</p>
            </div>
          ) : error ? (
            <div className="similar-documents-error">
              <p>{error}</p>
              <button className="button secondary" onClick={onClose}>
                Close
              </button>
            </div>
          ) : similarDocuments.length === 0 ? (
            <div className="similar-documents-empty">
              <FileText size={48} />
              <h3>No similar documents found</h3>
              <p>Try uploading more documents to find similarities.</p>
            </div>
          ) : (
            <ul className="similar-documents-list">
              {similarDocuments.map((similar) => (
                <li key={similar.document.id}>
                  <button
                    className="similar-document-item"
                    onClick={() => handleDocumentClick(similar)}
                    type="button"
                  >
                    <div className="similar-document-icon">
                      <FileText size={20} />
                    </div>
                    <div className="similar-document-info">
                      <h4 className="similar-document-name">
                        {similar.document.name}
                        <ExternalLink size={12} className="similar-document-link" />
                      </h4>
                      <div className="similar-document-meta">
                        {similar.document.folder && (
                          <span className="similar-document-folder">
                            <Folder size={12} />
                            {similar.document.folder.name}
                          </span>
                        )}
                        <span className="similar-document-size">
                          {formatFileSize(similar.document.sizeBytes)}
                        </span>
                        {similar.document.documentType && (
                          <span className="similar-document-type">
                            {similar.document.documentType}
                          </span>
                        )}
                      </div>
                      {similar.sharedEntities && similar.sharedEntities.length > 0 && (
                        <div className="similar-document-entities">
                          <span className="shared-entities-label">Shared entities:</span>
                          {similar.sharedEntities.slice(0, 3).map((entity, idx) => (
                            <span key={idx} className="shared-entity-badge">
                              {entity}
                            </span>
                          ))}
                          {similar.sharedEntities.length > 3 && (
                            <span className="shared-entities-more">
                              +{similar.sharedEntities.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className={`similar-document-score ${getSimilarityClass(similar.similarityScore)}`}>
                      <span className="score-value">{formatSimilarityScore(similar.similarityScore)}</span>
                      <span className="score-label">Match</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <footer className="similar-documents-footer">
          <p className="similar-documents-hint">
            Similarity is based on semantic analysis of document content using AI.
          </p>
        </footer>
      </div>
    </div>
  );
}
