import { useRef } from 'react';
import { FileStack, Inbox } from 'lucide-react';
import type { LibraryToc } from '../../../api/services/library.service';
import './workstream-tabs.css';

/**
 * What the data room is scoped to. `null` = the whole deal.
 * Exactly one of workstreamId / unfiled is set.
 */
export interface LibrarySelection {
  workstreamId?: string;
  unfiled?: boolean;
}

interface Props {
  toc: LibraryToc | null;
  loading: boolean;
  error: string | null;
  selection: LibrarySelection | null;
  onSelect: (selection: LibrarySelection | null) => void;
}

/**
 * Workstreams as tabs across the top of the data room.
 *
 * Each document is placed in exactly one workstream, so these are genuine
 * partitions of the deal rather than overlapping filters — which is what makes
 * tabs the honest control. It also returns the full width to the document
 * table, which a sidebar was pushing its last columns off-screen.
 */
export function WorkstreamTabs({ toc, loading, error, selection, onSelect }: Props) {
  const stripRef = useRef<HTMLDivElement>(null);

  if (loading) {
    return (
      <div className="ws-tabs ws-tabs--placeholder">
        <span className="ws-tabs__skeleton" />
        <span className="ws-tabs__skeleton" />
        <span className="ws-tabs__skeleton" />
      </div>
    );
  }

  if (error) {
    return <div className="ws-tabs ws-tabs--placeholder">{error}</div>;
  }

  const isAll = selection == null;
  const unfiled = toc?.unfiled.documentCount ?? 0;
  const workstreams = (toc?.workstreams ?? []).filter((w) => w.documentCount > 0);

  return (
    <div className="ws-tabs" ref={stripRef} role="tablist" aria-label="Workstreams">
      <button
        type="button"
        role="tab"
        aria-selected={isAll}
        className={`ws-tab${isAll ? ' is-active' : ''}`}
        onClick={() => onSelect(null)}
      >
        <FileStack size={14} aria-hidden="true" />
        <span className="ws-tab__label">All Documents</span>
        <span className="ws-tab__count">{toc?.totals.documents ?? 0}</span>
      </button>

      {workstreams.map((ws) => {
        const active = selection?.workstreamId === ws.id;
        return (
          <button
            key={ws.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={`ws-tab${active ? ' is-active' : ''}`}
            onClick={() => onSelect({ workstreamId: ws.id })}
            title={ws.title}
          >
            <span className="ws-tab__label">{ws.title}</span>
            <span className="ws-tab__count">{ws.documentCount}</span>
          </button>
        );
      })}

      {/* Documents with no evidence belong to no workstream; without this tab a
          failed extraction would have nowhere to appear. */}
      {unfiled > 0 && (
        <button
          type="button"
          role="tab"
          aria-selected={!!selection?.unfiled}
          className={`ws-tab ws-tab--unfiled${selection?.unfiled ? ' is-active' : ''}`}
          onClick={() => onSelect({ unfiled: true })}
        >
          <Inbox size={14} aria-hidden="true" />
          <span className="ws-tab__label">Not yet analyzed</span>
          <span className="ws-tab__count">{unfiled}</span>
        </button>
      )}
    </div>
  );
}
