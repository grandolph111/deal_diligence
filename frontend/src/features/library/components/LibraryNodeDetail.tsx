import { X, ChevronDown, ChevronRight } from 'lucide-react';
import type { LibraryGraphNode } from '../../../api/services/library.service';
import { STATUS_COLOR } from './LibraryGraph';

const TYPE_LABEL: Record<string, string> = {
  RISK_CATEGORY: 'Risk category',
  PROVISION: 'Provision',
  RISK: 'Risk',
  OBLIGATION: 'Obligation',
  ENTITY: 'Entity',
  SOURCE: 'Source document',
};

const titleCase = (s: string): string =>
  s.toLowerCase().replace(/(^|[\s_])\w/g, (c) => c.toUpperCase()).replace(/_/g, ' ');

interface LibraryNodeDetailProps {
  node: LibraryGraphNode;
  expanded: boolean;
  expanding: boolean;
  error?: string | null;
  onClose: () => void;
  onToggleExpand: (riskCategoryId: string) => void;
}

export function LibraryNodeDetail({
  node,
  expanded,
  expanding,
  error,
  onClose,
  onToggleExpand,
}: LibraryNodeDetailProps) {
  const isItem = node.type === 'RISK_CATEGORY';
  const status = node.status ?? 'OPEN';

  return (
    <aside className="lib-detail">
      <div className="lib-detail-header">
        <span className="lib-detail-type">{TYPE_LABEL[node.type] ?? node.type}</span>
        <button className="lib-detail-close" onClick={onClose} title="Close" aria-label="Close">
          <X size={16} />
        </button>
      </div>

      <h3 className="lib-detail-title">{node.label}</h3>

      {isItem && (
        <>
          <div className="lib-detail-row">
            <span className="lib-detail-key">Coverage</span>
            <span className="lib-status-pill" style={{ background: STATUS_COLOR[status] }}>
              {titleCase(status)}
            </span>
          </div>
          <div className="lib-detail-row">
            <span className="lib-detail-key">Evidence</span>
            <span className="lib-detail-val">
              {node.evidenceCount ?? 0} node{(node.evidenceCount ?? 0) === 1 ? '' : 's'}
            </span>
          </div>
          {(node.evidenceCount ?? 0) > 0 ? (
            <>
              <button
                className="button secondary lib-expand-btn"
                onClick={() => onToggleExpand(node.riskCategoryId ?? '')}
                disabled={expanding}
              >
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {expanding ? 'Loading…' : expanded ? 'Collapse evidence' : 'Expand evidence'}
              </button>
              {error && <p className="lib-detail-error">{error}</p>}
            </>
          ) : (
            <p className="lib-detail-hint">
              No evidence found yet — this is an open diligence question.
            </p>
          )}
        </>
      )}

      {(node.type === 'PROVISION' || node.type === 'RISK' || node.type === 'OBLIGATION') && (
        <>
          {node.clauseType && (
            <div className="lib-detail-row">
              <span className="lib-detail-key">Clause</span>
              <span className="lib-detail-val">{titleCase(node.clauseType)}</span>
            </div>
          )}
          {node.riskLevel && (
            <div className="lib-detail-row">
              <span className="lib-detail-key">Risk</span>
              <span className="lib-detail-val">{titleCase(node.riskLevel)}</span>
            </div>
          )}
          {node.page != null && (
            <div className="lib-detail-row">
              <span className="lib-detail-key">Page</span>
              <span className="lib-detail-val">p.{node.page}</span>
            </div>
          )}
        </>
      )}

      {node.type === 'SOURCE' && (
        <p className="lib-detail-hint">A source document. Its provisions link out to the risk categories they belong to.</p>
      )}
      {node.type === 'ENTITY' && (
        <p className="lib-detail-hint">A canonical entity referenced across the deal's documents.</p>
      )}
    </aside>
  );
}
