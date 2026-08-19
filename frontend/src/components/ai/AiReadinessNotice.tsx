import { Info, Loader2 } from 'lucide-react';
import type { ProjectReadiness } from '../../types/api';
import './ai-readiness.css';

interface AiReadinessNoticeProps {
  readiness: ProjectReadiness | null;
}

/**
 * Inline warning that an AI report has little or nothing to draw on yet.
 *
 * Unlike `AiReadinessGate` this does not block anything. A Kanban board is a
 * perfectly good task board without AI, and refusing to let someone write down
 * a task because the deal is still ingesting would be obstruction, not safety.
 * What matters is that nobody writes a prompt expecting a grounded answer and
 * silently receives one drawn from an empty deal.
 */
export function AiReadinessNotice({ readiness }: AiReadinessNoticeProps) {
  if (!readiness || readiness.state === 'READY' || readiness.state === 'NO_ACCESS') {
    return null;
  }

  const stillWorking =
    readiness.state === 'PROCESSING' || readiness.state === 'PARTIAL';

  return (
    <p className="ai-readiness-notice" role="status">
      {stillWorking ? (
        <Loader2 size={12} className="ai-readiness-spin" aria-hidden="true" />
      ) : (
        <Info size={12} aria-hidden="true" />
      )}
      <span>
        {readiness.state === 'EMPTY'
          ? 'No documents in this deal yet — an AI report would have nothing to cite. Upload documents first.'
          : readiness.state === 'FAILED'
            ? 'No documents processed successfully, so an AI report would have nothing to cite.'
            : `${readiness.complete} of ${readiness.total} documents read so far. A report run now will only cover those.`}
      </span>
    </p>
  );
}
