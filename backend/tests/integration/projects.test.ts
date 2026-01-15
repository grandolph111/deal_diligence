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

describe('Projects Module', () => {
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

  describe('GET /api/v1/projects', () => {
    it('should return 401 when not authenticated', async () => {
      clearMockUser();

      await createTestApp()
        .get('/api/v1/projects')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return empty array when user has no projects', async () => {
      const user = await createTestUser(testUsers.owner);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get('/api/v1/projects')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return user projects with counts', async () => {
      const user = await createTestUser(testUsers.owner);
      await createTestProject(user.id, { name: 'Project 1' });
      await createTestProject(user.id, { name: 'Project 2' });
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get('/api/v1/projects')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('name');
      expect(response.body[0]).toHaveProperty('_count');
    });

    it('should only return projects user is a member of', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);

      await createTestProject(owner.id, { name: 'Owner Project' });
      const sharedProject = await createTestProject(owner.id, { name: 'Shared Project' });
      await addProjectMember(sharedProject.id, member.id, ProjectRole.MEMBER);

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .get('/api/v1/projects')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Shared Project');
    });
  });

  describe('POST /api/v1/projects', () => {
    it('should return 401 when not authenticated', async () => {
      clearMockUser();

      await createTestApp()
        .post('/api/v1/projects')
        .set('Authorization', 'Bearer invalid-token')
        .send({ name: 'New Project' })
        .expect(401);
    });

    it('should create a new project', async () => {
      await createTestUser(testUsers.owner);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post('/api/v1/projects')
        .set('Authorization', 'Bearer test-token')
        .send({
          name: 'New Project',
          description: 'A new test project',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('New Project');
      expect(response.body.description).toBe('A new test project');
    });

    it('should make the creator an OWNER', async () => {
      const user = await createTestUser(testUsers.owner);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post('/api/v1/projects')
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'New Project' })
        .expect(201);

      const membership = await testPrisma.projectMember.findFirst({
        where: {
          projectId: response.body.id,
          userId: user.id,
        },
      });

      expect(membership).not.toBeNull();
      expect(membership?.role).toBe(ProjectRole.OWNER);
    });

    it('should fail with missing name', async () => {
      await createTestUser(testUsers.owner);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post('/api/v1/projects')
        .set('Authorization', 'Bearer test-token')
        .send({ description: 'No name provided' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should create project without description', async () => {
      await createTestUser(testUsers.owner);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post('/api/v1/projects')
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Minimal Project' })
        .expect(201);

      expect(response.body.name).toBe('Minimal Project');
      expect(response.body.description).toBeNull();
    });
  });

  describe('GET /api/v1/projects/:id', () => {
    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser(testUsers.owner);
      const project = await createTestProject(user.id);
      clearMockUser();

      await createTestApp()
        .get(`/api/v1/projects/${project.id}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return project details for member', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id, { name: 'Test Project' });
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.id).toBe(project.id);
      expect(response.body.name).toBe('Test Project');
      expect(response.body).toHaveProperty('_count');
    });

    it('should return 403 for non-member', async () => {
      const owner = await createTestUser(testUsers.owner);
      await createTestUser(testUsers.outsider);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.outsider);

      await createTestApp()
        .get(`/api/v1/projects/${project.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });

    it('should return 404 for non-existent project', async () => {
      await createTestUser(testUsers.owner);
      setMockUser(testUsers.owner);

      await createTestApp()
        .get('/api/v1/projects/non-existent-id')
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });
  });

  describe('PATCH /api/v1/projects/:id', () => {
    it('should update project as OWNER', async () => {
      const user = await createTestUser(testUsers.owner);
      const project = await createTestProject(user.id, { name: 'Original Name' });
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Updated Name', description: 'New description' })
        .expect(200);

      expect(response.body.name).toBe('Updated Name');
      expect(response.body.description).toBe('New description');
    });

    it('should update project as ADMIN', async () => {
      const owner = await createTestUser(testUsers.owner);
      const admin = await createTestUser(testUsers.admin);
      const project = await createTestProject(owner.id, { name: 'Original' });
      await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);

      setMockUser(testUsers.admin);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Admin Update' })
        .expect(200);

      expect(response.body.name).toBe('Admin Update');
    });

    it('should return 403 for MEMBER role', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      setMockUser(testUsers.member);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Unauthorized Update' })
        .expect(403);
    });

    it('should return 403 for VIEWER role', async () => {
      const owner = await createTestUser(testUsers.owner);
      const viewer = await createTestUser(testUsers.viewer);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, viewer.id, ProjectRole.VIEWER);

      setMockUser(testUsers.viewer);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Viewer Update' })
        .expect(403);
    });
  });

  describe('DELETE /api/v1/projects/:id', () => {
    it('should delete project as OWNER', async () => {
      const user = await createTestUser(testUsers.owner);
      const project = await createTestProject(user.id);
      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      // Verify project is deleted
      const deletedProject = await testPrisma.project.findUnique({
        where: { id: project.id },
      });
      expect(deletedProject).toBeNull();
    });

    it('should return 403 for ADMIN role', async () => {
      const owner = await createTestUser(testUsers.owner);
      const admin = await createTestUser(testUsers.admin);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);

      setMockUser(testUsers.admin);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);

      // Verify project still exists
      const existingProject = await testPrisma.project.findUnique({
        where: { id: project.id },
      });
      expect(existingProject).not.toBeNull();
    });

    it('should cascade delete members and tasks', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      // Create a task
      await testPrisma.task.create({
        data: {
          projectId: project.id,
          createdById: owner.id,
          title: 'Test Task',
        },
      });

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      // Verify cascade deletes
      const members = await testPrisma.projectMember.count({
        where: { projectId: project.id },
      });
      const tasks = await testPrisma.task.count({
        where: { projectId: project.id },
      });

      expect(members).toBe(0);
      expect(tasks).toBe(0);
    });
  });
});
