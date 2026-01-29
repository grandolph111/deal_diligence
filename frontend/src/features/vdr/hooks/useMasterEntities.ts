import { useState, useCallback, useEffect } from 'react';
import { masterEntitiesService } from '../../../api/services/master-entities.service';
import type {
  MasterEntityWithCount,
  MasterEntityDetail,
  DuplicatePair,
  DeduplicationStats,
  EntityType,
} from '../../../types/api';

interface UseMasterEntitiesOptions {
  projectId: string | undefined;
  autoFetch?: boolean;
}

interface UseMasterEntitiesReturn {
  // List state
  entities: MasterEntityWithCount[];
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };

  // Detail state
  selectedEntity: MasterEntityDetail | null;
  detailLoading: boolean;
  detailError: string | null;

  // Duplicates state
  duplicates: DuplicatePair[];
  duplicatesLoading: boolean;

  // Filters
  entityTypeFilter: EntityType | null;
  searchQuery: string;

  // Actions
  fetchEntities: (page?: number, limit?: number) => Promise<void>;
  fetchEntityDetail: (entityId: string) => Promise<void>;
  clearSelectedEntity: () => void;
  fetchDuplicates: () => Promise<void>;
  setEntityTypeFilter: (type: EntityType | null) => void;
  setSearchQuery: (query: string) => void;
  updateEntity: (entityId: string, data: { canonicalName?: string; aliases?: string[] }) => Promise<void>;
  deleteEntity: (entityId: string) => Promise<void>;
  mergeEntities: (sourceIds: string[], targetId: string, canonicalName?: string) => Promise<void>;
  splitEntity: (entityId: string, docEntityIds: string[], newName: string) => Promise<MasterEntityDetail>;
  runDeduplication: (entityType?: EntityType) => Promise<DeduplicationStats>;
  refresh: () => Promise<void>;
}

/**
 * Hook for managing master entities (knowledge graph canonical entities)
 */
export function useMasterEntities({
  projectId,
  autoFetch = true,
}: UseMasterEntitiesOptions): UseMasterEntitiesReturn {
  // List state
  const [entities, setEntities] = useState<MasterEntityWithCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  // Detail state
  const [selectedEntity, setSelectedEntity] = useState<MasterEntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Duplicates state
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([]);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);

  // Filters
  const [entityTypeFilter, setEntityTypeFilter] = useState<EntityType | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch entities list
  const fetchEntities = useCallback(
    async (page = 1, limit = 20) => {
      if (!projectId) return;

      setLoading(true);
      setError(null);

      try {
        const response = await masterEntitiesService.listMasterEntities(projectId, {
          entityType: entityTypeFilter || undefined,
          search: searchQuery || undefined,
          page,
          limit,
        });

        setEntities(response.entities);
        setPagination(response.pagination);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load entities';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [projectId, entityTypeFilter, searchQuery]
  );

  // Fetch single entity detail
  const fetchEntityDetail = useCallback(
    async (entityId: string) => {
      if (!projectId) return;

      setDetailLoading(true);
      setDetailError(null);

      try {
        const detail = await masterEntitiesService.getMasterEntity(projectId, entityId);
        setSelectedEntity(detail);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load entity details';
        setDetailError(message);
      } finally {
        setDetailLoading(false);
      }
    },
    [projectId]
  );

  // Clear selected entity
  const clearSelectedEntity = useCallback(() => {
    setSelectedEntity(null);
    setDetailError(null);
  }, []);

  // Fetch potential duplicates
  const fetchDuplicates = useCallback(async () => {
    if (!projectId) return;

    setDuplicatesLoading(true);

    try {
      const response = await masterEntitiesService.findDuplicates(projectId, {
        entityType: entityTypeFilter || undefined,
        limit: 50,
      });
      setDuplicates(response.duplicates);
    } catch {
      // Non-critical, silently fail
      setDuplicates([]);
    } finally {
      setDuplicatesLoading(false);
    }
  }, [projectId, entityTypeFilter]);

  // Update entity
  const updateEntity = useCallback(
    async (entityId: string, data: { canonicalName?: string; aliases?: string[] }) => {
      if (!projectId) return;

      await masterEntitiesService.updateMasterEntity(projectId, entityId, data);

      // Refresh list and detail if applicable
      await fetchEntities(pagination.page, pagination.limit);
      if (selectedEntity?.id === entityId) {
        await fetchEntityDetail(entityId);
      }
    },
    [projectId, fetchEntities, fetchEntityDetail, pagination.page, pagination.limit, selectedEntity?.id]
  );

  // Delete entity
  const deleteEntity = useCallback(
    async (entityId: string) => {
      if (!projectId) return;

      await masterEntitiesService.deleteMasterEntity(projectId, entityId);

      // Clear selection if deleted entity was selected
      if (selectedEntity?.id === entityId) {
        clearSelectedEntity();
      }

      // Refresh list
      await fetchEntities(pagination.page, pagination.limit);
    },
    [projectId, fetchEntities, pagination.page, pagination.limit, selectedEntity?.id, clearSelectedEntity]
  );

  // Merge entities
  const mergeEntities = useCallback(
    async (sourceIds: string[], targetId: string, canonicalName?: string) => {
      if (!projectId) return;

      const result = await masterEntitiesService.mergeEntities(projectId, {
        sourceEntityIds: sourceIds,
        targetEntityId: targetId,
        canonicalName,
      });

      // Update selection to merged entity
      setSelectedEntity(result);

      // Refresh list
      await fetchEntities(pagination.page, pagination.limit);
    },
    [projectId, fetchEntities, pagination.page, pagination.limit]
  );

  // Split entity
  const splitEntity = useCallback(
    async (entityId: string, docEntityIds: string[], newName: string): Promise<MasterEntityDetail> => {
      if (!projectId) throw new Error('No project ID');

      const result = await masterEntitiesService.splitEntity(projectId, entityId, {
        documentEntityIds: docEntityIds,
        newCanonicalName: newName,
      });

      // Refresh list
      await fetchEntities(pagination.page, pagination.limit);

      // Refresh original entity detail if it was selected
      if (selectedEntity?.id === entityId) {
        await fetchEntityDetail(entityId);
      }

      return result;
    },
    [projectId, fetchEntities, fetchEntityDetail, pagination.page, pagination.limit, selectedEntity?.id]
  );

  // Run deduplication
  const runDeduplication = useCallback(
    async (entityType?: EntityType): Promise<DeduplicationStats> => {
      if (!projectId) throw new Error('No project ID');

      const stats = await masterEntitiesService.runDeduplication(projectId, entityType);

      // Refresh list after deduplication
      await fetchEntities(pagination.page, pagination.limit);

      return stats;
    },
    [projectId, fetchEntities, pagination.page, pagination.limit]
  );

  // Refresh all data
  const refresh = useCallback(async () => {
    await fetchEntities(pagination.page, pagination.limit);
    if (selectedEntity) {
      await fetchEntityDetail(selectedEntity.id);
    }
  }, [fetchEntities, fetchEntityDetail, pagination.page, pagination.limit, selectedEntity]);

  // Auto-fetch on mount and when filters change
  useEffect(() => {
    if (autoFetch && projectId) {
      fetchEntities(1, pagination.limit);
    }
  }, [autoFetch, projectId, entityTypeFilter, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // List state
    entities,
    loading,
    error,
    pagination,

    // Detail state
    selectedEntity,
    detailLoading,
    detailError,

    // Duplicates state
    duplicates,
    duplicatesLoading,

    // Filters
    entityTypeFilter,
    searchQuery,

    // Actions
    fetchEntities,
    fetchEntityDetail,
    clearSelectedEntity,
    fetchDuplicates,
    setEntityTypeFilter,
    setSearchQuery,
    updateEntity,
    deleteEntity,
    mergeEntities,
    splitEntity,
    runDeduplication,
    refresh,
  };
}
