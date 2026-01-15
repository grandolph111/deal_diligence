import { Request, Response, NextFunction } from 'express';

/**
 * Test user data for mocking authenticated requests
 */
export interface MockUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

/**
 * Default test users for convenience
 */
export const testUsers = {
  owner: {
    sub: 'auth0|owner-user-123',
    email: 'owner@test.com',
    name: 'Test Owner',
    picture: 'https://example.com/owner.jpg',
  },
  admin: {
    sub: 'auth0|admin-user-456',
    email: 'admin@test.com',
    name: 'Test Admin',
    picture: 'https://example.com/admin.jpg',
  },
  member: {
    sub: 'auth0|member-user-789',
    email: 'member@test.com',
    name: 'Test Member',
    picture: 'https://example.com/member.jpg',
  },
  viewer: {
    sub: 'auth0|viewer-user-012',
    email: 'viewer@test.com',
    name: 'Test Viewer',
    picture: 'https://example.com/viewer.jpg',
  },
  outsider: {
    sub: 'auth0|outsider-user-999',
    email: 'outsider@test.com',
    name: 'Outsider User',
    picture: 'https://example.com/outsider.jpg',
  },
} as const;

/**
 * Currently active mock user for requests
 * This can be set via setMockUser() before making test requests
 */
let currentMockUser: MockUser | null = null;

/**
 * Set the user for subsequent authenticated requests
 */
export function setMockUser(user: MockUser | null): void {
  currentMockUser = user;
}

/**
 * Get the current mock user
 */
export function getMockUser(): MockUser | null {
  return currentMockUser;
}

/**
 * Clear the mock user (simulates unauthenticated request)
 */
export function clearMockUser(): void {
  currentMockUser = null;
}

/**
 * Mock Auth0 JWT validation middleware
 * This replaces express-oauth2-jwt-bearer in tests
 */
export function mockAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!currentMockUser) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'No valid token provided',
    });
    return;
  }

  // Attach the auth payload like the real middleware would
  (req as any).auth = {
    payload: {
      sub: currentMockUser.sub,
      aud: process.env.AUTH0_AUDIENCE,
      iss: process.env.AUTH0_ISSUER_BASE_URL,
      email: currentMockUser.email,
      name: currentMockUser.name,
      picture: currentMockUser.picture,
    },
  };

  next();
}

/**
 * Create a custom mock user for specific test scenarios
 */
export function createMockUser(overrides: Partial<MockUser> = {}): MockUser {
  const uniqueId = Math.random().toString(36).substring(7);
  return {
    sub: `auth0|test-user-${uniqueId}`,
    email: `test-${uniqueId}@test.com`,
    name: `Test User ${uniqueId}`,
    picture: `https://example.com/${uniqueId}.jpg`,
    ...overrides,
  };
}
