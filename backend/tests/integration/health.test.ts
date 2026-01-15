import { describe, it, expect } from 'vitest';
import { createTestApp } from '../utils';

describe('Health Check Endpoint', () => {
  describe('GET /health', () => {
    it('should return 200 with status ok', async () => {
      const response = await createTestApp()
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });

    it('should return valid ISO timestamp', async () => {
      const response = await createTestApp()
        .get('/health')
        .expect(200);

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });

    it('should not require authentication', async () => {
      // No Authorization header
      const response = await createTestApp()
        .get('/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
    });
  });
});
