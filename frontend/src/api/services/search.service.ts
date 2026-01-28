import { apiClient } from '../client';
import type { SearchResponse, SearchRequestDto, SimilarDocumentsResponse } from '../../types/api';

/**
 * VDR Search API service
 */
export const searchService = {
  /**
   * Search documents in the VDR
   * Note: This endpoint requires the backend search API to be implemented.
   * Currently returns mock data for UI development.
   */
  async search(
    projectId: string,
    params: SearchRequestDto
  ): Promise<SearchResponse> {
    // Use the API client when backend is ready
    // For now, check if the backend is available and fall back to mock data
    try {
      return await apiClient.post<SearchResponse>(`/projects/${projectId}/search`, params);
    } catch {
      // Fall back to mock data when backend search API is not yet implemented
      // This allows the frontend to be developed before the backend is ready
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate network delay

      return {
        results: [],
        total: 0,
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 20,
        query: params.query,
        searchType: params.searchType ?? 'keyword',
        filters: {
          folderId: params.folderId ?? null,
          documentType: params.documentType ?? null,
          dateFrom: params.dateFrom ?? null,
          dateTo: params.dateTo ?? null,
          riskLevel: params.riskLevel ?? null,
        },
      };
    }
  },

  /**
   * Find documents similar to a given document using semantic search
   * Uses BerryDB's similarity search via the Python microservice
   */
  async findSimilar(
    projectId: string,
    documentId: string,
    options?: { limit?: number }
  ): Promise<SimilarDocumentsResponse> {
    try {
      return await apiClient.post<SimilarDocumentsResponse>(
        `/projects/${projectId}/search/similar/${documentId}`,
        { limit: options?.limit ?? 10 }
      );
    } catch {
      // Fall back to mock data when backend is not available
      await new Promise(resolve => setTimeout(resolve, 500));

      return {
        documentId,
        similarDocuments: [],
        total: 0,
      };
    }
  },
};
