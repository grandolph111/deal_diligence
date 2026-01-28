import { useState, useEffect, useCallback } from 'react';
import { clausesService } from '../../../api/services/clauses.service';
import type { DocumentClause, ClauseType, RiskLevel, ClauseStats } from '../../../types/api';

interface UseClausesOptions {
  projectId: string;
  documentId: string;
  autoFetch?: boolean;
}

interface UseClausesReturn {
  clauses: DocumentClause[];
  stats: ClauseStats | null;
  loading: boolean;
  error: string | null;
  selectedClause: DocumentClause | null;
  highlightEnabled: boolean;
  highlightedTypes: Set<ClauseType>;
  filters: {
    clauseType?: ClauseType;
    riskLevel?: RiskLevel;
    isRiskFlagged?: boolean;
    isVerified?: boolean;
  };
  // Actions
  fetchClauses: () => Promise<void>;
  fetchStats: () => Promise<void>;
  selectClause: (clause: DocumentClause | null) => void;
  toggleHighlight: () => void;
  toggleTypeHighlight: (type: ClauseType) => void;
  setFilters: (filters: UseClausesReturn['filters']) => void;
  verifyClause: (clauseId: string, note?: string) => Promise<void>;
  rejectClause: (clauseId: string, note?: string) => Promise<void>;
  detectClauses: () => Promise<void>;
}

/**
 * Hook for managing clauses in document viewer
 */
export function useClauses({
  projectId,
  documentId,
  autoFetch = true,
}: UseClausesOptions): UseClausesReturn {
  const [clauses, setClauses] = useState<DocumentClause[]>([]);
  const [stats, setStats] = useState<ClauseStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClause, setSelectedClause] = useState<DocumentClause | null>(null);
  const [highlightEnabled, setHighlightEnabled] = useState(false);
  const [highlightedTypes, setHighlightedTypes] = useState<Set<ClauseType>>(new Set());
  const [filters, setFilters] = useState<UseClausesReturn['filters']>({});

  // Fetch clauses from API
  const fetchClauses = useCallback(async () => {
    if (!projectId || !documentId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await clausesService.getDocumentClauses(
        projectId,
        documentId,
        {
          ...filters,
          limit: 100, // Get all clauses for a document
        }
      );
      setClauses(response.clauses);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch clauses';
      setError(message);
      setClauses([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, documentId, filters]);

  // Fetch clause statistics
  const fetchStats = useCallback(async () => {
    if (!projectId || !documentId) return;

    try {
      const stats = await clausesService.getDocumentClauseStats(projectId, documentId);
      setStats(stats);
    } catch {
      // Stats are optional, don't set error
    }
  }, [projectId, documentId]);

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (autoFetch) {
      fetchClauses();
      fetchStats();
    }
  }, [autoFetch, fetchClauses, fetchStats]);

  // Select a clause
  const selectClause = useCallback((clause: DocumentClause | null) => {
    setSelectedClause(clause);
  }, []);

  // Toggle highlighting
  const toggleHighlight = useCallback(() => {
    setHighlightEnabled((prev) => !prev);
  }, []);

  // Toggle highlighting for a specific clause type
  const toggleTypeHighlight = useCallback((type: ClauseType) => {
    setHighlightedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Verify a clause
  const verifyClause = useCallback(
    async (clauseId: string, note?: string) => {
      try {
        const updated = await clausesService.verifyClause(
          projectId,
          documentId,
          clauseId,
          note
        );
        setClauses((prev) =>
          prev.map((c) => (c.id === clauseId ? updated : c))
        );
        if (selectedClause?.id === clauseId) {
          setSelectedClause(updated);
        }
      } catch (err) {
        throw err;
      }
    },
    [projectId, documentId, selectedClause]
  );

  // Reject a clause
  const rejectClause = useCallback(
    async (clauseId: string, note?: string) => {
      try {
        const updated = await clausesService.rejectClause(
          projectId,
          documentId,
          clauseId,
          note
        );
        setClauses((prev) =>
          prev.map((c) => (c.id === clauseId ? updated : c))
        );
        if (selectedClause?.id === clauseId) {
          setSelectedClause(updated);
        }
      } catch (err) {
        throw err;
      }
    },
    [projectId, documentId, selectedClause]
  );

  // Trigger clause detection
  const detectClauses = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      await clausesService.detectClauses(projectId, documentId);
      // Refetch clauses after detection
      await fetchClauses();
      await fetchStats();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to detect clauses';
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [projectId, documentId, fetchClauses, fetchStats]);

  return {
    clauses,
    stats,
    loading,
    error,
    selectedClause,
    highlightEnabled,
    highlightedTypes,
    filters,
    fetchClauses,
    fetchStats,
    selectClause,
    toggleHighlight,
    toggleTypeHighlight,
    setFilters,
    verifyClause,
    rejectClause,
    detectClauses,
  };
}
