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
  createTestDocument,
  linkDocumentToTask,
  testPrisma,
} from '../utils';

describe('Task-Documents Module', () => {
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

  describe('GET /api/v1/projects/:id/tasks/:taskId/documents', () => {
    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser(testUsers.owner);
      const project = await createTestProject(user.id);
      const task = await createTestTask(project.id, user.id);
      clearMockUser();

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return empty array when no documents linked', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return linked documents for task', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const doc = await createTestDocument(project.id, owner.id, {
        name: 'contract.pdf',
      });

      await linkDocumentToTask(task.id, doc.id, owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].documentId).toBe(doc.id);
      expect(response.body[0].document.name).toBe('contract.pdf');
      expect(response.body[0].linkedBy.id).toBe(owner.id);
    });

    it('should return 403 for user without Kanban access', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessKanban: false,
      });

      setMockUser(testUsers.member);

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });

    it('should allow member with Kanban access', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessKanban: true,
      });

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return 404 for non-existent task', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/non-existent-id/documents`)
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });
  });

  describe('POST /api/v1/projects/:id/tasks/:taskId/documents', () => {
    it('should link document to task', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const doc = await createTestDocument(project.id, owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .send({ documentId: doc.id })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.taskId).toBe(task.id);
      expect(response.body.documentId).toBe(doc.id);
      expect(response.body.linkedById).toBe(owner.id);
    });

    it('should create audit log entry', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const doc = await createTestDocument(project.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .send({ documentId: doc.id })
        .expect(201);

      // Verify audit log was created
      const auditLog = await testPrisma.auditLog.findFirst({
        where: {
          projectId: project.id,
          action: 'task_document.link',
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.userId).toBe(owner.id);
    });

    it('should return 409 when document already linked', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const doc = await createTestDocument(project.id, owner.id);

      await linkDocumentToTask(task.id, doc.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .send({ documentId: doc.id })
        .expect(409);
    });

    it('should return 404 for document from different project', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project1 = await createTestProject(owner.id);
      const project2 = await createTestProject(owner.id, { name: 'Project 2' });
      const task = await createTestTask(project1.id, owner.id);
      const doc = await createTestDocument(project2.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project1.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .send({ documentId: doc.id })
        .expect(404);
    });

    it('should return 404 for non-existent document', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .send({ documentId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });

    it('should return 403 for VIEWER role', async () => {
      const owner = await createTestUser(testUsers.owner);
      const viewer = await createTestUser(testUsers.viewer);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const doc = await createTestDocument(project.id, owner.id);

      await addProjectMember(project.id, viewer.id, ProjectRole.VIEWER, {
        canAccessKanban: true,
      });

      setMockUser(testUsers.viewer);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .send({ documentId: doc.id })
        .expect(403);
    });

    it('should allow MEMBER to link document', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const doc = await createTestDocument(project.id, owner.id);

      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessKanban: true,
      });

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .send({ documentId: doc.id })
        .expect(201);

      expect(response.body.linkedById).toBe(member.id);
    });

    it('should return 400 for invalid document ID format', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .send({ documentId: 'not-a-uuid' })
        .expect(400);
    });

    it('should return 400 for missing document ID', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .send({})
        .expect(400);
    });
  });

  describe('DELETE /api/v1/projects/:id/tasks/:taskId/documents/:documentId', () => {
    it('should unlink document from task', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const doc = await createTestDocument(project.id, owner.id);

      await linkDocumentToTask(task.id, doc.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}/documents/${doc.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      // Verify link was removed
      const link = await testPrisma.taskDocument.findUnique({
        where: {
          taskId_documentId: {
            taskId: task.id,
            documentId: doc.id,
          },
        },
      });
      expect(link).toBeNull();
    });

    it('should create audit log entry for unlink', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const doc = await createTestDocument(project.id, owner.id);

      await linkDocumentToTask(task.id, doc.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}/documents/${doc.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      // Verify audit log was created
      const auditLog = await testPrisma.auditLog.findFirst({
        where: {
          projectId: project.id,
          action: 'task_document.unlink',
        },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.userId).toBe(owner.id);
    });

    it('should return 404 when link does not exist', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const doc = await createTestDocument(project.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}/documents/${doc.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });

    it('should return 403 for VIEWER role', async () => {
      const owner = await createTestUser(testUsers.owner);
      const viewer = await createTestUser(testUsers.viewer);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const doc = await createTestDocument(project.id, owner.id);

      await linkDocumentToTask(task.id, doc.id, owner.id);
      await addProjectMember(project.id, viewer.id, ProjectRole.VIEWER, {
        canAccessKanban: true,
      });

      setMockUser(testUsers.viewer);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}/documents/${doc.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });

    it('should allow MEMBER to unlink document', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);
      const doc = await createTestDocument(project.id, owner.id);

      await linkDocumentToTask(task.id, doc.id, owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessKanban: true,
      });

      setMockUser(testUsers.member);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/tasks/${task.id}/documents/${doc.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);
    });
  });

  describe('IDOR Protection', () => {
    it('should not access task from another project', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project1 = await createTestProject(owner.id);
      const project2 = await createTestProject(owner.id, { name: 'Project 2' });
      const task = await createTestTask(project1.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .get(`/api/v1/projects/${project2.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });

    it('should not link document from another project', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project1 = await createTestProject(owner.id);
      const project2 = await createTestProject(owner.id, { name: 'Project 2' });
      const task = await createTestTask(project1.id, owner.id);
      const doc = await createTestDocument(project2.id, owner.id);

      setMockUser(testUsers.owner);

      // Try to link document from project2 to task in project1
      await createTestApp()
        .post(`/api/v1/projects/${project1.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .send({ documentId: doc.id })
        .expect(404);
    });
  });

  describe('Multiple Documents', () => {
    it('should return all linked documents ordered by linkedAt desc', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const task = await createTestTask(project.id, owner.id);

      const doc1 = await createTestDocument(project.id, owner.id, { name: 'doc1.pdf' });
      const doc2 = await createTestDocument(project.id, owner.id, { name: 'doc2.pdf' });
      const doc3 = await createTestDocument(project.id, owner.id, { name: 'doc3.pdf' });

      // Link in order: doc1, doc2, doc3
      await linkDocumentToTask(task.id, doc1.id, owner.id);
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));
      await linkDocumentToTask(task.id, doc2.id, owner.id);
      await new Promise((resolve) => setTimeout(resolve, 10));
      await linkDocumentToTask(task.id, doc3.id, owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/${task.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(3);
      // Most recently linked should be first
      expect(response.body[0].document.name).toBe('doc3.pdf');
      expect(response.body[1].document.name).toBe('doc2.pdf');
      expect(response.body[2].document.name).toBe('doc1.pdf');
    });
  });
});
