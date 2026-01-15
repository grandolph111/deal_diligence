import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { ProjectRole, TaskStatus, TaskPriority } from '@prisma/client';
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
  assignUserToTask,
  addTagToTask,
  testPrisma,
} from '../utils';

describe('Tasks Module', () => {
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

  describe('GET /api/v1/projects/:id/tasks', () => {
    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser(testUsers.owner);
      const project = await createTestProject(user.id);
      clearMockUser();

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return tasks for project member', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessKanban: true,
      });

      await createTestTask(project.id, owner.id, { title: 'Task 1' });
      await createTestTask(project.id, owner.id, { title: 'Task 2' });

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      await createTestTask(project.id, owner.id, {
        title: 'Todo Task',
        status: TaskStatus.TODO,
      });
      await createTestTask(project.id, owner.id, {
        title: 'In Progress Task',
        status: TaskStatus.IN_PROGRESS,
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks?status=TODO`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('Todo Task');
    });

    it('should filter by priority', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      await createTestTask(project.id, owner.id, {
        title: 'High Priority',
        priority: TaskPriority.HIGH,
      });
      await createTestTask(project.id, owner.id, {
        title: 'Low Priority',
        priority: TaskPriority.LOW,
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks?priority=HIGH`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('High Priority');
    });

    it('should filter by assignee', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      const task1 = await createTestTask(project.id, owner.id, { title: 'Assigned Task' });
      await createTestTask(project.id, owner.id, { title: 'Unassigned Task' });
      await assignUserToTask(task1.id, member.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks?assigneeId=${member.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toBe('Assigned Task');
    });

    it('should search by title', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      await createTestTask(project.id, owner.id, { title: 'Fix authentication bug' });
      await createTestTask(project.id, owner.id, { title: 'Add new feature' });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks?search=authentication`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].title).toContain('authentication');
    });
  });

  describe('GET /api/v1/projects/:id/tasks/board', () => {
    it('should return tasks grouped by status', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      await createTestTask(project.id, owner.id, { status: TaskStatus.TODO });
      await createTestTask(project.id, owner.id, { status: TaskStatus.TODO });
      await createTestTask(project.id, owner.id, { status: TaskStatus.IN_PROGRESS });
      await createTestTask(project.id, owner.id, { status: TaskStatus.COMPLETE });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/board`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveProperty('TODO');
      expect(response.body).toHaveProperty('IN_PROGRESS');
      expect(response.body).toHaveProperty('IN_REVIEW');
      expect(response.body).toHaveProperty('COMPLETE');
      expect(response.body.TODO).toHaveLength(2);
      expect(response.body.IN_PROGRESS).toHaveLength(1);
      expect(response.body.COMPLETE).toHaveLength(1);
    });
  });

  describe('POST /api/v1/projects/:id/tasks', () => {
    it('should create a new task', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', 'Bearer test-token')
        .send({
          title: 'New Task',
          description: 'Task description',
          priority: 'HIGH',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe('New Task');
      expect(response.body.priority).toBe('HIGH');
      expect(response.body.status).toBe('TODO');
    });

    it('should allow MEMBER with kanban permission to create', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessKanban: true,
      });

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'Member Task' })
        .expect(201);

      expect(response.body.title).toBe('Member Task');
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
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'Viewer Task' })
        .expect(403);
    });

    it('should fail with missing title', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', 'Bearer test-token')
        .send({ description: 'No title' })
        .expect(400);
    });
  });

  describe('GET /api/v1/projects/:id/tasks/:taskId', () => {
    it('should return task details', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id, {
        title: 'Detailed Task',
        description: 'Full description',
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.id).toBe(task.id);
      expect(response.body.title).toBe('Detailed Task');
      expect(response.body).toHaveProperty('assignees');
      expect(response.body).toHaveProperty('tags');
    });

    it('should return 404 for non-existent task', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/non-existent-id`)
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });
  });

  describe('PATCH /api/v1/projects/:id/tasks/:taskId', () => {
    it('should update task', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id, { title: 'Original Title' });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({
          title: 'Updated Title',
          priority: 'URGENT',
        })
        .expect(200);

      expect(response.body.title).toBe('Updated Title');
      expect(response.body.priority).toBe('URGENT');
    });

    it('should return 403 for VIEWER', async () => {
      const owner = await createTestUser(testUsers.owner);
      const viewer = await createTestUser(testUsers.viewer);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      await addProjectMember(project.id, viewer.id, ProjectRole.VIEWER, {
        canAccessKanban: true,
      });

      setMockUser(testUsers.viewer);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ title: 'Viewer Update' })
        .expect(403);
    });
  });

  describe('PATCH /api/v1/projects/:id/tasks/:taskId/status', () => {
    it('should update task status', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id, { status: TaskStatus.TODO });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}/status`)
        .set('Authorization', 'Bearer test-token')
        .send({ status: 'IN_PROGRESS' })
        .expect(200);

      expect(response.body.status).toBe('IN_PROGRESS');
    });

    it('should fail with invalid status', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}/tasks/${task.id}/status`)
        .set('Authorization', 'Bearer test-token')
        .send({ status: 'INVALID_STATUS' })
        .expect(400);
    });
  });

  describe('DELETE /api/v1/projects/:id/tasks/:taskId', () => {
    it('should delete task', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      // Verify task is deleted
      const deletedTask = await testPrisma.task.findUnique({
        where: { id: task.id },
      });
      expect(deletedTask).toBeNull();
    });

    it('should cascade delete assignees and tags', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      const task = await createTestTask(project.id, owner.id);
      const tag = await createTestTag(project.id, { name: 'Test Tag' });
      await assignUserToTask(task.id, member.id);
      await addTagToTask(task.id, tag.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      // Verify cascade deletes
      const assignees = await testPrisma.taskAssignee.count({
        where: { taskId: task.id },
      });
      const taskTags = await testPrisma.taskTag.count({
        where: { taskId: task.id },
      });

      expect(assignees).toBe(0);
      expect(taskTags).toBe(0);
    });
  });

  describe('POST /api/v1/projects/:id/tasks/:taskId/assignees', () => {
    it('should add assignee to task', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/assignees`)
        .set('Authorization', 'Bearer test-token')
        .send({ userId: member.id })
        .expect(201);

      expect(response.body).toHaveProperty('assignees');
      expect(response.body.assignees.some((a: any) => a.user.id === member.id)).toBe(true);
    });

    it('should return 404 for non-member assignee', async () => {
      const owner = await createTestUser(testUsers.owner);
      await createTestUser(testUsers.outsider);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/assignees`)
        .set('Authorization', 'Bearer test-token')
        .send({ userId: 'non-existent-id' })
        .expect(404);
    });
  });

  describe('DELETE /api/v1/projects/:id/tasks/:taskId/assignees/:userId', () => {
    it('should remove assignee from task', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);
      const task = await createTestTask(project.id, owner.id);
      await assignUserToTask(task.id, member.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}/assignees/${member.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      // Verify assignee is removed
      const assignee = await testPrisma.taskAssignee.findFirst({
        where: { taskId: task.id, userId: member.id },
      });
      expect(assignee).toBeNull();
    });
  });
});
