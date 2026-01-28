import { useState, useCallback, useEffect } from 'react';
import { entitiesService } from '../../../api/services/entities.service';
import type {
  DocumentEntity,
  EntityStats,
  EntityType,
  ListEntitiesParams,
} from '../../../types/api';

interface UseEntitiesOptions {
  projectId: string;
  documentId: string;
  autoFetch?: boolean;
}

interface UseEntitiesReturn {
  entities: DocumentEntity[];
  stats: EntityStats | null;
  loading: boolean;
  error: string | null;
  selectedEntity: DocumentEntity | null;
  highlightEnabled: boolean;
  highlightedTypes: Set<EntityType>;
  fetchEntities: (params?: ListEntitiesParams) => Promise<void>;
  fetchStats: () => Promise<void>;
  selectEntity: (entity: DocumentEntity | null) => void;
  toggleHighlight: () => void;
  toggleTypeHighlight: (type: EntityType) => void;
  setAllTypesHighlighted: (enabled: boolean) => void;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing document entities
 */
export function useEntities({
  projectId,
  documentId,
  autoFetch = true,
}: UseEntitiesOptions): UseEntitiesReturn {
  const [entities, setEntities] = useState<DocumentEntity[]>([]);
  const [stats, setStats] = useState<EntityStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<DocumentEntity | null>(null);
  const [highlightEnabled, setHighlightEnabled] = useState(true);
  const [highlightedTypes, setHighlightedTypes] = useState<Set<EntityType>>(
    new Set([
      'PERSON',
      'ORGANIZATION',
      'DATE',
      'MONEY',
      'PERCENTAGE',
      'LOCATION',
      'CONTRACT_TERM',
      'CLAUSE_TYPE',
      'JURISDICTION',
    ])
  );

  const fetchEntities = useCallback(
    async (params?: ListEntitiesParams) => {
      if (!projectId || !documentId) return;

      setLoading(true);
      setError(null);

      try {
        const response = await entitiesService.getDocumentEntities(
          projectId,
          documentId,
          { limit: 100, ...params }
        );
        setEntities(response.entities);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load entities';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [projectId, documentId]
  );

  const fetchStats = useCallback(async () => {
    if (!projectId || !documentId) return;

    try {
      const statsData = await entitiesService.getDocumentEntityStats(
        projectId,
        documentId
      );
      setStats(statsData);
    } catch {
      // Stats fetch failure is non-critical
    }
  }, [projectId, documentId]);

  const selectEntity = useCallback((entity: DocumentEntity | null) => {
    setSelectedEntity(entity);
  }, []);

  const toggleHighlight = useCallback(() => {
    setHighlightEnabled((prev) => !prev);
  }, []);

  const toggleTypeHighlight = useCallback((type: EntityType) => {
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

  const setAllTypesHighlighted = useCallback((enabled: boolean) => {
    if (enabled) {
      setHighlightedTypes(
        new Set([
          'PERSON',
          'ORGANIZATION',
          'DATE',
          'MONEY',
          'PERCENTAGE',
          'LOCATION',
          'CONTRACT_TERM',
          'CLAUSE_TYPE',
          'JURISDICTION',
        ])
      );
    } else {
      setHighlightedTypes(new Set());
    }
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([fetchEntities(), fetchStats()]);
  }, [fetchEntities, fetchStats]);

  // Auto-fetch on mount if enabled
  useEffect(() => {
    if (autoFetch && projectId && documentId) {
      refresh();
    }
  }, [autoFetch, projectId, documentId, refresh]);

  return {
    entities,
    stats,
    loading,
    error,
    selectedEntity,
    highlightEnabled,
    highlightedTypes,
    fetchEntities,
    fetchStats,
    selectEntity,
    toggleHighlight,
    toggleTypeHighlight,
    setAllTypesHighlighted,
    refresh,
  };
}
