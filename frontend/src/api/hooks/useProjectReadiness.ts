import { useCallback, useEffect, useRef, useState } from 'react';
import { readinessService } from '../services/readiness.service';
import type { ProjectReadiness } from '../../types/api';

/** How often to re-check while a deal is still ingesting. */
const POLL_MS = 10_000;

/**
 * Track whether a project's AI features can answer yet.
 *
 * Polls only while ingestion is actually in flight and stops once the deal is
 * settled — a finished deal has no reason to keep asking, and a deal that has
 * failed outright will not change on its own either. Both terminal states end
 * the timer rather than spinning forever.
 */
export function useProjectReadiness(projectId: string | undefined) {
  const [readiness, setReadiness] = useState<ProjectReadiness | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const refresh = useCallback(async () => {
    if (!projectId) return;
    try {
      const next = await readinessService.getReadiness(projectId);
      setReadiness(next);
      // Keep polling only while something is still moving.
      if (next.state === 'PROCESSING' || next.state === 'PARTIAL') {
        clear();
        timerRef.current = setTimeout(() => void refresh(), POLL_MS);
      }
    } catch {
      // A readiness check that fails must not block the feature it describes.
      // Leave the last known value and let the next interaction retry.
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!projectId) {
      setReadiness(null);
      return;
    }
    setLoading(true);
    void refresh();
    return clear;
  }, [projectId, refresh]);

  return { readiness, loading, refresh };
}
