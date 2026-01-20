import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { ProjectRole, SubtaskStatus } from '@prisma/client';
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
  createTestSubtask,
  testPrisma,
} from '../utils';

describe('Subtasks Module', () => {
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

  describe('GET /api/v1/projects/:id/tasks/:taskId/subtasks', () => {
    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser(testUsers.owner);
      const project = await createTestProject(user.id);
      const task = await createTestTask(project.id, user.id);
      clearMockUser();

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}/subtasks`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return subtasks ordered by order field', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      await createTestSubtask(task.id, { title: 'Third', order: 2 });
      await createTestSubtask(task.id, { title: 'First', order: 0 });
      await createTestSubtask(task.id, { title: 'Second', order: 1 });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}/subtasks`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(3);
      expect(response.body[0].title).toBe('First');
      expect(response.body[1].title).toBe('Second');
      expect(response.body[2].title).toBe('Third');
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
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}/subtasks`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });
  });

  describe('POST /api/v1/projects/:id/tasks/:taskId/subtasks', () => {
    it('should create a subtask', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/subtasks`)
        .set('Authorization', 'Bearer test-token')
        .send({
          title: 'New Subtask',
          description: 'Subtask description',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe('New Subtask');
      expect(response.body.status).toBe('TODO');
    });

    it('should create subtask with assignee', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/subtasks`)
        .set('Authorization', 'Bearer test-token')
        .send({
          title: 'Assigned Subtask',
          assigneeId: member.id,
        })
        .expect(201);

      expect(response.body.assigneeId).toBe(member.id);
      expect(response.body.assignee).not.toBeNull();
    });

    it('should auto-increment order for new subtasks', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/subtasks`)
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'Subtask 1' })
        .expect(201);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/subtasks`)
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'Subtask 2' })
        .expect(201);

      expect(response.body.order).toBe(1);
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
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/subtasks`)
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'Viewer subtask' })
        .expect(403);
    });
  });

  describe('PATCH /api/v1/projects/:id/tasks/:taskId/subtasks/:subtaskId', () => {
    it('should update subtask', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const subtask = await createTestSubtask(task.id, { title: 'Original' });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}/subtasks/${subtask.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({
          title: 'Updated',
          status: 'IN_PROGRESS',
        })
        .expect(200);

      expect(response.body.title).toBe('Updated');
      expect(response.body.status).toBe('IN_PROGRESS');
    });

    it('should update subtask status', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const subtask = await createTestSubtask(task.id, { status: SubtaskStatus.TODO });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}/subtasks/${subtask.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ status: 'COMPLETE' })
        .expect(200);

      expect(response.body.status).toBe('COMPLETE');
    });
  });

  describe('DELETE /api/v1/projects/:id/tasks/:taskId/subtasks/:subtaskId', () => {
    it('should delete subtask', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const subtask = await createTestSubtask(task.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}/subtasks/${subtask.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      const deletedSubtask = await testPrisma.subtask.findUnique({
        where: { id: subtask.id },
      });
      expect(deletedSubtask).toBeNull();
    });
  });

  describe('PATCH /api/v1/projects/:id/tasks/:taskId/subtasks/reorder', () => {
    it('should reorder subtasks', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      const subtask1 = await createTestSubtask(task.id, { title: 'First', order: 0 });
      const subtask2 = await createTestSubtask(task.id, { title: 'Second', order: 1 });
      const subtask3 = await createTestSubtask(task.id, { title: 'Third', order: 2 });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}/subtasks/reorder`)
        .set('Authorization', 'Bearer test-token')
        .send({
          subtaskIds: [subtask3.id, subtask1.id, subtask2.id],
        })
        .expect(200);

      expect(response.body[0].title).toBe('Third');
      expect(response.body[1].title).toBe('First');
      expect(response.body[2].title).toBe('Second');
    });

    it('should reject invalid subtask IDs', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      await createTestSubtask(task.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}/subtasks/reorder`)
        .set('Authorization', 'Bearer test-token')
        .send({
          subtaskIds: ['non-existent-id'],
        })
        .expect(400);
    });
  });

  describe('Cascade Delete', () => {
    it('should delete subtasks when task is deleted', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      await createTestSubtask(task.id, { title: 'Subtask 1' });
      await createTestSubtask(task.id, { title: 'Subtask 2' });

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      const subtaskCount = await testPrisma.subtask.count({
        where: { taskId: task.id },
      });
      expect(subtaskCount).toBe(0);
    });
  });
});
