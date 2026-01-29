import { useState, useCallback, useEffect } from 'react';
import { relationshipsService } from '../../../api';
import type { GraphData, RelationshipStats } from '../../../api/services/relationships.service';
import type { EntityType } from '../../../types/api';

interface UseKnowledgeGraphOptions {
  projectId: string;
  initialEntityTypeFilter?: EntityType;
}

interface UseKnowledgeGraphReturn {
  graphData: GraphData | null;
  stats: RelationshipStats | null;
  loading: boolean;
  error: string | null;
  entityTypeFilter: EntityType | undefined;
  selectedNodeId: string | null;
  setEntityTypeFilter: (filter: EntityType | undefined) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  refreshGraph: () => Promise<void>;
}

/**
 * Hook for managing knowledge graph data and state
 */
export function useKnowledgeGraph({
  projectId,
  initialEntityTypeFilter,
}: UseKnowledgeGraphOptions): UseKnowledgeGraphReturn {
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [stats, setStats] = useState<RelationshipStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityType | undefined>(
    initialEntityTypeFilter
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const fetchGraphData = useCallback(async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      const [data, statistics] = await Promise.all([
        relationshipsService.getGraphData(projectId, entityTypeFilter),
        relationshipsService.getRelationshipStats(projectId),
      ]);

      setGraphData(data);
      setStats(statistics);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load graph data';
      setError(message);
      setGraphData(null);
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [projectId, entityTypeFilter]);

  // Fetch data on mount and when filter changes
  useEffect(() => {
    fetchGraphData();
  }, [fetchGraphData]);

  const handleSetEntityTypeFilter = useCallback((filter: EntityType | undefined) => {
    setEntityTypeFilter(filter);
    setSelectedNodeId(null); // Clear selection when filter changes
  }, []);

  return {
    graphData,
    stats,
    loading,
    error,
    entityTypeFilter,
    selectedNodeId,
    setEntityTypeFilter: handleSetEntityTypeFilter,
    setSelectedNodeId,
    refreshGraph: fetchGraphData,
  };
}
