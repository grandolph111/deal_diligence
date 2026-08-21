import { X, RefreshCw, ArrowRight } from 'lucide-react';
import type { LintFinding } from '../../../api/services/library.service';

const TYPE_COLOR: Record<string, string> = {
  GAP: '#64748b',
  THIN: '#d97706',
  RISK: '#e11d48',
  INCONSISTENCY: '#7c3aed',
  SUGGESTION: '#0f766e',
};

interface LibraryFindingsProps {
  findings: LintFinding[];
  loading: boolean;
  source: 'llm' | 'deterministic' | null;
  hasRun: boolean;
  onRun: () => void;
  onClose: () => void;
  onFindingClick: (riskCategoryId: string) => void;
}

export function LibraryFindings({
  findings,
  loading,
  source,
  hasRun,
  onRun,
  onClose,
  onFindingClick,
}: LibraryFindingsProps) {
  return (
    <aside className="lib-findings">
      <div className="lib-findings-header">
        <span className="lib-findings-title">Findings</span>
        <div className="lib-findings-header-actions">
          <button className="button secondary icon-only" onClick={onRun} disabled={loading} title="Re-run lint">
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
          <button className="lib-detail-close" onClick={onClose} title="Close" aria-label="Close">
            <X size={16} />
          </button>
        </div>
      </div>

      {source && !loading && (
        <p className="lib-findings-sub">
          {findings.length} finding{findings.length === 1 ? '' : 's'} ·{' '}
          {source === 'llm' ? 'AI gap analysis' : 'baseline checks'}
        </p>
      )}

      <div className="lib-findings-body">
        {loading && (
          <div className="lib-findings-empty">
            <div className="loading-spinner" />
            <p>Hunting for gaps…</p>
          </div>
        )}
        {!loading && hasRun && findings.length === 0 && (
          <div className="lib-findings-empty">
            <p>No findings — coverage looks complete.</p>
          </div>
        )}
        {!loading && !hasRun && (
          <div className="lib-findings-empty">
            <p>Scan the deal for diligence gaps, thin coverage, and risks to escalate.</p>
            <button className="button primary" onClick={onRun}>
              Run gap analysis
            </button>
          </div>
        )}
        {!loading &&
          findings.map((f, i) => {
            const clickable = !!f.riskCategoryId;
            return (
              <div
                key={i}
                className={`lib-finding${clickable ? ' clickable' : ''}`}
                onClick={clickable ? () => onFindingClick(f.riskCategoryId!) : undefined}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
              >
                <div className="lib-finding-top">
                  <span className="lib-finding-badge" style={{ background: TYPE_COLOR[f.type] ?? '#64748b' }}>
                    {f.type}
                  </span>
                  <span className={`lib-finding-sev sev-${f.severity.toLowerCase()}`}>{f.severity}</span>
                  {clickable && <ArrowRight size={13} className="lib-finding-arrow" />}
                </div>
                <p className="lib-finding-title">{f.title}</p>
                <p className="lib-finding-detail">{f.detail}</p>
                {f.suggestedAction && (
                  <p className="lib-finding-action">→ {f.suggestedAction}</p>
                )}
              </div>
            );
          })}
      </div>
    </aside>
  );
}
