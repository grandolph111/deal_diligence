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
  createTestProject,
  addProjectMember,
  testPrisma,
} from '../utils';

describe('Invitations Module', () => {
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

  // Helper to create a pending invitation
  async function createPendingInvitation(
    projectId: string,
    email: string,
    invitedById: string,
    role: ProjectRole = ProjectRole.MEMBER
  ) {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return testPrisma.pendingInvitation.create({
      data: {
        projectId,
        email,
        role,
        invitedBy: invitedById,
        expiresAt,
      },
    });
  }

  describe('GET /api/v1/invitations/:token', () => {
    it('should return invitation details by token', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id, { name: 'Test Project' });
      const invitation = await createPendingInvitation(
        project.id,
        'newuser@example.com',
        owner.id
      );

      const response = await createTestApp()
        .get(`/api/v1/invitations/${invitation.token}`)
        .expect(200);

      expect(response.body.email).toBe('newuser@example.com');
      expect(response.body.role).toBe('MEMBER');
      expect(response.body.project.name).toBe('Test Project');
    });

    it('should return 404 for invalid token', async () => {
      await createTestApp()
        .get('/api/v1/invitations/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });

    it('should return 400 for expired invitation', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const expiredAt = new Date();
      expiredAt.setDate(expiredAt.getDate() - 1); // Expired yesterday

      const invitation = await testPrisma.pendingInvitation.create({
        data: {
          projectId: project.id,
          email: 'expired@example.com',
          role: ProjectRole.MEMBER,
          invitedBy: owner.id,
          expiresAt: expiredAt,
        },
      });

      await createTestApp()
        .get(`/api/v1/invitations/${invitation.token}`)
        .expect(400);
    });

    it('should return 400 for already accepted invitation', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invitation = await testPrisma.pendingInvitation.create({
        data: {
          projectId: project.id,
          email: 'accepted@example.com',
          role: ProjectRole.MEMBER,
          invitedBy: owner.id,
          expiresAt,
          acceptedAt: new Date(),
        },
      });

      await createTestApp()
        .get(`/api/v1/invitations/${invitation.token}`)
        .expect(400);
    });
  });

  describe('POST /api/v1/invitations/:token/accept', () => {
    it('should return 401 when not authenticated', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const invitation = await createPendingInvitation(
        project.id,
        testUsers.member.email,
        owner.id
      );
      clearMockUser();

      await createTestApp()
        .post(`/api/v1/invitations/${invitation.token}/accept`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should accept invitation and create membership', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id, { name: 'Test Project' });
      const invitation = await createPendingInvitation(
        project.id,
        member.email,
        owner.id,
        ProjectRole.ADMIN
      );

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .post(`/api/v1/invitations/${invitation.token}/accept`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.message).toBe('Invitation accepted successfully');
      expect(response.body.member.role).toBe('ADMIN');

      // Verify membership was created
      const membership = await testPrisma.projectMember.findFirst({
        where: {
          projectId: project.id,
          userId: member.id,
        },
      });

      expect(membership).not.toBeNull();
      expect(membership?.role).toBe('ADMIN');

      // Verify invitation was marked as accepted
      const updatedInvitation = await testPrisma.pendingInvitation.findUnique({
        where: { id: invitation.id },
      });
      expect(updatedInvitation?.acceptedAt).not.toBeNull();
    });

    it('should return 403 when email does not match', async () => {
      const owner = await createTestUser(testUsers.owner);
      await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      const invitation = await createPendingInvitation(
        project.id,
        'different@example.com', // Different email
        owner.id
      );

      setMockUser(testUsers.member); // Member trying to accept invitation for different email

      await createTestApp()
        .post(`/api/v1/invitations/${invitation.token}/accept`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });

    it('should return 400 when invitation already accepted', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const invitation = await testPrisma.pendingInvitation.create({
        data: {
          projectId: project.id,
          email: member.email,
          role: ProjectRole.MEMBER,
          invitedBy: owner.id,
          expiresAt,
          acceptedAt: new Date(),
        },
      });

      setMockUser(testUsers.member);

      await createTestApp()
        .post(`/api/v1/invitations/${invitation.token}/accept`)
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });

    it('should return 404 for invalid token', async () => {
      await createTestUser(testUsers.member);
      setMockUser(testUsers.member);

      await createTestApp()
        .post('/api/v1/invitations/00000000-0000-0000-0000-000000000000/accept')
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });
  });

  describe('GET /api/v1/invitations/pending', () => {
    it('should return 401 when not authenticated', async () => {
      clearMockUser();

      await createTestApp()
        .get('/api/v1/invitations/pending')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return pending invitations for authenticated user', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project1 = await createTestProject(owner.id, { name: 'Project 1' });
      const project2 = await createTestProject(owner.id, { name: 'Project 2' });

      await createPendingInvitation(project1.id, member.email, owner.id);
      await createPendingInvitation(project2.id, member.email, owner.id);

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .get('/api/v1/invitations/pending')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.invitations).toHaveLength(2);
    });

    it('should not return expired invitations', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);

      // Create expired invitation
      const expiredAt = new Date();
      expiredAt.setDate(expiredAt.getDate() - 1);

      await testPrisma.pendingInvitation.create({
        data: {
          projectId: project.id,
          email: member.email,
          role: ProjectRole.MEMBER,
          invitedBy: owner.id,
          expiresAt: expiredAt,
        },
      });

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .get('/api/v1/invitations/pending')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.invitations).toHaveLength(0);
    });
  });

  describe('GET /api/v1/projects/:id/invitations', () => {
    it('should return 401 when not authenticated', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      clearMockUser();

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/invitations`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return pending invitations for project as OWNER', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      await createPendingInvitation(project.id, 'user1@example.com', owner.id);
      await createPendingInvitation(project.id, 'user2@example.com', owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/invitations`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.invitations).toHaveLength(2);
    });

    it('should return pending invitations for project as ADMIN', async () => {
      const owner = await createTestUser(testUsers.owner);
      const admin = await createTestUser(testUsers.admin);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);

      await createPendingInvitation(project.id, 'user@example.com', owner.id);

      setMockUser(testUsers.admin);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/invitations`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.invitations).toHaveLength(1);
    });

    it('should return 403 for MEMBER role', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      setMockUser(testUsers.member);

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/invitations`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });
  });

  describe('DELETE /api/v1/projects/:id/invitations/:invitationId', () => {
    it('should cancel invitation as OWNER', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const invitation = await createPendingInvitation(
        project.id,
        'user@example.com',
        owner.id
      );

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/invitations/${invitation.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      // Verify invitation was deleted
      const deletedInvitation = await testPrisma.pendingInvitation.findUnique({
        where: { id: invitation.id },
      });
      expect(deletedInvitation).toBeNull();
    });

    it('should cancel invitation as ADMIN', async () => {
      const owner = await createTestUser(testUsers.owner);
      const admin = await createTestUser(testUsers.admin);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);
      const invitation = await createPendingInvitation(
        project.id,
        'user@example.com',
        owner.id
      );

      setMockUser(testUsers.admin);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/invitations/${invitation.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);
    });

    it('should return 403 for MEMBER role', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);
      const invitation = await createPendingInvitation(
        project.id,
        'user@example.com',
        owner.id
      );

      setMockUser(testUsers.member);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/invitations/${invitation.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });

    it('should return 404 for non-existent invitation', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/invitations/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });
  });
});
