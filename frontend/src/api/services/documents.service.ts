import { apiClient } from '../client';
import type { Document } from '../../types/api';

// Allowed MIME types for document uploads
const ALLOWED_MIME_TYPES = [
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/rtf',
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/tiff',
  // Archives
  'application/zip',
  'application/x-zip-compressed',
] as const;

// Maximum file size: 100MB
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;

export interface DocumentUploadResult {
  documentId: string;
  filename: string;
  uploadUrl: string;
  s3Key: string;
  expiresAt: string;
}

export interface InitiateUploadInput {
  filename: string;
  mimeType: string;
  sizeBytes: number;
  folderId?: string | null;
  documentType?: string;
}

export interface ListDocumentsParams {
  folderId?: string | null;
  documentType?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export interface ListDocumentsResponse {
  documents: Document[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface UploadProgress {
  documentId: string;
  filename: string;
  progress: number;
  status: 'pending' | 'uploading' | 'confirming' | 'complete' | 'failed';
  error?: string;
}

export interface FileValidationError {
  filename: string;
  error: string;
}

/**
 * Validate a file before upload
 */
export function validateFile(file: File): FileValidationError | null {
  // Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      filename: file.name,
      error: `File size (${formatFileSize(file.size)}) exceeds maximum allowed (100MB)`,
    };
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.type as (typeof ALLOWED_MIME_TYPES)[number])) {
    return {
      filename: file.name,
      error: 'File type not allowed. Supported types: PDF, Word, Excel, PowerPoint, images, and ZIP files.',
    };
  }

  // Check filename for invalid characters
  if (file.name.includes('..') || file.name.includes('/') || file.name.includes('\\')) {
    return {
      filename: file.name,
      error: 'Filename contains invalid characters',
    };
  }

  return null;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Get file type category from MIME type
 */
export function getFileTypeCategory(mimeType: string): string {
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.includes('word')) return 'Word';
  if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'Excel';
  if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'PowerPoint';
  if (mimeType.startsWith('image/')) return 'Image';
  if (mimeType.includes('zip')) return 'ZIP';
  if (mimeType === 'text/plain') return 'Text';
  if (mimeType === 'text/csv') return 'CSV';
  return 'Document';
}

export const documentsService = {
  /**
   * List documents in a project
   */
  async listDocuments(
    projectId: string,
    params: ListDocumentsParams = {}
  ): Promise<ListDocumentsResponse> {
    const searchParams = new URLSearchParams();

    if (params.folderId) {
      searchParams.set('folderId', params.folderId);
    }
    if (params.documentType) {
      searchParams.set('documentType', params.documentType);
    }
    if (params.status) {
      searchParams.set('status', params.status);
    }
    if (params.page) {
      searchParams.set('page', params.page.toString());
    }
    if (params.limit) {
      searchParams.set('limit', params.limit.toString());
    }

    const queryString = searchParams.toString();
    const url = `/projects/${projectId}/documents${queryString ? `?${queryString}` : ''}`;

    return apiClient.get<ListDocumentsResponse>(url);
  },

  /**
   * Get a single document by ID
   */
  async getDocument(projectId: string, documentId: string): Promise<Document> {
    return apiClient.get<Document>(`/projects/${projectId}/documents/${documentId}`);
  },

  /**
   * Fetch the extracted fact-sheet markdown for a document.
   */
  async getFactSheet(projectId: string, documentId: string): Promise<string> {
    return apiClient.getText(
      `/projects/${projectId}/documents/${documentId}/fact-sheet`
    );
  },

  /**
   * Get document with download URL
   */
  async getDocumentWithDownloadUrl(
    projectId: string,
    documentId: string
  ): Promise<Document & { downloadUrl: string; downloadUrlExpiresAt: string }> {
    return apiClient.get(`/projects/${projectId}/documents/${documentId}?includeDownloadUrl=true`);
  },

  /**
   * Initiate a single file upload
   */
  async initiateUpload(
    projectId: string,
    input: InitiateUploadInput
  ): Promise<DocumentUploadResult> {
    return apiClient.post<DocumentUploadResult>(
      `/projects/${projectId}/documents/initiate-upload`,
      input
    );
  },

  /**
   * Initiate multiple file uploads
   */
  async initiateMultipleUploads(
    projectId: string,
    documents: InitiateUploadInput[]
  ): Promise<DocumentUploadResult[]> {
    const response = await apiClient.post<{ documents: DocumentUploadResult[] }>(
      `/projects/${projectId}/documents/initiate-multiple-uploads`,
      { documents }
    );
    return response.documents;
  },

  /**
   * Upload a file to S3 using the presigned URL
   */
  async uploadFileToS3(
    uploadUrl: string,
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        reject(new Error('Upload failed due to network error'));
      });

      xhr.addEventListener('abort', () => {
        reject(new Error('Upload was cancelled'));
      });

      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });
  },

  /**
   * Confirm a single upload is complete
   */
  async confirmUpload(projectId: string, documentId: string): Promise<Document> {
    return apiClient.post<Document>(`/projects/${projectId}/documents/confirm-upload`, {
      documentId,
    });
  },

  /**
   * Confirm multiple uploads are complete
   */
  async confirmMultipleUploads(
    projectId: string,
    documentIds: string[]
  ): Promise<{ confirmed: string[]; failed: { id: string; reason: string }[] }> {
    return apiClient.post(`/projects/${projectId}/documents/confirm-multiple-uploads`, {
      documentIds,
    });
  },

  /**
   * Delete a document
   */
  async deleteDocument(projectId: string, documentId: string): Promise<void> {
    return apiClient.delete(`/projects/${projectId}/documents/${documentId}`);
  },

  /**
   * Move a document to a different folder
   */
  async moveDocument(
    projectId: string,
    documentId: string,
    folderId: string | null
  ): Promise<Document> {
    return apiClient.patch<Document>(`/projects/${projectId}/documents/${documentId}/move`, {
      folderId,
    });
  },

  /**
   * Upload a single file with full flow (initiate -> upload -> confirm)
   */
  async uploadFile(
    projectId: string,
    file: File,
    folderId: string | null,
    onProgress?: (progress: number) => void
  ): Promise<Document> {
    // Validate file
    const validationError = validateFile(file);
    if (validationError) {
      throw new Error(validationError.error);
    }

    // Initiate upload
    const { documentId, uploadUrl } = await this.initiateUpload(projectId, {
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      folderId,
    });

    // Upload to S3
    await this.uploadFileToS3(uploadUrl, file, onProgress);

    // Confirm upload
    return this.confirmUpload(projectId, documentId);
  },

  /**
   * Upload multiple files with full flow
   */
  async uploadFiles(
    projectId: string,
    files: File[],
    folderId: string | null,
    onProgress?: (filename: string, progress: number, status: UploadProgress['status']) => void
  ): Promise<{ successful: Document[]; failed: { filename: string; error: string }[] }> {
    const successful: Document[] = [];
    const failed: { filename: string; error: string }[] = [];

    // Validate all files first
    const validFiles: File[] = [];
    for (const file of files) {
      const validationError = validateFile(file);
      if (validationError) {
        failed.push(validationError);
        onProgress?.(file.name, 0, 'failed');
      } else {
        validFiles.push(file);
      }
    }

    // If no valid files, return early
    if (validFiles.length === 0) {
      return { successful, failed };
    }

    // Initiate uploads for all valid files
    const uploadInputs: InitiateUploadInput[] = validFiles.map((file) => ({
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      folderId,
    }));

    let uploadResults: DocumentUploadResult[];
    try {
      uploadResults = await this.initiateMultipleUploads(projectId, uploadInputs);
    } catch {
      // If batch initiation fails, add all files to failed list
      for (const file of validFiles) {
        failed.push({ filename: file.name, error: 'Failed to initiate upload' });
        onProgress?.(file.name, 0, 'failed');
      }
      return { successful, failed };
    }

    // Upload each file to S3
    const confirmedIds: string[] = [];
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const result = uploadResults[i];

      try {
        onProgress?.(file.name, 0, 'uploading');
        await this.uploadFileToS3(result.uploadUrl, file, (progress) => {
          onProgress?.(file.name, progress, 'uploading');
        });
        confirmedIds.push(result.documentId);
        onProgress?.(file.name, 100, 'confirming');
      } catch (error) {
        failed.push({
          filename: file.name,
          error: error instanceof Error ? error.message : 'Upload failed',
        });
        onProgress?.(file.name, 0, 'failed');
      }
    }

    // Confirm all successful uploads
    if (confirmedIds.length > 0) {
      try {
        const confirmResult = await this.confirmMultipleUploads(projectId, confirmedIds);

        // Mark confirmed uploads as complete using original filename
        // This ensures progress updates even if document fetch fails
        for (const docId of confirmResult.confirmed) {
          const uploadResult = uploadResults.find((r) => r.documentId === docId);
          if (uploadResult) {
            // Mark as complete immediately using original filename
            onProgress?.(uploadResult.filename, 100, 'complete');
          }

          // Try to fetch the document for the successful array (non-blocking)
          try {
            const doc = await this.getDocument(projectId, docId);
            successful.push(doc);
          } catch {
            // Document fetch failed but upload succeeded - still count as success
            // The document list will refresh and show it
          }
        }

        // Add confirmation failures to failed list
        for (const failedDoc of confirmResult.failed) {
          const file = validFiles.find((f) => {
            const result = uploadResults.find((r) => r.documentId === failedDoc.id);
            return result && f.name === result.filename;
          });
          if (file) {
            failed.push({ filename: file.name, error: failedDoc.reason });
            onProgress?.(file.name, 0, 'failed');
          }
        }
      } catch {
        // If confirmation fails, mark remaining as failed
        for (const docId of confirmedIds) {
          const result = uploadResults.find((r) => r.documentId === docId);
          if (result && !successful.some((s) => s.id === docId)) {
            failed.push({ filename: result.filename, error: 'Failed to confirm upload' });
            onProgress?.(result.filename, 0, 'failed');
          }
        }
      }
    }

    return { successful, failed };
  },
};
