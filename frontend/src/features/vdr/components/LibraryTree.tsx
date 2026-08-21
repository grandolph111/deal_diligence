import { Layers, FileStack, Inbox } from 'lucide-react';
import type { LibraryToc } from '../../../api/services/library.service';
import './library-tree.css';

/**
 * What the data room is currently scoped to. `null` = the whole deal.
 * Exactly one of riskCategoryId / unfiled is set.
 */
export interface LibrarySelection {
  riskCategoryId?: string;
  unfiled?: boolean;
}

interface LibraryTreeProps {
  toc: LibraryToc | null;
  loading: boolean;
  error: string | null;
  selection: LibrarySelection | null;
  onSelect: (selection: LibrarySelection | null) => void;
}

/**
 * Data-room navigation: risk categories as folders.
 *
 * Each document is placed in exactly one risk category — whichever it contributes
 * the most evidence to — so the counts partition the deal and a document
 * appears in one place. The other risk categories it touches are still reachable
 * from the document's own Connections panel.
 */
export function LibraryTree({ toc, loading, error, selection, onSelect }: LibraryTreeProps) {
  if (loading) {
    return (
      <div className="lib-tree lib-tree--placeholder">
        <div className="lib-tree__skeleton" />
        <div className="lib-tree__skeleton" />
        <div className="lib-tree__skeleton" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="lib-tree lib-tree--placeholder">
        <p className="lib-tree__error">{error}</p>
      </div>
    );
  }

  const isAllSelected = selection == null;
  const unfiledCount = toc?.unfiled.documentCount ?? 0;
  // Every risk category is listed, including the empty ones. An empty category
  // is the report's supplemental diligence request — hiding it would hide the
  // gap, which is the finding a diligence team most needs to see.
  const riskCategories = toc?.riskCategories ?? [];

  return (
    <nav className="lib-tree" aria-label="Deal risk categories">
      <button
        type="button"
        className={`lib-tree__row lib-tree__row--root${isAllSelected ? ' is-selected' : ''}`}
        onClick={() => onSelect(null)}
        aria-current={isAllSelected ? 'true' : undefined}
      >
        <FileStack size={15} aria-hidden="true" />
        <span className="lib-tree__title">All Documents</span>
        <span className="lib-tree__count">{toc?.totals.documents ?? 0}</span>
      </button>

      {/* Documents with no evidence belong to no riskCategory; without this bucket
          a failed extraction would simply vanish from the tree. */}
      {unfiledCount > 0 && (
        <button
          type="button"
          className={`lib-tree__row lib-tree__row--unfiled${selection?.unfiled ? ' is-selected' : ''}`}
          onClick={() => onSelect({ unfiled: true })}
          aria-current={selection?.unfiled ? 'true' : undefined}
        >
          <Inbox size={15} aria-hidden="true" />
          <span className="lib-tree__title">Not yet analyzed</span>
          <span className="lib-tree__count">{unfiledCount}</span>
        </button>
      )}

      <p className="lib-tree__heading">
        <Layers size={12} aria-hidden="true" />
        Risk categories
      </p>

      {riskCategories.length > 0 ? (
        <ul className="lib-tree__list">
          {riskCategories.map((ws) => {
            const isSelected = selection?.riskCategoryId === ws.id;
            return (
              <li key={ws.id}>
                <button
                  type="button"
                  className={`lib-tree__row lib-tree__row--ws-flat${isSelected ? ' is-selected' : ''}`}
                  onClick={() => onSelect({ riskCategoryId: ws.id })}
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <span className="lib-tree__title">{ws.title}</span>
                  <span className="lib-tree__count">{ws.documentCount}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="lib-tree__empty">RiskCategories fill in as documents are analyzed.</p>
      )}
    </nav>
  );
}
