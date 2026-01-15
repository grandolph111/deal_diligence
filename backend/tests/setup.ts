// Set test environment variables BEFORE any imports that use them
process.env.NODE_ENV = 'test';
process.env.AUTH0_AUDIENCE = 'https://api.test.dealdiligence.ai';
process.env.AUTH0_ISSUER_BASE_URL = 'https://test.auth0.com';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://postgres:password@127.0.0.1:5433/dealdiligence_test?schema=public&sslmode=disable';

import { beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { mockAuthMiddleware } from './utils/auth-mock';

// Mock the Auth0 JWT middleware globally
vi.mock('express-oauth2-jwt-bearer', () => ({
  auth: () => mockAuthMiddleware,
}));

beforeAll(async () => {
  // Any global setup
});

afterAll(async () => {
  // Any global teardown
});

beforeEach(() => {
  // Reset mocks before each test
  vi.clearAllMocks();
});
