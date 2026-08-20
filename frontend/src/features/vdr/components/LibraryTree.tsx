import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, Layers, FileStack, Inbox, CircleAlert } from 'lucide-react';
import type { LibraryToc, TocWorkstream } from '../../../api/services/library.service';
import './library-tree.css';

/**
 * What the tree is currently scoped to. `null` = the whole deal.
 * Exactly one of workstreamId / itemId / unfiled is set.
 */
export interface LibrarySelection {
  workstreamId?: string;
  itemId?: string;
  unfiled?: boolean;
}

interface LibraryTreeProps {
  toc: LibraryToc | null;
  loading: boolean;
  error: string | null;
  selection: LibrarySelection | null;
  onSelect: (selection: LibrarySelection | null) => void;
}

/** Coverage status → the dot colour and its screen-reader label. */
const STATUS_META: Record<string, { className: string; label: string }> = {
  COVERED: { className: 'is-covered', label: 'Covered' },
  FLAGGED: { className: 'is-flagged', label: 'Flagged' },
  THIN: { className: 'is-thin', label: 'Thin evidence' },
  OPEN: { className: 'is-open', label: 'Open question' },
  NA: { className: 'is-na', label: 'Not applicable' },
};

const statusMeta = (status: string) => STATUS_META[status] ?? STATUS_META.OPEN;

function WorkstreamNode({
  workstream,
  expanded,
  onToggle,
  selection,
  onSelect,
}: {
  workstream: TocWorkstream;
  expanded: boolean;
  onToggle: (id: string) => void;
  selection: LibrarySelection | null;
  onSelect: (selection: LibrarySelection | null) => void;
}) {
  const isSelected = selection?.workstreamId === workstream.id && !selection?.itemId;
  const flagged = workstream.items.filter((i) => i.status === 'FLAGGED').length;

  return (
    <li className="lib-tree__group">
      <div className={`lib-tree__row lib-tree__row--ws${isSelected ? ' is-selected' : ''}`}>
        <button
          type="button"
          className="lib-tree__twisty"
          onClick={() => onToggle(workstream.id)}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${workstream.title}`}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          type="button"
          className="lib-tree__label"
          onClick={() => onSelect({ workstreamId: workstream.id })}
          aria-current={isSelected ? 'true' : undefined}
        >
          <span className="lib-tree__title">{workstream.title}</span>
          {flagged > 0 && (
            <span className="lib-tree__flag" title={`${flagged} flagged item${flagged === 1 ? '' : 's'}`}>
              <CircleAlert size={12} aria-hidden="true" />
              {flagged}
            </span>
          )}
          <span className="lib-tree__count">{workstream.documentCount}</span>
        </button>
      </div>

      {expanded && (
        <ul className="lib-tree__items">
          {workstream.items.map((item) => {
            const meta = statusMeta(item.status);
            const itemSelected = selection?.itemId === item.itemId;
            return (
              <li key={item.itemId}>
                <button
                  type="button"
                  className={`lib-tree__row lib-tree__row--item${itemSelected ? ' is-selected' : ''}`}
                  onClick={() => onSelect({ workstreamId: workstream.id, itemId: item.itemId })}
                  aria-current={itemSelected ? 'true' : undefined}
                >
                  <span
                    className={`lib-tree__status ${meta.className}`}
                    title={meta.label}
                    aria-hidden="true"
                  />
                  <span className="lib-tree__title">{item.title}</span>
                  <span className="sr-only">{meta.label}</span>
                  <span className="lib-tree__count">{item.documentCount}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

/**
 * Data-room navigation, built on the diligence checklist rather than folders.
 *
 * A document is reachable under every workstream it supplies evidence to — on
 * a real deal that is around eight of twelve — so the per-node counts add up to
 * far more than the document total. That is the intended reading: this is an
 * index into the deal, not a filing cabinet, and the same contract genuinely
 * answers questions in Corporate, IP and Liability at once.
 */
export function LibraryTree({ toc, loading, error, selection, onSelect }: LibraryTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

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

  return (
    <nav className="lib-tree" aria-label="Deal checklist">
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

      {/* Pinned above the checklist: documents with no evidence belong to no
          workstream, so without this bucket a failed extraction would simply
          vanish from the tree rather than announce itself. Hidden when empty. */}
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
        Workstreams
      </p>

      {toc && toc.workstreams.length > 0 ? (
        <ul className="lib-tree__list">
          {toc.workstreams.map((ws) => (
            <WorkstreamNode
              key={ws.id}
              workstream={ws}
              expanded={expandedIds.has(ws.id)}
              onToggle={toggle}
              selection={selection}
              onSelect={onSelect}
            />
          ))}
        </ul>
      ) : (
        <p className="lib-tree__empty">
          The checklist populates as documents are analyzed.
        </p>
      )}
    </nav>
  );
}
