import { useEffect, useState } from 'react';
import { X, FileText, Loader, Download, Waypoints } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { documentsService } from '../../../api/services/documents.service';
import { DocumentBacklinksPanel } from './DocumentBacklinksPanel';
import './factsheet-tabs.css';

interface FactSheetModalProps {
  isOpen: boolean;
  projectId: string;
  documentId: string | null;
  documentName: string | null;
  onClose: () => void;
  /** Open the peer comparison for a clause type. */
  onCompareClause?: (clauseType: string) => void;
  /** Jump to another document's fact sheet. */
  onOpenDocument?: (documentId: string) => void;
}

export function FactSheetModal({
  isOpen,
  projectId,
  documentId,
  documentName,
  onCompareClause,
  onOpenDocument,
  onClose,
}: FactSheetModalProps) {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'sheet' | 'links'>('sheet');

  useEffect(() => {
    if (!isOpen || !documentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMarkdown(null);
    documentsService
      .getFactSheet(projectId, documentId)
      .then((md) => {
        if (!cancelled) setMarkdown(md);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load extraction');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId, documentId]);

  const handleDownload = () => {
    if (!markdown) return;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentName || 'fact-sheet'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '860px', width: '92%', padding: 0 }}
      >
        <div
          className="modal-header"
          style={{
            padding: 'var(--space-5) var(--space-6)',
            borderBottom: '1px solid var(--border-primary)',
            marginBottom: 0,
          }}
        >
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', margin: 0 }}>
            <FileText size={20} />
            <span>{documentName || 'Document'}</span>
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
            {markdown && tab === 'sheet' && (
              <button
                className="button ghost sm"
                onClick={handleDownload}
                title="Download markdown"
              >
                <Download size={14} /> Download
              </button>
            )}
            <button className="icon-button" onClick={onClose} title="Close">
              <X size={20} />
            </button>
          </div>
        </div>

        <div
          className="factsheet-tabs"
          role="tablist"
          aria-label="Document views"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'sheet'}
            className={`factsheet-tab${tab === 'sheet' ? ' is-active' : ''}`}
            onClick={() => setTab('sheet')}
          >
            <FileText size={14} aria-hidden="true" /> Fact sheet
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'links'}
            className={`factsheet-tab${tab === 'links' ? ' is-active' : ''}`}
            onClick={() => setTab('links')}
          >
            <Waypoints size={14} aria-hidden="true" /> Connections
          </button>
        </div>

        <div
          style={{
            padding: 'var(--space-5) var(--space-6)',
            maxHeight: 'calc(90vh - 140px)',
            overflowY: 'auto',
          }}
        >
          {tab === 'links' && documentId && (
            <DocumentBacklinksPanel
              projectId={projectId}
              documentId={documentId}
              onCompareClause={onCompareClause}
              onOpenDocument={onOpenDocument}
            />
          )}
          {tab === 'sheet' && (
          <>
          {loading && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                color: 'var(--text-muted)',
              }}
            >
              <Loader size={16} className="spinning" /> Loading extraction…
            </div>
          )}
          {error && (
            <div className="modal-error" style={{ margin: 0 }}>
              {error}
            </div>
          )}
          {markdown && (
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}
