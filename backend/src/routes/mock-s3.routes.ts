import { Router, Request, Response } from 'express';
import { s3Service } from '../services/s3.service';

const router = Router();

/**
 * Mock S3 routes for development without real S3
 * These routes simulate S3 presigned URL behavior using in-memory storage
 *
 * Security note: These routes are only active when S3 is in mock mode (no real S3 config).
 * They simulate the behavior of S3 presigned URLs which also don't require authentication
 * since the auth is baked into the signed URL itself.
 */

// Maximum file size: 100MB (matches frontend validation)
const MAX_FILE_SIZE = 100 * 1024 * 1024;

// Valid key pattern: projects/{uuid}/documents/{uuid}/{filename}
// UUID format: 8-4-4-4-12 hex characters
const KEY_PATTERN = /^projects\/[a-f0-9-]{36}\/documents\/[a-f0-9-]{36}\/[^\/]+$/;

/**
 * Validate S3 key format to prevent path traversal attacks
 */
function isValidKey(key: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }

  // Check for path traversal attempts
  if (key.includes('..') || key.includes('//')) {
    return false;
  }

  // Validate key matches expected pattern
  return KEY_PATTERN.test(key);
}

/**
 * PUT /api/v1/mock-s3/upload?key=...
 * Simulates S3 presigned upload - stores file in memory
 */
router.put('/upload', (req: Request, res: Response) => {
  // Only allow in mock mode
  if (!s3Service.isMockMode()) {
    return res.status(403).json({ error: 'Mock S3 not enabled' });
  }

  const key = req.query.key as string;

  // Validate key format
  if (!isValidKey(key)) {
    return res.status(400).json({ error: 'Invalid key format' });
  }

  // Collect the raw body with size limit
  const chunks: Buffer[] = [];
  let totalSize = 0;
  let sizeLimitExceeded = false;

  req.on('data', (chunk: Buffer) => {
    if (sizeLimitExceeded) return;

    totalSize += chunk.length;
    if (totalSize > MAX_FILE_SIZE) {
      sizeLimitExceeded = true;
      res.status(413).json({ error: 'File too large' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (sizeLimitExceeded) return;

    const data = Buffer.concat(chunks);
    const contentType = req.headers['content-type'] || 'application/octet-stream';

    // Store in mock storage
    s3Service.mock.putObject(key, data, contentType);

    // S3 returns 200 OK for successful uploads
    res.status(200).send();
  });

  req.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Upload failed' });
    }
  });
});

/**
 * GET /api/v1/mock-s3/download?key=...
 * Simulates S3 presigned download - retrieves file from memory
 */
router.get('/download', (req: Request, res: Response) => {
  // Only allow in mock mode
  if (!s3Service.isMockMode()) {
    return res.status(403).json({ error: 'Mock S3 not enabled' });
  }

  const key = req.query.key as string;

  // Validate key format
  if (!isValidKey(key)) {
    return res.status(400).json({ error: 'Invalid key format' });
  }

  const object = s3Service.mock.getObject(key);
  if (!object) {
    return res.status(404).json({ error: 'Object not found' });
  }

  res.setHeader('Content-Type', object.mimeType);
  res.setHeader('Content-Length', object.data.length);
  res.send(object.data);
});

export default router;
