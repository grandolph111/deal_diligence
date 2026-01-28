import { apiClient } from '../client';
import type {
  DocumentClause,
  ClauseStats,
  ListClausesParams,
  ClausesListResponse,
  ClauseType,
  RiskLevel,
} from '../../types/api';

/**
 * Service for clause detection API operations
 */
export const clausesService = {
  /**
   * Get clauses for a document
   */
  async getDocumentClauses(
    projectId: string,
    documentId: string,
    params?: ListClausesParams
  ): Promise<ClausesListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.clauseType) queryParams.set('clauseType', params.clauseType);
    if (params?.riskLevel) queryParams.set('riskLevel', params.riskLevel);
    if (params?.isRiskFlagged !== undefined) queryParams.set('isRiskFlagged', String(params.isRiskFlagged));
    if (params?.isVerified !== undefined) queryParams.set('isVerified', String(params.isVerified));
    if (params?.page) queryParams.set('page', String(params.page));
    if (params?.limit) queryParams.set('limit', String(params.limit));

    const queryString = queryParams.toString();
    const url = `/projects/${projectId}/documents/${documentId}/clauses${queryString ? `?${queryString}` : ''}`;

    return apiClient.get<ClausesListResponse>(url);
  },

  /**
   * Get clause statistics for a document
   */
  async getDocumentClauseStats(
    projectId: string,
    documentId: string
  ): Promise<ClauseStats> {
    return apiClient.get<ClauseStats>(
      `/projects/${projectId}/documents/${documentId}/clauses/stats`
    );
  },

  /**
   * Get a single clause by ID
   */
  async getClause(
    projectId: string,
    documentId: string,
    clauseId: string
  ): Promise<DocumentClause> {
    return apiClient.get<DocumentClause>(
      `/projects/${projectId}/documents/${documentId}/clauses/${clauseId}`
    );
  },

  /**
   * Trigger clause detection for a document
   */
  async detectClauses(
    projectId: string,
    documentId: string
  ): Promise<{ documentId: string; detectedCount: number; processingTimeMs: number }> {
    return apiClient.post<{ documentId: string; detectedCount: number; processingTimeMs: number }>(
      `/projects/${projectId}/documents/${documentId}/clauses/detect`
    );
  },

  /**
   * Verify a clause as correct
   */
  async verifyClause(
    projectId: string,
    documentId: string,
    clauseId: string,
    note?: string
  ): Promise<DocumentClause> {
    return apiClient.post<DocumentClause>(
      `/projects/${projectId}/documents/${documentId}/clauses/${clauseId}/verify`,
      note ? { note } : undefined
    );
  },

  /**
   * Reject a clause as incorrect
   */
  async rejectClause(
    projectId: string,
    documentId: string,
    clauseId: string,
    note?: string
  ): Promise<DocumentClause> {
    return apiClient.post<DocumentClause>(
      `/projects/${projectId}/documents/${documentId}/clauses/${clauseId}/reject`,
      note ? { note } : undefined
    );
  },

  /**
   * Update a clause annotation
   */
  async updateClause(
    projectId: string,
    documentId: string,
    clauseId: string,
    data: {
      clauseType?: ClauseType;
      title?: string | null;
      content?: string;
      riskLevel?: RiskLevel | null;
    }
  ): Promise<DocumentClause> {
    return apiClient.patch<DocumentClause>(
      `/projects/${projectId}/documents/${documentId}/clauses/${clauseId}`,
      data
    );
  },

  /**
   * Delete a clause annotation
   */
  async deleteClause(
    projectId: string,
    documentId: string,
    clauseId: string
  ): Promise<void> {
    return apiClient.delete<void>(
      `/projects/${projectId}/documents/${documentId}/clauses/${clauseId}`
    );
  },

  /**
   * Search clauses across a project
   */
  async searchClauses(
    projectId: string,
    query: string,
    params?: {
      clauseType?: ClauseType;
      riskLevel?: RiskLevel;
      page?: number;
      limit?: number;
    }
  ): Promise<ClausesListResponse> {
    const queryParams = new URLSearchParams({ query });
    if (params?.clauseType) queryParams.set('clauseType', params.clauseType);
    if (params?.riskLevel) queryParams.set('riskLevel', params.riskLevel);
    if (params?.page) queryParams.set('page', String(params.page));
    if (params?.limit) queryParams.set('limit', String(params.limit));

    return apiClient.get<ClausesListResponse>(
      `/projects/${projectId}/clauses/search?${queryParams.toString()}`
    );
  },

  /**
   * Get risk-flagged clauses across a project
   */
  async getRiskFlaggedClauses(
    projectId: string,
    params?: { page?: number; limit?: number }
  ): Promise<ClausesListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', String(params.page));
    if (params?.limit) queryParams.set('limit', String(params.limit));

    const queryString = queryParams.toString();
    const url = `/projects/${projectId}/clauses/risk-flagged${queryString ? `?${queryString}` : ''}`;

    return apiClient.get<ClausesListResponse>(url);
  },

  /**
   * Get unverified clauses for a project (review queue)
   */
  async getUnverifiedClauses(
    projectId: string,
    params?: { page?: number; limit?: number }
  ): Promise<ClausesListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.set('page', String(params.page));
    if (params?.limit) queryParams.set('limit', String(params.limit));

    const queryString = queryParams.toString();
    const url = `/projects/${projectId}/clauses/unverified${queryString ? `?${queryString}` : ''}`;

    return apiClient.get<ClausesListResponse>(url);
  },

  /**
   * Get project-level clause statistics
   */
  async getProjectClauseStats(projectId: string): Promise<{
    projectId: string;
    totalClauses: number;
    riskFlaggedCount: number;
    verifiedCount: number;
    rejectedCount: number;
    pendingReviewCount: number;
    byType: Array<{ type: string; count: number }>;
    byRiskLevel: Array<{ level: string; count: number }>;
  }> {
    return apiClient.get(`/projects/${projectId}/clauses/stats`);
  },
};
