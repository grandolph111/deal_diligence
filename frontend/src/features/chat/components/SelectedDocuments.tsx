import { X, FileText } from 'lucide-react';

interface SelectedDocument {
  id: string;
  name: string;
}

interface SelectedDocumentsProps {
  documents: SelectedDocument[];
  onRemove: (docId: string) => void;
  onClear: () => void;
}

/**
 * Displays selected documents as chips/tags
 */
export function SelectedDocuments({
  documents,
  onRemove,
  onClear,
}: SelectedDocumentsProps) {
  if (documents.length === 0) {
    return null;
  }

  return (
    <div className="selected-documents">
      <div className="selected-documents-header">
        <span className="selected-documents-label">
          <FileText size={14} />
          Focusing on {documents.length} document{documents.length !== 1 ? 's' : ''}
        </span>
        <button
          type="button"
          className="selected-documents-clear"
          onClick={onClear}
          title="Clear all"
        >
          Clear all
        </button>
      </div>
      <div className="selected-documents-list">
        {documents.map((doc) => (
          <div key={doc.id} className="selected-document-chip">
            <span className="selected-document-name" title={doc.name}>
              {doc.name}
            </span>
            <button
              type="button"
              className="selected-document-remove"
              onClick={() => onRemove(doc.id)}
              title="Remove"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
