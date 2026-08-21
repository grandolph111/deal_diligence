import { useCallback, useEffect, useState } from 'react';
import { libraryService } from '../../../api/services/library.service';
import type { LibraryToc } from '../../../api/services/library.service';

interface UseLibraryTocOptions {
  projectId: string;
  autoFetch?: boolean;
}

interface UseLibraryTocReturn {
  toc: LibraryToc | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Loads the risk categories that drive data-room navigation.
 *
 * Counts move as extraction lands, so this is refreshed alongside the document
 * list rather than cached for the session.
 */
export function useLibraryToc({
  projectId,
  autoFetch = true,
}: UseLibraryTocOptions): UseLibraryTocReturn {
  const [toc, setToc] = useState<LibraryToc | null>(null);
  const [loading, setLoading] = useState(autoFetch);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      setToc(await libraryService.getToc(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the deal.s risk categories');
      setToc(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (autoFetch) refresh();
  }, [autoFetch, refresh]);

  return { toc, loading, error, refresh };
}
