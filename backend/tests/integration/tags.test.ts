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
  createTestTask,
  createTestTag,
  addTagToTask,
  testPrisma,
} from '../utils';

describe('Tags Module', () => {
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

  describe('GET /api/v1/projects/:id/tags', () => {
    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser(testUsers.owner);
      const project = await createTestProject(user.id);
      clearMockUser();

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/tags`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return project tags', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      await createTestTag(project.id, { name: 'Bug', color: '#FF0000' });
      await createTestTag(project.id, { name: 'Feature', color: '#00FF00' });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tags`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body.some((t: any) => t.name === 'Bug')).toBe(true);
      expect(response.body.some((t: any) => t.name === 'Feature')).toBe(true);
    });

    it('should return tags for VIEWER with kanban access', async () => {
      const owner = await createTestUser(testUsers.owner);
      const viewer = await createTestUser(testUsers.viewer);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, viewer.id, ProjectRole.VIEWER, {
        canAccessKanban: true,
      });

      await createTestTag(project.id, { name: 'Tag1' });

      setMockUser(testUsers.viewer);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tags`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(1);
    });
  });

  describe('POST /api/v1/projects/:id/tags', () => {
    it('should create a new tag', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/tags`)
        .set('Authorization', 'Bearer test-token')
        .send({
          name: 'New Tag',
          color: '#3366FF',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('New Tag');
      expect(response.body.color).toBe('#3366FF');
    });

    it('should allow MEMBER to create tag', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessKanban: true,
      });

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/tags`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Member Tag' })
        .expect(201);

      expect(response.body.name).toBe('Member Tag');
    });

    it('should return 403 for VIEWER', async () => {
      const owner = await createTestUser(testUsers.owner);
      const viewer = await createTestUser(testUsers.viewer);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, viewer.id, ProjectRole.VIEWER, {
        canAccessKanban: true,
      });

      setMockUser(testUsers.viewer);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tags`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Viewer Tag' })
        .expect(403);
    });

    it('should use default color if not provided', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/tags`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Default Color Tag' })
        .expect(201);

      expect(response.body.color).toBe('#6B7280');
    });

    it('should fail with duplicate tag name in same project', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      await createTestTag(project.id, { name: 'Existing Tag' });

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tags`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Existing Tag' })
        .expect(409);
    });

    it('should allow same tag name in different projects', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project1 = await createTestProject(owner.id, { name: 'Project 1' });
      const project2 = await createTestProject(owner.id, { name: 'Project 2' });
      await createTestTag(project1.id, { name: 'Bug' });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project2.id}/tags`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Bug' })
        .expect(201);

      expect(response.body.name).toBe('Bug');
    });
  });

  describe('DELETE /api/v1/projects/:id/tags/:tagId', () => {
    it('should delete tag as OWNER', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const tag = await createTestTag(project.id, { name: 'To Delete' });

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tags/${tag.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      // Verify tag is deleted
      const deletedTag = await testPrisma.tag.findUnique({
        where: { id: tag.id },
      });
      expect(deletedTag).toBeNull();
    });

    it('should delete tag as ADMIN', async () => {
      const owner = await createTestUser(testUsers.owner);
      const admin = await createTestUser(testUsers.admin);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);
      const tag = await createTestTag(project.id, { name: 'Admin Delete' });

      setMockUser(testUsers.admin);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tags/${tag.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);
    });

    it('should return 403 for MEMBER', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);
      const tag = await createTestTag(project.id, { name: 'No Delete' });

      setMockUser(testUsers.member);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tags/${tag.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });

    it('should remove tag from tasks when deleted', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const tag = await createTestTag(project.id, { name: 'Cascade Test' });
      await addTagToTask(task.id, tag.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tags/${tag.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      // Verify TaskTag is removed
      const taskTags = await testPrisma.taskTag.count({
        where: { tagId: tag.id },
      });
      expect(taskTags).toBe(0);
    });
  });

  describe('POST /api/v1/projects/:id/tasks/:taskId/tags', () => {
    it('should add tag to task', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const tag = await createTestTag(project.id, { name: 'Add Me' });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/tags`)
        .set('Authorization', 'Bearer test-token')
        .send({ tagId: tag.id })
        .expect(201);

      expect(response.body.tags.some((t: any) => t.tag.id === tag.id)).toBe(true);
    });

    it('should return 404 for non-existent tag', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/tags`)
        .set('Authorization', 'Bearer test-token')
        .send({ tagId: 'non-existent-id' })
        .expect(404);
    });

    it('should return 409 for duplicate tag on task', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const tag = await createTestTag(project.id, { name: 'Already Added' });
      await addTagToTask(task.id, tag.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/tags`)
        .set('Authorization', 'Bearer test-token')
        .send({ tagId: tag.id })
        .expect(409);
    });
  });

  describe('DELETE /api/v1/projects/:id/tasks/:taskId/tags/:tagId', () => {
    it('should remove tag from task', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const tag = await createTestTag(project.id, { name: 'Remove Me' });
      await addTagToTask(task.id, tag.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}/tags/${tag.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      // Verify tag is removed from task
      const taskTag = await testPrisma.taskTag.findUnique({
        where: { taskId_tagId: { taskId: task.id, tagId: tag.id } },
      });
      expect(taskTag).toBeNull();
    });
  });
});
