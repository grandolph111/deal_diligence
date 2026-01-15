import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import {
  createTestApp,
  testUsers,
  setMockUser,
  clearMockUser,
  createMockUser,
  cleanDatabase,
  disconnectDatabase,
  createTestUser,
  testPrisma,
} from '../utils';

describe('Auth Module', () => {
  beforeEach(async () => {
    await cleanDatabase();
    clearMockUser();
  });

  afterEach(() => {
    clearMockUser();
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return 401 when not authenticated', async () => {
      clearMockUser();

      const response = await createTestApp()
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body).toHaveProperty('error');
    });

    it('should create a new user on first request', async () => {
      const mockUser = testUsers.owner;
      setMockUser(mockUser);

      const response = await createTestApp()
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body.auth0Id).toBe(mockUser.sub);
      expect(response.body.email).toBe(mockUser.email);
      expect(response.body.name).toBe(mockUser.name);

      // Verify user was created in database
      const dbUser = await testPrisma.user.findUnique({
        where: { auth0Id: mockUser.sub },
      });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.email).toBe(mockUser.email);
    });

    it('should return existing user on subsequent requests', async () => {
      const mockUser = testUsers.owner;

      // Create user first
      await createTestUser(mockUser);
      setMockUser(mockUser);

      const response = await createTestApp()
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.auth0Id).toBe(mockUser.sub);
      expect(response.body.email).toBe(mockUser.email);

      // Verify only one user exists
      const userCount = await testPrisma.user.count({
        where: { auth0Id: mockUser.sub },
      });
      expect(userCount).toBe(1);
    });

    it('should update user info if Auth0 data changed', async () => {
      const originalMock = {
        sub: 'auth0|update-test-user',
        email: 'original@test.com',
        name: 'Original Name',
      };

      // Create user with original data
      await testPrisma.user.create({
        data: {
          auth0Id: originalMock.sub,
          email: originalMock.email,
          name: originalMock.name,
        },
      });

      // Request with updated Auth0 data
      const updatedMock = {
        ...originalMock,
        name: 'Updated Name',
        picture: 'https://example.com/new-avatar.jpg',
      };
      setMockUser(updatedMock);

      const response = await createTestApp()
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      // User info should be updated
      expect(response.body.name).toBe('Updated Name');
      expect(response.body.avatarUrl).toBe('https://example.com/new-avatar.jpg');
    });
  });

  describe('PATCH /api/v1/auth/me', () => {
    it('should return 401 when not authenticated', async () => {
      clearMockUser();

      await createTestApp()
        .patch('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .send({ name: 'New Name' })
        .expect(401);
    });

    it('should update user name', async () => {
      const mockUser = testUsers.owner;
      await createTestUser(mockUser);
      setMockUser(mockUser);

      const response = await createTestApp()
        .patch('/api/v1/auth/me')
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(response.body.name).toBe('Updated Name');

      // Verify in database
      const dbUser = await testPrisma.user.findUnique({
        where: { auth0Id: mockUser.sub },
      });
      expect(dbUser?.name).toBe('Updated Name');
    });

    it('should update user avatar URL', async () => {
      const mockUser = testUsers.owner;
      await createTestUser(mockUser);
      setMockUser(mockUser);

      const newAvatarUrl = 'https://example.com/new-avatar.png';

      const response = await createTestApp()
        .patch('/api/v1/auth/me')
        .set('Authorization', 'Bearer test-token')
        .send({ avatarUrl: newAvatarUrl })
        .expect(200);

      expect(response.body.avatarUrl).toBe(newAvatarUrl);
    });

    it('should update both name and avatarUrl', async () => {
      const mockUser = testUsers.owner;
      await createTestUser(mockUser);
      setMockUser(mockUser);

      const updates = {
        name: 'New Name',
        avatarUrl: 'https://example.com/avatar.png',
      };

      const response = await createTestApp()
        .patch('/api/v1/auth/me')
        .set('Authorization', 'Bearer test-token')
        .send(updates)
        .expect(200);

      expect(response.body.name).toBe(updates.name);
      expect(response.body.avatarUrl).toBe(updates.avatarUrl);
    });

    it('should ignore unknown fields', async () => {
      const mockUser = testUsers.owner;
      await createTestUser(mockUser);
      setMockUser(mockUser);

      const response = await createTestApp()
        .patch('/api/v1/auth/me')
        .set('Authorization', 'Bearer test-token')
        .send({
          name: 'Valid Name',
          unknownField: 'should be ignored',
          anotherUnknown: 123,
        })
        .expect(200);

      expect(response.body.name).toBe('Valid Name');
      expect(response.body).not.toHaveProperty('unknownField');
    });

    it('should not update email (read-only from Auth0)', async () => {
      const mockUser = testUsers.owner;
      await createTestUser(mockUser);
      setMockUser(mockUser);

      const response = await createTestApp()
        .patch('/api/v1/auth/me')
        .set('Authorization', 'Bearer test-token')
        .send({ email: 'hacker@evil.com' })
        .expect(200);

      // Email should remain unchanged
      expect(response.body.email).toBe(mockUser.email);
    });
  });
});
