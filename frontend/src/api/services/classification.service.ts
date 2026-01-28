import { apiClient } from '../client';
import type { DocumentType, RiskLevel } from '../../types/api';

// Classification data returned from API
export interface DocumentClassification {
  documentId: string;
  documentType: DocumentType | null;
  riskLevel: RiskLevel | null;
  documentTypeConfidence?: number;
  riskLevelConfidence?: number;
}

// Input for manual classification
export interface ClassifyDocumentInput {
  documentType: DocumentType;
  riskLevel?: RiskLevel;
}

// Classification statistics
export interface ClassificationStats {
  totalDocuments: number;
  classifiedDocuments: number;
  unclassifiedDocuments: number;
  byType: Record<string, number>;
  byRiskLevel: Record<string, number>;
}

export const classificationService = {
  /**
   * Get document classification
   */
  async getClassification(
    projectId: string,
    documentId: string
  ): Promise<DocumentClassification> {
    return apiClient.get<DocumentClassification>(
      `/projects/${projectId}/documents/${documentId}/classification`
    );
  },

  /**
   * Manually classify a document
   */
  async classifyDocument(
    projectId: string,
    documentId: string,
    input: ClassifyDocumentInput
  ): Promise<DocumentClassification> {
    return apiClient.put<DocumentClassification>(
      `/projects/${projectId}/documents/${documentId}/classification`,
      input
    );
  },

  /**
   * Trigger AI classification for a document
   */
  async classifyViaAI(
    projectId: string,
    documentId: string
  ): Promise<DocumentClassification> {
    return apiClient.post<DocumentClassification>(
      `/projects/${projectId}/documents/${documentId}/classification/classify`
    );
  },

  /**
   * Clear document classification
   */
  async clearClassification(
    projectId: string,
    documentId: string
  ): Promise<void> {
    return apiClient.delete(
      `/projects/${projectId}/documents/${documentId}/classification`
    );
  },

  /**
   * Get classification statistics for a project
   */
  async getStats(projectId: string): Promise<ClassificationStats> {
    return apiClient.get<ClassificationStats>(
      `/projects/${projectId}/classification/stats`
    );
  },
};
