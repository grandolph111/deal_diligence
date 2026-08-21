import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { libraryService } from '../../../api/services/library.service';
import type { LibraryGraph, LibraryGraphNode } from '../../../api/services/library.service';

export interface ExpandError {
  riskCategoryId: string;
  message: string;
}

interface UseLibraryGraphReturn {
  graph: LibraryGraph; // base + expanded evidence, merged + deduped
  loading: boolean;
  error: string | null;
  expandedItems: Set<string>;
  expandingItemId: string | null;
  expandError: ExpandError | null;
  selectedNodeId: string | null;
  selectedNode: LibraryGraphNode | null;
  statusCounts: { open: number; covered: number; flagged: number; thin: number; total: number };
  truncated: { sources: number; entities: number } | null;
  expandItem: (riskCategoryId: string) => Promise<void>;
  toggleExpandItem: (riskCategoryId: string) => Promise<void>;
  setSelectedNodeId: (id: string | null) => void;
  refresh: () => Promise<void>;
}

const EMPTY: LibraryGraph = { nodes: [], edges: [] };

/**
 * Loads the tiered base graph and lets risk categories be expanded to reveal
 * their provision evidence (fetched on demand and merged into the view).
 */
export function useLibraryGraph(projectId: string): UseLibraryGraphReturn {
  const [base, setBase] = useState<LibraryGraph>(EMPTY);
  const [evidence, setEvidence] = useState<Map<string, LibraryGraph>>(new Map());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [expandingItemId, setExpandingItemId] = useState<string | null>(null);
  const [expandError, setExpandError] = useState<ExpandError | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Guards concurrent fetches for the same item (rapid taps) without waiting on
  // the async `expandingItemId` state to settle.
  const inFlight = useRef<Set<string>>(new Set());

  const fetchBase = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await libraryService.getGraph(projectId);
      setBase(data);
      setEvidence(new Map());
      setExpandedItems(new Set());
      setExpandError(null);
      setSelectedNodeId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the deal map');
      setBase(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchBase();
  }, [fetchBase]);

  // Fetch + cache an item's evidence once. Returns true if evidence is available
  // (already cached or fetched now). Surfaces a per-item error on failure.
  const ensureEvidence = useCallback(
    async (riskCategoryId: string): Promise<boolean> => {
      if (evidence.has(riskCategoryId)) return true;
      if (inFlight.current.has(riskCategoryId)) return false; // fetch already running
      inFlight.current.add(riskCategoryId);
      setExpandingItemId(riskCategoryId);
      setExpandError(null);
      try {
        const data = await libraryService.getCategoryEvidence(projectId, riskCategoryId);
        setEvidence((prev) => new Map(prev).set(riskCategoryId, data));
        return true;
      } catch (err) {
        setExpandError({ riskCategoryId, message: err instanceof Error ? err.message : 'Failed to load evidence' });
        return false;
      } finally {
        inFlight.current.delete(riskCategoryId);
        setExpandingItemId(null);
      }
    },
    [projectId, evidence]
  );

  // Expand only — never collapses (used for graph node taps).
  const expandItem = useCallback(
    async (riskCategoryId: string) => {
      if (expandedItems.has(riskCategoryId)) return;
      const ok = await ensureEvidence(riskCategoryId);
      if (ok) setExpandedItems((prev) => new Set(prev).add(riskCategoryId));
    },
    [expandedItems, ensureEvidence]
  );

  // Expand or collapse (used for the detail-panel button).
  const toggleExpandItem = useCallback(
    async (riskCategoryId: string) => {
      if (expandedItems.has(riskCategoryId)) {
        setExpandedItems((prev) => {
          const next = new Set(prev);
          next.delete(riskCategoryId);
          return next;
        });
        return;
      }
      const ok = await ensureEvidence(riskCategoryId);
      if (ok) setExpandedItems((prev) => new Set(prev).add(riskCategoryId));
    },
    [expandedItems, ensureEvidence]
  );

  // Merge base + expanded evidence, deduping by node/edge id.
  const graph = useMemo<LibraryGraph>(() => {
    const nodeById = new Map<string, LibraryGraphNode>();
    const edgeById = new Map<string, LibraryGraph['edges'][number]>();
    for (const n of base.nodes) nodeById.set(n.id, n);
    for (const e of base.edges) edgeById.set(e.id, e);
    for (const riskCategoryId of expandedItems) {
      const ev = evidence.get(riskCategoryId);
      if (!ev) continue;
      for (const n of ev.nodes) nodeById.set(n.id, n);
      for (const e of ev.edges) edgeById.set(e.id, e);
    }
    const nodes = [...nodeById.values()];
    // Drop any edge whose endpoints aren't both present (e.g. a peer edge to a
    // provision under an item that isn't expanded).
    const present = new Set(nodes.map((n) => n.id));
    const edges = [...edgeById.values()].filter(
      (e) => present.has(e.source) && present.has(e.target)
    );
    return { nodes, edges };
  }, [base, evidence, expandedItems]);

  const selectedNode = useMemo(
    () => (selectedNodeId ? graph.nodes.find((n) => n.id === selectedNodeId) ?? null : null),
    [graph, selectedNodeId]
  );

  const statusCounts = useMemo(() => {
    let open = 0;
    let covered = 0;
    let flagged = 0;
    let thin = 0;
    let total = 0;
    for (const n of base.nodes) {
      if (n.type !== 'RISK_CATEGORY') continue;
      if (n.status === 'NA') continue; // not applicable, or delegated to another adviser
      total += 1;
      if (n.status === 'FLAGGED') flagged += 1;
      else if (n.status === 'COVERED') covered += 1;
      else if (n.status === 'THIN') thin += 1;
      else open += 1; // genuinely unanswered
    }
    return { open, covered, flagged, thin, total };
  }, [base]);

  const truncated = base.truncated && (base.truncated.sources > 0 || base.truncated.entities > 0)
    ? base.truncated
    : null;

  return {
    graph,
    loading,
    error,
    expandedItems,
    expandingItemId,
    expandError,
    selectedNodeId,
    selectedNode,
    statusCounts,
    truncated,
    expandItem,
    toggleExpandItem,
    setSelectedNodeId,
    refresh: fetchBase,
  };
}
