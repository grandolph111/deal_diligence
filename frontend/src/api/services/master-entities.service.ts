import { apiClient } from '../client';
import type {
  MasterEntity,
  EntityType,
  MasterEntityListResponse,
  MasterEntityDetail,
  MasterEntityDocumentsResponse,
  DuplicatePairsResponse,
  DeduplicationStats,
} from '../../types/api';

/**
 * Query parameters for listing master entities
 */
export interface ListMasterEntitiesParams {
  entityType?: EntityType;
  search?: string;
  page?: number;
  limit?: number;
}

/**
 * Query parameters for finding potential duplicates
 */
export interface FindDuplicatesParams {
  entityType?: EntityType;
  threshold?: number;
  page?: number;
  limit?: number;
}

/**
 * Input for creating a master entity
 */
export interface CreateMasterEntityInput {
  canonicalName: string;
  entityType: EntityType;
  aliases?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Input for updating a master entity
 */
export interface UpdateMasterEntityInput {
  canonicalName?: string;
  aliases?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Input for merging entities
 */
export interface MergeEntitiesInput {
  sourceEntityIds: string[];
  targetEntityId: string;
  canonicalName?: string;
}

/**
 * Input for splitting an entity
 */
export interface SplitEntityInput {
  documentEntityIds: string[];
  newCanonicalName: string;
}

/**
 * Master Entities API service for knowledge graph entity management
 */
export const masterEntitiesService = {
  /**
   * List all master entities in a project
   */
  async listMasterEntities(
    projectId: string,
    params?: ListMasterEntitiesParams
  ): Promise<MasterEntityListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.entityType) queryParams.set('entityType', params.entityType);
    if (params?.search) queryParams.set('search', params.search);
    if (params?.page) queryParams.set('page', String(params.page));
    if (params?.limit) queryParams.set('limit', String(params.limit));

    const query = queryParams.toString();
    const url = `/projects/${projectId}/master-entities${query ? `?${query}` : ''}`;

    return apiClient.get<MasterEntityListResponse>(url);
  },

  /**
   * Get a single master entity by ID with full details
   */
  async getMasterEntity(
    projectId: string,
    entityId: string
  ): Promise<MasterEntityDetail> {
    return apiClient.get<MasterEntityDetail>(
      `/projects/${projectId}/master-entities/${entityId}`
    );
  },

  /**
   * Create a new master entity
   */
  async createMasterEntity(
    projectId: string,
    data: CreateMasterEntityInput
  ): Promise<MasterEntity> {
    return apiClient.post<MasterEntity>(
      `/projects/${projectId}/master-entities`,
      data
    );
  },

  /**
   * Update a master entity
   */
  async updateMasterEntity(
    projectId: string,
    entityId: string,
    data: UpdateMasterEntityInput
  ): Promise<MasterEntity> {
    return apiClient.patch<MasterEntity>(
      `/projects/${projectId}/master-entities/${entityId}`,
      data
    );
  },

  /**
   * Delete a master entity
   */
  async deleteMasterEntity(
    projectId: string,
    entityId: string
  ): Promise<void> {
    return apiClient.delete<void>(
      `/projects/${projectId}/master-entities/${entityId}`
    );
  },

  /**
   * Get documents associated with a master entity
   */
  async getMasterEntityDocuments(
    projectId: string,
    entityId: string,
    page = 1,
    limit = 20
  ): Promise<MasterEntityDocumentsResponse> {
    const queryParams = new URLSearchParams();
    queryParams.set('page', String(page));
    queryParams.set('limit', String(limit));

    return apiClient.get<MasterEntityDocumentsResponse>(
      `/projects/${projectId}/master-entities/${entityId}/documents?${queryParams.toString()}`
    );
  },

  /**
   * Find potential duplicate master entities
   */
  async findDuplicates(
    projectId: string,
    params?: FindDuplicatesParams
  ): Promise<DuplicatePairsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.entityType) queryParams.set('entityType', params.entityType);
    if (params?.threshold) queryParams.set('threshold', String(params.threshold));
    if (params?.page) queryParams.set('page', String(params.page));
    if (params?.limit) queryParams.set('limit', String(params.limit));

    const query = queryParams.toString();
    return apiClient.get<DuplicatePairsResponse>(
      `/projects/${projectId}/master-entities/duplicates${query ? `?${query}` : ''}`
    );
  },

  /**
   * Run batch deduplication on unlinked document entities
   */
  async runDeduplication(
    projectId: string,
    entityType?: EntityType,
    threshold?: number
  ): Promise<DeduplicationStats> {
    const body: { entityType?: EntityType; threshold?: number } = {};
    if (entityType) body.entityType = entityType;
    if (threshold) body.threshold = threshold;

    return apiClient.post<DeduplicationStats>(
      `/projects/${projectId}/master-entities/deduplicate`,
      body
    );
  },

  /**
   * Merge multiple master entities into one
   */
  async mergeEntities(
    projectId: string,
    data: MergeEntitiesInput
  ): Promise<MasterEntityDetail> {
    return apiClient.post<MasterEntityDetail>(
      `/projects/${projectId}/master-entities/merge`,
      data
    );
  },

  /**
   * Split document entities into a new master entity
   */
  async splitEntity(
    projectId: string,
    entityId: string,
    data: SplitEntityInput
  ): Promise<MasterEntityDetail> {
    return apiClient.post<MasterEntityDetail>(
      `/projects/${projectId}/master-entities/${entityId}/split`,
      data
    );
  },
};
