import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, FileText, Layers, Scale, StickyNote, Tag } from 'lucide-react';
import { libraryService } from '../../../api/services/library.service';
import type { DocumentBacklinks } from '../../../api/services/library.service';
import { ScrollList } from '../../../components/ScrollList';
import './backlinks.css';

interface Props {
  projectId: string;
  documentId: string;
  onCompareClause?: (clauseType: string) => void;
  onOpenDocument?: (documentId: string) => void;
}

const clauseLabel = (t: string) =>
  t.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/**
 * "What else in this deal touches this document."
 *
 * The library computes ~17k edges per deal at ingest and, before this panel,
 * surfaced none of them as backlinks — you could see a document but not what it
 * connected to. The connections are the point: one contract answers ~14
 * diligence questions and shares clause language with dozens of peers, and none
 * of that is visible from the document itself.
 */
export function DocumentBacklinksPanel({
  projectId,
  documentId,
  onCompareClause,
  onOpenDocument,
}: Props) {
  const [data, setData] = useState<DocumentBacklinks | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await libraryService.getDocumentBacklinks(projectId, documentId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connections');
    } finally {
      setLoading(false);
    }
  }, [projectId, documentId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <div className="backlinks__state">Loading connections…</div>;
  if (error) return <div className="backlinks__state backlinks__state--error">{error}</div>;
  if (!data) return null;

  const { checklistItems, clauseTypes, relatedDocuments, entities, notes } = data;
  const nothing =
    checklistItems.length === 0 && clauseTypes.length === 0 && relatedDocuments.length === 0;

  if (nothing) {
    return (
      <div className="backlinks__state">
        No connections yet — this document has no extracted evidence, so nothing links to it.
      </div>
    );
  }

  return (
    <div className="backlinks">
      {checklistItems.length > 0 && (
        <section className="backlinks__section">
          <h4 className="backlinks__heading">
            <Layers size={13} aria-hidden="true" />
            Answers {checklistItems.length} diligence question
            {checklistItems.length === 1 ? '' : 's'}
          </h4>
          <ScrollList total={checklistItems.length} cap={8} rowHeight={44} noun="question">
            <ul className="backlinks__list">
              {checklistItems.map((i) => (
                <li key={i.itemId} className="backlinks__row">
                  <span className={`backlinks__dot is-${i.status.toLowerCase()}`} aria-hidden="true" />
                  <span className="backlinks__row-main">
                    <span className="backlinks__row-title">{i.title}</span>
                    <span className="backlinks__row-sub">{i.workstreamTitle}</span>
                  </span>
                  {i.highRiskCount > 0 && (
                    <span
                      className="backlinks__flag"
                      title={`${i.highRiskCount} high-risk clause${i.highRiskCount === 1 ? '' : 's'}`}
                    >
                      <CircleAlert size={11} aria-hidden="true" />
                      {i.highRiskCount}
                    </span>
                  )}
                  <span className="backlinks__count">{i.evidenceCount}</span>
                </li>
              ))}
            </ul>
          </ScrollList>
        </section>
      )}

      {clauseTypes.length > 0 && (
        <section className="backlinks__section">
          <h4 className="backlinks__heading">
            <Scale size={13} aria-hidden="true" />
            Compare against the rest of the deal
          </h4>
          <p className="backlinks__hint">
            Each clause here also appears in other contracts — open one to see every version side
            by side, worst-risk first.
          </p>
          <div className="backlinks__chips">
            {clauseTypes.map((c) => (
              <button
                key={c.clauseType}
                type="button"
                className="backlinks__chip"
                onClick={() => onCompareClause?.(c.clauseType)}
                disabled={!onCompareClause || c.peerDocumentCount === 0}
                title={
                  c.peerDocumentCount === 0
                    ? 'Only this document has this clause'
                    : `Compare with ${c.peerDocumentCount} other document${c.peerDocumentCount === 1 ? '' : 's'}`
                }
              >
                <Tag size={11} aria-hidden="true" />
                {clauseLabel(c.clauseType)}
                <span className="backlinks__chip-count">{c.peerDocumentCount}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {relatedDocuments.length > 0 && (
        <section className="backlinks__section">
          <h4 className="backlinks__heading">
            <FileText size={13} aria-hidden="true" />
            Most similar documents
          </h4>
          <ScrollList total={relatedDocuments.length} cap={6} rowHeight={44} noun="document">
            <ul className="backlinks__list">
              {relatedDocuments.map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    className="backlinks__row backlinks__row--button"
                    onClick={() => onOpenDocument?.(d.id)}
                    disabled={!onOpenDocument}
                  >
                    <span className="backlinks__row-main">
                      <span className="backlinks__row-title">{d.name}</span>
                      <span className="backlinks__row-sub">
                        {d.sharedClauseTypes.length} shared clause type
                        {d.sharedClauseTypes.length === 1 ? '' : 's'}
                      </span>
                    </span>
                    {d.riskScore != null && (
                      <span className="backlinks__count">{d.riskScore}/10</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </ScrollList>
        </section>
      )}

      {notes.length > 0 && (
        <section className="backlinks__section">
          <h4 className="backlinks__heading">
            <StickyNote size={13} aria-hidden="true" />
            Filed notes
          </h4>
          <ul className="backlinks__list">
            {notes.map((n) => (
              <li key={n.id} className="backlinks__row">
                <span className="backlinks__row-main">
                  <span className="backlinks__row-title">{n.title}</span>
                  <span className="backlinks__row-sub">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {entities.length > 0 && (
        <section className="backlinks__section">
          <h4 className="backlinks__heading">Parties &amp; entities named</h4>
          <div className="backlinks__chips">
            {entities.map((e) => (
              <span key={e.id} className="backlinks__chip is-static" title={`${e.mentionCount} mentions`}>
                {e.title}
                <span className="backlinks__chip-count">{e.mentionCount}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
