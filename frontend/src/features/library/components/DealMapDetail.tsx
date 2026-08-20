import { X, FileText, Layers, Gauge } from 'lucide-react';
import type { DealMapNode } from '../../../api/services/library.service';
import './deal-map-detail.css';

interface Props {
  node: DealMapNode;
  onClose: () => void;
  /** Open the document's extracted fact sheet. */
  onOpenFactSheet: (documentId: string, documentName: string) => void;
}

/**
 * What a node is, and the way into it.
 *
 * For a document that means the fact sheet — the readable artifact behind the
 * dot. A map you can only look at is a picture; the point is to get from a
 * node to the document it stands for in one click.
 */
export function DealMapDetail({ node, onClose, onOpenFactSheet }: Props) {
  return (
    <aside className="dmd">
      <div className="dmd__head">
        <span className="dmd__kind">
          {node.type === 'DOCUMENT' ? 'Document' : node.type === 'WORKSTREAM' ? 'Workstream' : 'Deal'}
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

      {node.type === 'WORKSTREAM' && (
        <p className="dmd__note">
          {node.documentCount} document{node.documentCount === 1 ? '' : 's'} sit primarily in this
          workstream.
        </p>
      )}

      {node.type === 'ROOT' && (
        <p className="dmd__note">{node.documentCount} documents across the deal.</p>
      )}
    </aside>
  );
}
