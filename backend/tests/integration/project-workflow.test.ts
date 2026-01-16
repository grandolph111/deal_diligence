import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { ProjectRole } from '@prisma/client';
import {
  createTestApp,
  testUsers,
  setMockUser,
  clearMockUser,
  cleanDatabase,
  disconnectDatabase,
  createTestUser,
  testPrisma,
} from '../utils';

describe('Project Workflow Module', () => {
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

  describe('POST /api/v1/projects/create-workflow', () => {
    it('should return 401 when not authenticated', async () => {
      clearMockUser();

      await createTestApp()
        .post('/api/v1/projects/create-workflow')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          project: { name: 'New Project' },
        })
        .expect(401);
    });

    it('should create a project with just the project data', async () => {
      await createTestUser(testUsers.owner);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post('/api/v1/projects/create-workflow')
        .set('Authorization', 'Bearer test-token')
        .send({
          project: {
            name: 'Workflow Project',
            description: 'A project created via workflow',
          },
        })
        .expect(201);

      expect(response.body).toHaveProperty('project');
      expect(response.body.project.name).toBe('Workflow Project');
      expect(response.body.project.description).toBe('A project created via workflow');
      expect(response.body).toHaveProperty('members');
      expect(response.body).toHaveProperty('documents');
    });

    it('should make the creator an OWNER', async () => {
      const user = await createTestUser(testUsers.owner);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post('/api/v1/projects/create-workflow')
        .set('Authorization', 'Bearer test-token')
        .send({
          project: { name: 'Workflow Project' },
        })
        .expect(201);

      const membership = await testPrisma.projectMember.findFirst({
        where: {
          projectId: response.body.project.id,
          userId: user.id,
        },
      });

      expect(membership).not.toBeNull();
      expect(membership?.role).toBe(ProjectRole.OWNER);
    });

    it('should invite existing users as members', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post('/api/v1/projects/create-workflow')
        .set('Authorization', 'Bearer test-token')
        .send({
          project: { name: 'Project with Invites' },
          invites: [
            {
              email: member.email,
              role: 'ADMIN',
              permissions: { canAccessKanban: true },
            },
          ],
        })
        .expect(201);

      expect(response.body.members.added).toHaveLength(1);
      expect(response.body.members.added[0].userId).toBe(member.id);
      expect(response.body.members.added[0].role).toBe('ADMIN');
      expect(response.body.members.pending).toHaveLength(0);
      expect(response.body.members.failed).toHaveLength(0);
    });

    it('should create pending invitations for non-existing users', async () => {
      await createTestUser(testUsers.owner);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post('/api/v1/projects/create-workflow')
        .set('Authorization', 'Bearer test-token')
        .send({
          project: { name: 'Project with Pending Invites' },
          invites: [
            {
              email: 'newuser@example.com',
              role: 'MEMBER',
            },
          ],
        })
        .expect(201);

      expect(response.body.members.added).toHaveLength(0);
      expect(response.body.members.pending).toHaveLength(1);
      expect(response.body.members.pending[0].email).toBe('newuser@example.com');
      expect(response.body.members.pending[0]).toHaveProperty('token');
      expect(response.body.members.failed).toHaveLength(0);
    });

    it('should handle mixed invites - existing and non-existing users', async () => {
      await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post('/api/v1/projects/create-workflow')
        .set('Authorization', 'Bearer test-token')
        .send({
          project: { name: 'Mixed Invites Project' },
          invites: [
            { email: member.email, role: 'ADMIN' },
            { email: 'newuser1@example.com', role: 'MEMBER' },
            { email: 'newuser2@example.com', role: 'VIEWER' },
          ],
        })
        .expect(201);

      expect(response.body.members.added).toHaveLength(1);
      expect(response.body.members.pending).toHaveLength(2);
      expect(response.body.members.failed).toHaveLength(0);
    });

    it('should report failure for duplicate invites', async () => {
      await createTestUser(testUsers.owner);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post('/api/v1/projects/create-workflow')
        .set('Authorization', 'Bearer test-token')
        .send({
          project: { name: 'Duplicate Invites Project' },
          invites: [
            { email: 'newuser@example.com', role: 'MEMBER' },
            { email: 'newuser@example.com', role: 'ADMIN' }, // Duplicate
          ],
        })
        .expect(201);

      expect(response.body.members.pending).toHaveLength(1);
      expect(response.body.members.failed).toHaveLength(1);
      expect(response.body.members.failed[0].email).toBe('newuser@example.com');
    });

    it('should fail with missing project name', async () => {
      await createTestUser(testUsers.owner);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post('/api/v1/projects/create-workflow')
        .set('Authorization', 'Bearer test-token')
        .send({
          project: { description: 'No name provided' },
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should validate invite email format', async () => {
      await createTestUser(testUsers.owner);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post('/api/v1/projects/create-workflow')
        .set('Authorization', 'Bearer test-token')
        .send({
          project: { name: 'Invalid Email Project' },
          invites: [{ email: 'not-an-email', role: 'MEMBER' }],
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should validate invite role', async () => {
      await createTestUser(testUsers.owner);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post('/api/v1/projects/create-workflow')
        .set('Authorization', 'Bearer test-token')
        .send({
          project: { name: 'Invalid Role Project' },
          invites: [{ email: 'user@example.com', role: 'OWNER' }], // Cannot invite as OWNER
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });
  });
});
