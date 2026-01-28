import { apiClient } from '../client';
import type {
  DocumentEntity,
  EntityStats,
  ListEntitiesParams,
  EntitiesListResponse,
  EntityType,
} from '../../types/api';

/**
 * Entity API service for document entities
 */
export const entitiesService = {
  /**
   * Get entities for a document
   */
  async getDocumentEntities(
    projectId: string,
    documentId: string,
    params?: ListEntitiesParams
  ): Promise<EntitiesListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.entityType) queryParams.set('entityType', params.entityType);
    if (params?.needsReview !== undefined) queryParams.set('needsReview', String(params.needsReview));
    if (params?.minConfidence !== undefined) queryParams.set('minConfidence', String(params.minConfidence));
    if (params?.page) queryParams.set('page', String(params.page));
    if (params?.limit) queryParams.set('limit', String(params.limit));

    const query = queryParams.toString();
    const url = `/projects/${projectId}/documents/${documentId}/entities${query ? `?${query}` : ''}`;

    return apiClient.get<EntitiesListResponse>(url);
  },

  /**
   * Get entity statistics for a document
   */
  async getDocumentEntityStats(
    projectId: string,
    documentId: string
  ): Promise<EntityStats> {
    return apiClient.get<EntityStats>(
      `/projects/${projectId}/documents/${documentId}/entities/stats`
    );
  },

  /**
   * Get a single entity by ID
   */
  async getEntity(
    projectId: string,
    documentId: string,
    entityId: string
  ): Promise<DocumentEntity> {
    return apiClient.get<DocumentEntity>(
      `/projects/${projectId}/documents/${documentId}/entities/${entityId}`
    );
  },

  /**
   * Trigger entity extraction for a document
   */
  async extractEntities(
    projectId: string,
    documentId: string
  ): Promise<{ message: string; count: number }> {
    return apiClient.post<{ message: string; count: number }>(
      `/projects/${projectId}/documents/${documentId}/entities/extract`
    );
  },

  /**
   * Update an entity (e.g., after human review)
   */
  async updateEntity(
    projectId: string,
    documentId: string,
    entityId: string,
    data: {
      text?: string;
      normalizedText?: string | null;
      entityType?: EntityType;
      needsReview?: boolean;
    }
  ): Promise<DocumentEntity> {
    return apiClient.patch<DocumentEntity>(
      `/projects/${projectId}/documents/${documentId}/entities/${entityId}`,
      data
    );
  },

  /**
   * Delete an entity
   */
  async deleteEntity(
    projectId: string,
    documentId: string,
    entityId: string
  ): Promise<void> {
    return apiClient.delete<void>(
      `/projects/${projectId}/documents/${documentId}/entities/${entityId}`
    );
  },

  /**
   * Flag an entity for review
   */
  async flagForReview(
    projectId: string,
    documentId: string,
    entityId: string
  ): Promise<DocumentEntity> {
    return apiClient.post<DocumentEntity>(
      `/projects/${projectId}/documents/${documentId}/entities/${entityId}/flag`
    );
  },

  /**
   * Mark an entity as reviewed
   */
  async markReviewed(
    projectId: string,
    documentId: string,
    entityId: string
  ): Promise<DocumentEntity> {
    return apiClient.post<DocumentEntity>(
      `/projects/${projectId}/documents/${documentId}/entities/${entityId}/reviewed`
    );
  },

  /**
   * Search entities across all documents in a project
   */
  async searchEntities(
    projectId: string,
    query: string,
    entityType?: EntityType,
    page = 1,
    limit = 20
  ): Promise<EntitiesListResponse> {
    const queryParams = new URLSearchParams();
    queryParams.set('query', query);
    if (entityType) queryParams.set('entityType', entityType);
    queryParams.set('page', String(page));
    queryParams.set('limit', String(limit));

    return apiClient.get<EntitiesListResponse>(
      `/projects/${projectId}/entities/search?${queryParams.toString()}`
    );
  },

  /**
   * Get entities needing review across a project
   */
  async getEntitiesNeedingReview(
    projectId: string,
    page = 1,
    limit = 20
  ): Promise<EntitiesListResponse> {
    const queryParams = new URLSearchParams();
    queryParams.set('page', String(page));
    queryParams.set('limit', String(limit));

    return apiClient.get<EntitiesListResponse>(
      `/projects/${projectId}/entities/needs-review?${queryParams.toString()}`
    );
  },
};
