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

describe('Members Module', () => {
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

  describe('GET /api/v1/projects/:id/members', () => {
    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser(testUsers.owner);
      const project = await createTestProject(user.id);
      clearMockUser();

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/members`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return members list for project member', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/members`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body.some((m: any) => m.role === 'OWNER')).toBe(true);
      expect(response.body.some((m: any) => m.role === 'MEMBER')).toBe(true);
    });

    it('should return 403 for non-member', async () => {
      const owner = await createTestUser(testUsers.owner);
      await createTestUser(testUsers.outsider);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.outsider);

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/members`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });

    it('should include user details in response', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/members`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body[0]).toHaveProperty('user');
      expect(response.body[0].user).toHaveProperty('email');
      expect(response.body[0].user).toHaveProperty('name');
    });
  });

  describe('POST /api/v1/projects/:id/members/invite', () => {
    it('should invite a new member as OWNER', async () => {
      const owner = await createTestUser(testUsers.owner);
      const newMember = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/members/invite`)
        .set('Authorization', 'Bearer test-token')
        .send({
          email: testUsers.member.email,
          role: 'MEMBER',
        })
        .expect(201);

      expect(response.body.userId).toBe(newMember.id);
      expect(response.body.role).toBe('MEMBER');
    });

    it('should invite a new member as ADMIN', async () => {
      const owner = await createTestUser(testUsers.owner);
      const admin = await createTestUser(testUsers.admin);
      await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);

      setMockUser(testUsers.admin);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/members/invite`)
        .set('Authorization', 'Bearer test-token')
        .send({
          email: testUsers.member.email,
          role: 'MEMBER',
        })
        .expect(201);

      expect(response.body.role).toBe('MEMBER');
    });

    it('should return 403 for MEMBER role', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      await createTestUser(testUsers.viewer);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      setMockUser(testUsers.member);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/members/invite`)
        .set('Authorization', 'Bearer test-token')
        .send({
          email: testUsers.viewer.email,
          role: 'VIEWER',
        })
        .expect(403);
    });

    it('should return 404 for non-existent user email', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/members/invite`)
        .set('Authorization', 'Bearer test-token')
        .send({
          email: 'nonexistent@test.com',
          role: 'MEMBER',
        })
        .expect(404);
    });

    it('should return 409 for already invited member', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/members/invite`)
        .set('Authorization', 'Bearer test-token')
        .send({
          email: testUsers.member.email,
          role: 'ADMIN',
        })
        .expect(409);
    });

    it('should prevent inviting as OWNER', async () => {
      const owner = await createTestUser(testUsers.owner);
      await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/members/invite`)
        .set('Authorization', 'Bearer test-token')
        .send({
          email: testUsers.member.email,
          role: 'OWNER',
        })
        .expect(400);
    });
  });

  describe('PATCH /api/v1/projects/:id/members/:memberId', () => {
    it('should update member role as OWNER', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      const membership = await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}/members/${membership.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ role: 'ADMIN' })
        .expect(200);

      expect(response.body.role).toBe('ADMIN');
    });

    it('should update member permissions', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      const membership = await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}/members/${membership.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ permissions: { canAccessKanban: true, canUploadDocs: false } })
        .expect(200);

      expect(response.body.permissions).toEqual({
        canAccessKanban: true,
        canUploadDocs: false,
      });
    });

    it('should return 403 for MEMBER trying to update', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const viewer = await createTestUser(testUsers.viewer);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);
      const viewerMembership = await addProjectMember(project.id, viewer.id, ProjectRole.VIEWER);

      setMockUser(testUsers.member);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}/members/${viewerMembership.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ role: 'MEMBER' })
        .expect(403);
    });

    it('should prevent changing OWNER role', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      // Find owner's membership
      const ownerMembership = await testPrisma.projectMember.findFirst({
        where: { projectId: project.id, userId: owner.id },
      });

      setMockUser(testUsers.owner);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}/members/${ownerMembership!.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ role: 'ADMIN' })
        .expect(400);
    });
  });

  describe('DELETE /api/v1/projects/:id/members/:memberId', () => {
    it('should remove member as OWNER', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      const membership = await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/members/${membership.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      // Verify member is removed
      const deletedMembership = await testPrisma.projectMember.findUnique({
        where: { id: membership.id },
      });
      expect(deletedMembership).toBeNull();
    });

    it('should prevent removing OWNER', async () => {
      const owner = await createTestUser(testUsers.owner);
      const admin = await createTestUser(testUsers.admin);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);

      const ownerMembership = await testPrisma.projectMember.findFirst({
        where: { projectId: project.id, userId: owner.id },
      });

      setMockUser(testUsers.admin);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/members/${ownerMembership!.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });
  });

  describe('POST /api/v1/projects/:id/members/leave', () => {
    it('should allow member to leave project', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      setMockUser(testUsers.member);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/members/leave`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      // Verify member left
      const membership = await testPrisma.projectMember.findFirst({
        where: { projectId: project.id, userId: member.id },
      });
      expect(membership).toBeNull();
    });

    it('should prevent OWNER from leaving', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/members/leave`)
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });
  });

  describe('POST /api/v1/projects/:id/members/transfer-ownership', () => {
    it('should transfer ownership to another member', async () => {
      const owner = await createTestUser(testUsers.owner);
      const admin = await createTestUser(testUsers.admin);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/members/transfer-ownership`)
        .set('Authorization', 'Bearer test-token')
        .send({ newOwnerId: admin.id })
        .expect(200);

      // Verify ownership transfer
      const oldOwner = await testPrisma.projectMember.findFirst({
        where: { projectId: project.id, userId: owner.id },
      });
      const newOwner = await testPrisma.projectMember.findFirst({
        where: { projectId: project.id, userId: admin.id },
      });

      expect(oldOwner?.role).toBe('ADMIN');
      expect(newOwner?.role).toBe('OWNER');
    });

    it('should return 403 for non-OWNER', async () => {
      const owner = await createTestUser(testUsers.owner);
      const admin = await createTestUser(testUsers.admin);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      setMockUser(testUsers.admin);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/members/transfer-ownership`)
        .set('Authorization', 'Bearer test-token')
        .send({ newOwnerId: member.id })
        .expect(403);
    });

    it('should return 404 for non-member target', async () => {
      const owner = await createTestUser(testUsers.owner);
      await createTestUser(testUsers.outsider);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/members/transfer-ownership`)
        .set('Authorization', 'Bearer test-token')
        .send({ newOwnerId: 'non-existent-id' })
        .expect(404);
    });
  });
});
