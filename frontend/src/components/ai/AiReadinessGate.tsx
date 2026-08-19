import type { ReactNode } from 'react';
import { FileUp, Loader2, AlertTriangle, Lock } from 'lucide-react';
import type { ProjectReadiness } from '../../types/api';
import './ai-readiness.css';

interface AiReadinessGateProps {
  readiness: ProjectReadiness | null;
  /** Called when the user acts on an empty deal — usually "go to the data room". */
  onUploadClick?: () => void;
  /** The AI feature to render once the deal can answer. */
  children: ReactNode;
  /** Shown above `children` while ingestion is still running. */
  partialNotice?: boolean;
}

/**
 * Gates an AI feature behind having actually read the deal.
 *
 * Chat and Kanban reports answer from the knowledge library, which extraction
 * builds. Before the first document finishes there is nothing to answer from,
 * and the honest response is to say so rather than to quietly answer from
 * whatever happens to be available — a confident answer over a half-read deal
 * is worse than no answer, because nothing in it signals what was missed.
 *
 * The states are deliberately distinguished by whether waiting will help.
 * PROCESSING resolves itself; FAILED and NO_ACCESS do not, and must never
 * render as a spinner the user waits on forever.
 */
export function AiReadinessGate({
  readiness,
  onUploadClick,
  children,
  partialNotice = true,
}: AiReadinessGateProps) {
  // Unknown readiness (first load, or the check itself failed) — never block on
  // a diagnostic. Showing the feature is the safer default.
  if (!readiness || readiness.ready) {
    return (
      <>
        {readiness?.partial && partialNotice ? (
          <div className="ai-readiness-banner" role="status">
            <Loader2 size={14} className="ai-readiness-spin" aria-hidden="true" />
            <span>
              <strong>
                {readiness.complete} of {readiness.total}
              </strong>{' '}
              documents read. Answers cover what has been processed so far.
            </span>
          </div>
        ) : null}
        {children}
      </>
    );
  }

  const progress =
    readiness.total > 0
      ? Math.round((readiness.complete / readiness.total) * 100)
      : 0;

  const presentation: Record<
    string,
    { icon: ReactNode; title: string; tone: string }
  > = {
    EMPTY: {
      icon: <FileUp size={28} aria-hidden="true" />,
      title: 'Upload documents to get started',
      tone: 'neutral',
    },
    PROCESSING: {
      icon: <Loader2 size={28} className="ai-readiness-spin" aria-hidden="true" />,
      title: 'Reading your documents',
      tone: 'neutral',
    },
    FAILED: {
      icon: <AlertTriangle size={28} aria-hidden="true" />,
      title: 'No documents could be processed',
      tone: 'error',
    },
    NO_ACCESS: {
      icon: <Lock size={28} aria-hidden="true" />,
      title: 'No folders shared with you',
      tone: 'neutral',
    },
  };

  const view = presentation[readiness.state] ?? presentation.PROCESSING;

  return (
    <div
      className={`ai-readiness-gate ai-readiness-gate--${view.tone}`}
      role="status"
      aria-live="polite"
    >
      <div className="ai-readiness-icon">{view.icon}</div>
      <h3 className="ai-readiness-title">{view.title}</h3>
      <p className="ai-readiness-message">{readiness.message}</p>

      {readiness.state === 'EMPTY' && onUploadClick ? (
        <button
          type="button"
          className="button primary ai-readiness-action"
          onClick={onUploadClick}
        >
          Go to the data room
        </button>
      ) : null}

      {readiness.state === 'PROCESSING' && readiness.total > 0 ? (
        <div className="ai-readiness-progress">
          <div
            className="ai-readiness-progress-track"
            role="progressbar"
            aria-valuenow={readiness.complete}
            aria-valuemin={0}
            aria-valuemax={readiness.total}
            aria-label="Documents processed"
          >
            <div
              className="ai-readiness-progress-fill"
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>
          <span className="ai-readiness-progress-label">
            {readiness.complete} of {readiness.total} processed
            {readiness.failed > 0 ? ` · ${readiness.failed} failed` : ''}
          </span>
        </div>
      ) : null}
    </div>
  );
}
