import { X, FileText, Layers, Gauge, FolderOpen } from 'lucide-react';
import type { DealMapNode } from '../../../api/services/library.service';
import './deal-map-detail.css';

interface Props {
  node: DealMapNode;
  onClose: () => void;
  /** Open the document's extracted fact sheet. */
  onOpenFactSheet: (documentId: string, documentName: string) => void;
  /** Open the data room, scoped to this node. `null` = all documents. */
  onOpenDataRoom: (riskCategoryId: string | null) => void;
}

/**
 * What a node is, and the way into it.
 *
 * For a document that means the fact sheet — the readable artifact behind the
 * dot. A map you can only look at is a picture; the point is to get from a
 * node to the document it stands for in one click.
 */
export function DealMapDetail({ node, onClose, onOpenFactSheet, onOpenDataRoom }: Props) {
  return (
    <aside className="dmd">
      <div className="dmd__head">
        <span className="dmd__kind">
          {node.type === 'DOCUMENT' ? 'Document' : node.type === 'RISK_CATEGORY' ? 'Risk category' : 'Deal'}
        </span>
        <button className="dmd__close" onClick={onClose} aria-label="Close">
          <X size={15} />
        </button>
      </div>

      <h3 className="dmd__title">{node.label}</h3>

      {node.type === 'DOCUMENT' && (
        <>
          <dl className="dmd__facts">
            <div>
              <dt>
                <Gauge size={12} aria-hidden="true" /> Risk
              </dt>
              <dd>{node.riskScore != null ? `${node.riskScore}/10` : (node.riskLevel ?? '—')}</dd>
            </div>
            <div>
              <dt>
                <Layers size={12} aria-hidden="true" /> Questions answered
              </dt>
              <dd>{node.itemCount}</dd>
            </div>
            <div>
              <dt>Clauses extracted</dt>
              <dd>{node.evidenceCount}</dd>
            </div>
            {node.documentType && (
              <div>
                <dt>Type</dt>
                <dd>{node.documentType}</dd>
              </div>
            )}
          </dl>

          {node.analyzed ? (
            <button
              className="dmd__action"
              onClick={() => onOpenFactSheet(node.documentId, node.label)}
            >
              <FileText size={14} aria-hidden="true" /> Open fact sheet
            </button>
          ) : (
            <p className="dmd__note">
              Not analyzed yet — no fact sheet has been produced for this document.
            </p>
          )}
        </>
      )}

      {node.type === 'RISK_CATEGORY' && (
        <>
          <p className="dmd__note">
            {node.documentCount} document{node.documentCount === 1 ? '' : 's'}{' '}
            {node.documentCount === 1 ? 'sits' : 'sit'} primarily in this riskCategory.
          </p>
          {node.documentCount > 0 && (
            <button
              className="dmd__action dmd__action--spaced"
              onClick={() => onOpenDataRoom(node.riskCategoryId)}
            >
              <FolderOpen size={14} aria-hidden="true" /> Open in Data Room
            </button>
          )}
        </>
      )}

      {node.type === 'ROOT' && (
        <>
          <p className="dmd__note">{node.documentCount} documents across the deal.</p>
          <button
            className="dmd__action dmd__action--spaced"
            onClick={() => onOpenDataRoom(null)}
          >
            <FolderOpen size={14} aria-hidden="true" /> Open in Data Room
          </button>
        </>
      )}
    </aside>
  );
}
