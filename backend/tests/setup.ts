// Set test environment variables BEFORE any imports that use them
process.env.NODE_ENV = 'test';
process.env.AUTH0_AUDIENCE = 'https://api.test.dealdiligence.ai';
process.env.AUTH0_ISSUER_BASE_URL = 'https://test.auth0.com';
process.env.FRONTEND_URL = 'http://localhost:3000';
// Default must match .env.test — the previous hardcoded 5433/postgres pointed
// at a database that does not exist here, so every integration file failed to
// connect before reaching an assertion.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  'postgresql://gavinrandolph@127.0.0.1:5432/dealdiligence_test?schema=public&sslmode=disable';

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
