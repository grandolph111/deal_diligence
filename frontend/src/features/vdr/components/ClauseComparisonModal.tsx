import { useCallback, useEffect, useState } from 'react';
import { X, Scale } from 'lucide-react';
import { libraryService } from '../../../api/services/library.service';
import type { ClauseComparison } from '../../../api/services/library.service';
import './clause-comparison.css';

interface Props {
  projectId: string;
  clauseType: string | null;
  onClose: () => void;
  onOpenDocument?: (documentId: string) => void;
}

const clauseLabel = (t: string) =>
  t.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

type RiskFilter = 'ALL' | 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Every instance of one clause type across the deal, side by side.
 *
 * This answers the question a reviewer actually asks — "show me all 101
 * indemnification clauses and tell me which ones are outliers" — which no
 * document-at-a-time view can. The peer groups behind it were already built at
 * ingest; they simply had no way to be read. Ordered worst-risk first, because
 * the outlier is the entire point of looking.
 */
export function ClauseComparisonModal({ projectId, clauseType, onClose, onOpenDocument }: Props) {
  const [data, setData] = useState<ClauseComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [risk, setRisk] = useState<RiskFilter>('ALL');

  const load = useCallback(async () => {
    if (!clauseType) return;
    setLoading(true);
    setError(null);
    setRisk('ALL');
    try {
      setData(await libraryService.compareClause(projectId, clauseType));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load comparison');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, clauseType]);

  useEffect(() => {
    load();
  }, [load]);

  // Escape closes, matching the other modals.
  useEffect(() => {
    if (!clauseType) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [clauseType, onClose]);

  if (!clauseType) return null;

  const provisions =
    data?.provisions.filter((p) => risk === 'ALL' || (p.riskLevel ?? 'UNSCORED') === risk) ?? [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal clause-cmp" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Scale size={18} aria-hidden="true" /> {clauseLabel(clauseType)}
          </h3>
          <button className="button ghost sm" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {data && (
          <div className="clause-cmp__bar">
            <span className="clause-cmp__stat">
              <strong>{data.stats.total}</strong> clauses across{' '}
              <strong>{data.stats.documents}</strong> documents
            </span>
            <div className="clause-cmp__filters" role="group" aria-label="Filter by risk">
              {(['ALL', 'HIGH', 'MEDIUM', 'LOW'] as RiskFilter[]).map((r) => {
                const n =
                  r === 'ALL'
                    ? data.stats.total
                    : data.stats.byRisk[r as keyof typeof data.stats.byRisk];
                if (r !== 'ALL' && n === 0) return null;
                return (
                  <button
                    key={r}
                    type="button"
                    className={`clause-cmp__filter${risk === r ? ' is-active' : ''} is-${r.toLowerCase()}`}
                    onClick={() => setRisk(r)}
                    aria-pressed={risk === r}
                  >
                    {r === 'ALL' ? 'All' : r.charAt(0) + r.slice(1).toLowerCase()}
                    <span className="clause-cmp__filter-count">{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="modal-content clause-cmp__body">
          {loading && <p className="clause-cmp__state">Loading every version…</p>}
          {!loading && error && <p className="clause-cmp__state is-error">{error}</p>}
          {!loading && !error && provisions.length === 0 && (
            <p className="clause-cmp__state">No clauses match this filter.</p>
          )}

          {!loading &&
            !error &&
            provisions.map((p) => (
              <article key={p.id} className="clause-cmp__item">
                <header className="clause-cmp__item-head">
                  <span
                    className={`clause-cmp__risk is-${(p.riskLevel ?? 'unscored').toLowerCase()}`}
                  >
                    {p.riskLevel ?? '—'}
                  </span>
                  <button
                    type="button"
                    className="clause-cmp__doc"
                    onClick={() => p.documentId && onOpenDocument?.(p.documentId)}
                    disabled={!p.documentId || !onOpenDocument}
                    title={p.documentName}
                  >
                    {p.documentName}
                  </button>
                  {p.pageNumber != null && (
                    <span className="clause-cmp__page">p.{p.pageNumber}</span>
                  )}
                </header>
                <p className="clause-cmp__finding">{p.title}</p>
                {p.content && <blockquote className="clause-cmp__quote">{p.content}</blockquote>}
              </article>
            ))}
        </div>
      </div>
    </div>
  );
}
