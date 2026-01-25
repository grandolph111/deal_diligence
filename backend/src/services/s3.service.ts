import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import path from 'path';
import { config } from '../config';

/**
 * Sanitize filename to prevent path traversal attacks
 * Removes directory components and dangerous characters
 */
function sanitizeFilename(filename: string): string {
  // Extract just the filename (remove any path components)
  const baseName = path.basename(filename);
  // Remove any remaining dangerous characters
  return baseName.replace(/[<>:"|?*\\\/]/g, '_');
}

// In-memory storage for mock S3 (development without real S3)
const mockStorage: Map<string, { data: Buffer; mimeType: string }> = new Map();

// Check if we're using mock S3 mode
const useMockS3 = config.nodeEnv === 'development' && !config.s3.bucket;

// Only create real S3 client if we have configuration
const s3Client = config.s3.bucket
  ? new S3Client({
      region: config.s3.region,
      credentials: {
        accessKeyId: config.s3.accessKeyId,
        secretAccessKey: config.s3.secretAccessKey,
      },
    })
  : null;

export interface PresignedUploadResult {
  uploadUrl: string;
  s3Key: string;
  expiresAt: Date;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  expiresAt: Date;
}

export interface S3HealthStatus {
  configured: boolean;
  mode: 'real' | 'mock';
  bucket: string | null;
  region: string;
  connected: boolean;
  error?: string;
}

export const s3Service = {
  /**
   * Generate a presigned URL for uploading a file to S3
   * In mock mode, returns a mock URL that won't work for actual uploads
   */
  async generatePresignedUploadUrl(
    projectId: string,
    documentId: string,
    filename: string,
    mimeType: string
  ): Promise<PresignedUploadResult> {
    // Sanitize filename to prevent path traversal attacks
    const safeFilename = sanitizeFilename(filename);
    const s3Key = `projects/${projectId}/documents/${documentId}/${safeFilename}`;

    const expiresAt = new Date(
      Date.now() + config.s3.presignedUrlExpiry * 1000
    );

    // Mock mode for development without S3
    if (useMockS3 || !s3Client) {
      return {
        uploadUrl: `http://localhost:${config.port}/api/v1/mock-s3/upload?key=${encodeURIComponent(s3Key)}`,
        s3Key,
        expiresAt,
      };
    }

    const command = new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: s3Key,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: config.s3.presignedUrlExpiry,
    });

    return {
      uploadUrl,
      s3Key,
      expiresAt,
    };
  },

  /**
   * Generate a presigned URL for downloading a file from S3
   * In mock mode, returns a mock URL
   */
  async generatePresignedDownloadUrl(
    s3Key: string
  ): Promise<PresignedDownloadResult> {
    const expiresAt = new Date(
      Date.now() + config.s3.presignedUrlExpiry * 1000
    );

    // Mock mode for development without S3
    if (useMockS3 || !s3Client) {
      return {
        downloadUrl: `http://localhost:${config.port}/api/v1/mock-s3/download?key=${encodeURIComponent(s3Key)}`,
        expiresAt,
      };
    }

    const command = new GetObjectCommand({
      Bucket: config.s3.bucket,
      Key: s3Key,
    });

    const downloadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: config.s3.presignedUrlExpiry,
    });

    return {
      downloadUrl,
      expiresAt,
    };
  },

  /**
   * Delete a file from S3
   * In mock mode, removes from in-memory storage
   */
  async deleteObject(s3Key: string): Promise<void> {
    // Mock mode for development without S3
    if (useMockS3 || !s3Client) {
      mockStorage.delete(s3Key);
      return;
    }

    const command = new DeleteObjectCommand({
      Bucket: config.s3.bucket,
      Key: s3Key,
    });

    await s3Client.send(command);
  },

  /**
   * Check if S3 is configured with real credentials
   */
  isConfigured(): boolean {
    return !!(
      config.s3.bucket &&
      config.s3.accessKeyId &&
      config.s3.secretAccessKey
    );
  },

  /**
   * Check if running in mock S3 mode
   */
  isMockMode(): boolean {
    return useMockS3 || !s3Client;
  },

  /**
   * Get health status of S3 service
   */
  async getHealthStatus(): Promise<S3HealthStatus> {
    const status: S3HealthStatus = {
      configured: this.isConfigured(),
      mode: this.isMockMode() ? 'mock' : 'real',
      bucket: config.s3.bucket || null,
      region: config.s3.region,
      connected: false,
    };

    // If in mock mode, always "connected"
    if (status.mode === 'mock') {
      status.connected = true;
      return status;
    }

    // Test real S3 connection
    if (s3Client && config.s3.bucket) {
      try {
        await s3Client.send(
          new HeadBucketCommand({ Bucket: config.s3.bucket })
        );
        status.connected = true;
      } catch (error) {
        status.connected = false;
        status.error =
          error instanceof Error ? error.message : 'Unknown error';
      }
    }

    return status;
  },

  /**
   * Mock S3 storage operations (for development/testing)
   */
  mock: {
    /**
     * Store data in mock storage (for testing)
     */
    putObject(s3Key: string, data: Buffer, mimeType: string): void {
      if (!useMockS3) {
        throw new Error('Mock storage only available in mock mode');
      }
      mockStorage.set(s3Key, { data, mimeType });
    },

    /**
     * Get data from mock storage (for testing)
     */
    getObject(s3Key: string): { data: Buffer; mimeType: string } | null {
      if (!useMockS3) {
        throw new Error('Mock storage only available in mock mode');
      }
      return mockStorage.get(s3Key) || null;
    },

    /**
     * Clear all mock storage (for testing)
     */
    clear(): void {
      mockStorage.clear();
    },

    /**
     * Get all keys in mock storage (for debugging)
     */
    getKeys(): string[] {
      return Array.from(mockStorage.keys());
    },
  },
};
