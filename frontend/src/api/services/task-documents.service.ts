import { apiClient } from '../client';
import type { LinkedDocument, LinkDocumentDto } from '../../types/api';

export const taskDocumentsService = {
  /**
   * Get all documents linked to a task
   */
  async getTaskDocuments(
    projectId: string,
    taskId: string
  ): Promise<LinkedDocument[]> {
    return apiClient.get<LinkedDocument[]>(
      `/projects/${projectId}/tasks/${taskId}/documents`
    );
  },

  /**
   * Link a document to a task
   */
  async linkDocument(
    projectId: string,
    taskId: string,
    data: LinkDocumentDto
  ): Promise<LinkedDocument> {
    return apiClient.post<LinkedDocument>(
      `/projects/${projectId}/tasks/${taskId}/documents`,
      data
    );
  },

  /**
   * Unlink a document from a task
   */
  async unlinkDocument(
    projectId: string,
    taskId: string,
    documentId: string
  ): Promise<void> {
    return apiClient.delete(
      `/projects/${projectId}/tasks/${taskId}/documents/${documentId}`
    );
  },
};
