import { Layers } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { libraryService } from '../../../api/services/library.service';
import type { TocWorkstream } from '../../../api/services/library.service';

interface RiskCategoryScopePickerProps {
  projectId: string;
  selectedWorkstreamIds: string[];
  onChange: (riskCategoryIds: string[]) => void;
  disabled?: boolean;
}

/**
 * Grant a member access to diligence risk categories.
 *
 * Scoping runs on risk categories rather than folders because that is the axis a
 * deal is actually divided along. A document supplies evidence to roughly eight
 * risk categories, so these grants overlap heavily — granting IP and Liability to
 * two different specialists gives them both most of the same contracts, each
 * seeing the clauses that bear on their own questions.
 */
export function RiskCategoryScopePicker({
  projectId,
  selectedWorkstreamIds,
  onChange,
  disabled = false,
}: RiskCategoryScopePickerProps) {
  const [riskCategories, setWorkstreams] = useState<TocWorkstream[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedSet = useMemo(
    () => new Set(selectedWorkstreamIds),
    [selectedWorkstreamIds]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!projectId) return;
      try {
        setLoading(true);
        const toc = await libraryService.getToc(projectId);
        if (!cancelled) setWorkstreams(toc.riskCategories);
      } catch {
        if (!cancelled) setError('Could not load the deal.s risk categories');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange([...next]);
  };

  if (loading) {
    return (
      <div className="folder-scope-empty">
        <Layers size={16} />
        <span>Loading risk categories…</span>
      </div>
    );
  }

  if (error || riskCategories.length === 0) {
    return (
      <div className="folder-scope-empty">
        <Layers size={16} />
        <span>{error ?? 'Risk categories populate as documents are analyzed.'}</span>
      </div>
    );
  }

  const anyGranted = selectedWorkstreamIds.length > 0;

  return (
    <div className="folder-scope-picker">
      <div className="folder-scope-header">
        <div>
          <span className="folder-scope-status">
            {anyGranted ? (
              <>
                Access granted to <strong>{selectedWorkstreamIds.length}</strong>{' '}
                {selectedWorkstreamIds.length === 1 ? 'riskCategory' : 'riskCategories'}
              </>
            ) : (
              <>No risk categories granted — user will see nothing</>
            )}
          </span>
          <span className="folder-scope-hint">
            {anyGranted
              ? 'This user sees every document with evidence in the checked risk categories, and only the boards fully inside them.'
              : 'Pick at least one risk category to grant access. Specialists only see what they are granted.'}
          </span>
        </div>
        {anyGranted && (
          <button
            type="button"
            className="button ghost sm"
            onClick={() => onChange([])}
            disabled={disabled}
          >
            Clear
          </button>
        )}
      </div>

      <div className="folder-scope-tree">
        {riskCategories.map((ws) => {
          const checked = selectedSet.has(ws.id);
          return (
            <label
              key={ws.id}
              className={`folder-scope-row${checked ? ' is-checked' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(ws.id)}
                disabled={disabled}
                style={{ width: 'auto' }}
              />
              <Layers size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>{ws.title}</span>
              <span
                style={{
                  color: 'var(--text-muted)',
                  fontSize: 'var(--text-xs)',
                  fontVariantNumeric: 'tabular-nums',
                  minWidth: 58,
                  textAlign: 'right',
                }}
              >
                {ws.documentCount} doc{ws.documentCount === 1 ? '' : 's'}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
