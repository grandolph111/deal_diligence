import request from 'supertest';
import app from '../../src/app';

/**
 * Create a test request instance with the app
 * This is the main way to make HTTP requests in tests
 */
export function createTestApp() {
  return request(app);
}

/**
 * Convenience export for making test requests
 */
export const testRequest = request(app);

/**
 * Helper to create authenticated request with proper headers
 * Note: The actual auth is handled by the mocked middleware and setMockUser()
 */
export function authenticatedRequest(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string) {
  const req = createTestApp()[method](path);
  // The mock middleware handles auth based on setMockUser()
  // We just need to set a dummy Authorization header to trigger the middleware
  return req.set('Authorization', 'Bearer test-token');
}
