import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
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

const s3Client = new S3Client({
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  },
});

export interface PresignedUploadResult {
  uploadUrl: string;
  s3Key: string;
  expiresAt: Date;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  expiresAt: Date;
}

export const s3Service = {
  /**
   * Generate a presigned URL for uploading a file to S3
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

    const command = new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: s3Key,
      ContentType: mimeType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: config.s3.presignedUrlExpiry,
    });

    const expiresAt = new Date(
      Date.now() + config.s3.presignedUrlExpiry * 1000
    );

    return {
      uploadUrl,
      s3Key,
      expiresAt,
    };
  },

  /**
   * Generate a presigned URL for downloading a file from S3
   */
  async generatePresignedDownloadUrl(
    s3Key: string
  ): Promise<PresignedDownloadResult> {
    const command = new GetObjectCommand({
      Bucket: config.s3.bucket,
      Key: s3Key,
    });

    const downloadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: config.s3.presignedUrlExpiry,
    });

    const expiresAt = new Date(
      Date.now() + config.s3.presignedUrlExpiry * 1000
    );

    return {
      downloadUrl,
      expiresAt,
    };
  },

  /**
   * Delete a file from S3
   */
  async deleteObject(s3Key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: config.s3.bucket,
      Key: s3Key,
    });

    await s3Client.send(command);
  },

  /**
   * Check if S3 is configured
   */
  isConfigured(): boolean {
    return !!(
      config.s3.bucket &&
      config.s3.accessKeyId &&
      config.s3.secretAccessKey
    );
  },
};
