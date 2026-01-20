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
  createTestComment,
  testPrisma,
} from '../utils';

describe('Comments Module', () => {
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

  describe('GET /api/v1/projects/:id/tasks/:taskId/comments', () => {
    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser(testUsers.owner);
      const project = await createTestProject(user.id);
      const task = await createTestTask(project.id, user.id);
      clearMockUser();

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}/comments`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return comments for project member with kanban access', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessKanban: true,
      });

      const task = await createTestTask(project.id, owner.id);
      await createTestComment(task.id, owner.id, { content: 'Comment 1' });
      await createTestComment(task.id, member.id, { content: 'Comment 2' });

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}/comments`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].content).toBe('Comment 1');
      expect(response.body[1].content).toBe('Comment 2');
    });

    it('should return 403 for member without kanban permission', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessKanban: false,
      });

      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.member);

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}/comments`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });
  });

  describe('POST /api/v1/projects/:id/tasks/:taskId/comments', () => {
    it('should create a comment', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/comments`)
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'New comment content' })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.content).toBe('New comment content');
      expect(response.body).toHaveProperty('author');
    });

    it('should return 403 for VIEWER', async () => {
      const owner = await createTestUser(testUsers.owner);
      const viewer = await createTestUser(testUsers.viewer);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, viewer.id, ProjectRole.VIEWER, {
        canAccessKanban: true,
      });
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.viewer);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/comments`)
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'Viewer comment' })
        .expect(403);
    });

    it('should fail with empty content', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/comments`)
        .set('Authorization', 'Bearer test-token')
        .send({ content: '' })
        .expect(400);
    });
  });

  describe('PATCH /api/v1/projects/:id/tasks/:taskId/comments/:commentId', () => {
    it('should allow author to update their comment', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const comment = await createTestComment(task.id, owner.id, { content: 'Original' });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}/comments/${comment.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'Updated content' })
        .expect(200);

      expect(response.body.content).toBe('Updated content');
    });

    it('should not allow non-author to update comment', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);
      const task = await createTestTask(project.id, owner.id);
      const comment = await createTestComment(task.id, owner.id, { content: 'Owner comment' });

      setMockUser(testUsers.member);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}/comments/${comment.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ content: 'Attempted update' })
        .expect(403);
    });
  });

  describe('DELETE /api/v1/projects/:id/tasks/:taskId/comments/:commentId', () => {
    it('should allow author to delete their comment', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const comment = await createTestComment(task.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}/comments/${comment.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      const deletedComment = await testPrisma.taskComment.findUnique({
        where: { id: comment.id },
      });
      expect(deletedComment).toBeNull();
    });

    it('should allow ADMIN to delete any comment', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const admin = await createTestUser(testUsers.admin);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);
      await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);
      const task = await createTestTask(project.id, owner.id);
      const comment = await createTestComment(task.id, member.id, { content: 'Member comment' });

      setMockUser(testUsers.admin);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}/comments/${comment.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      const deletedComment = await testPrisma.taskComment.findUnique({
        where: { id: comment.id },
      });
      expect(deletedComment).toBeNull();
    });

    it('should not allow MEMBER to delete others comment', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);
      const task = await createTestTask(project.id, owner.id);
      const comment = await createTestComment(task.id, owner.id, { content: 'Owner comment' });

      setMockUser(testUsers.member);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}/comments/${comment.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });
  });

  describe('Cascade Delete', () => {
    it('should delete comments when task is deleted', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      await createTestComment(task.id, owner.id, { content: 'Comment 1' });
      await createTestComment(task.id, owner.id, { content: 'Comment 2' });

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      const commentCount = await testPrisma.taskComment.count({
        where: { taskId: task.id },
      });
      expect(commentCount).toBe(0);
    });
  });
});
