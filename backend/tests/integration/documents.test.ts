import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import { ProjectRole, DocumentStatus } from '@prisma/client';
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

describe('Documents Module', () => {
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

  // Helper to create a test document
  async function createTestDocument(
    projectId: string,
    uploadedById: string,
    data: { name?: string; status?: DocumentStatus } = {}
  ) {
    return testPrisma.document.create({
      data: {
        projectId,
        name: data.name || 'test-document.pdf',
        s3Key: `projects/${projectId}/documents/test-key/test-document.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        uploadedById,
        processingStatus: data.status || 'COMPLETE',
      },
    });
  }

  describe('GET /api/v1/projects/:id/documents', () => {
    it('should return 401 when not authenticated', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      clearMockUser();

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/documents`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return empty array when project has no documents', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.documents).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should return documents for project member', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      await createTestDocument(project.id, owner.id, { name: 'doc1.pdf' });
      await createTestDocument(project.id, owner.id, { name: 'doc2.pdf' });

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.documents).toHaveLength(2);
      expect(response.body.pagination.total).toBe(2);
    });

    it('should return 403 for non-member', async () => {
      const owner = await createTestUser(testUsers.owner);
      await createTestUser(testUsers.outsider);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.outsider);

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });

    it('should filter by document type', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      await testPrisma.document.create({
        data: {
          projectId: project.id,
          name: 'legal.pdf',
          s3Key: 'key1',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          uploadedById: owner.id,
          documentType: 'LEGAL',
          processingStatus: 'COMPLETE',
        },
      });

      await testPrisma.document.create({
        data: {
          projectId: project.id,
          name: 'financial.pdf',
          s3Key: 'key2',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          uploadedById: owner.id,
          documentType: 'FINANCIAL',
          processingStatus: 'COMPLETE',
        },
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/documents?documentType=LEGAL`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.documents).toHaveLength(1);
      expect(response.body.documents[0].documentType).toBe('LEGAL');
    });

    it('should paginate results', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      // Create 5 documents
      for (let i = 0; i < 5; i++) {
        await createTestDocument(project.id, owner.id, { name: `doc${i}.pdf` });
      }

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/documents?page=1&limit=2`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.documents).toHaveLength(2);
      expect(response.body.pagination.total).toBe(5);
      expect(response.body.pagination.totalPages).toBe(3);
    });
  });

  describe('GET /api/v1/projects/:id/documents/:documentId', () => {
    it('should return document details', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const document = await createTestDocument(project.id, owner.id, {
        name: 'test.pdf',
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/documents/${document.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.id).toBe(document.id);
      expect(response.body.name).toBe('test.pdf');
    });

    it('should return 404 for non-existent document', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/documents/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });

    it('should return 403 for non-member', async () => {
      const owner = await createTestUser(testUsers.owner);
      await createTestUser(testUsers.outsider);
      const project = await createTestProject(owner.id);
      const document = await createTestDocument(project.id, owner.id);

      setMockUser(testUsers.outsider);

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/documents/${document.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });
  });

  describe('POST /api/v1/projects/:id/documents/initiate-upload', () => {
    it('should return 401 when not authenticated', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      clearMockUser();

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/documents/initiate-upload`)
        .set('Authorization', 'Bearer invalid-token')
        .send({
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        })
        .expect(401);
    });

    it('should return 500 when S3 is not configured', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      setMockUser(testUsers.owner);

      // Note: S3 is not configured in tests, so this should fail
      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/documents/initiate-upload`)
        .set('Authorization', 'Bearer test-token')
        .send({
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        })
        .expect(500);

      expect(response.body.error).toContain('S3');
    });

    it('should validate request body', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/documents/initiate-upload`)
        .set('Authorization', 'Bearer test-token')
        .send({
          // Missing required fields
        })
        .expect(400);
    });

    it('should return 403 for members without upload permission', async () => {
      const owner = await createTestUser(testUsers.owner);
      const viewer = await createTestUser(testUsers.viewer);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, viewer.id, ProjectRole.VIEWER, {
        canUploadDocs: false,
      });

      setMockUser(testUsers.viewer);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/documents/initiate-upload`)
        .set('Authorization', 'Bearer test-token')
        .send({
          filename: 'test.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
        })
        .expect(403);
    });
  });

  describe('POST /api/v1/projects/:id/documents/confirm-upload', () => {
    it('should confirm upload and change status to COMPLETE', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const document = await createTestDocument(project.id, owner.id, {
        status: 'PENDING',
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/documents/confirm-upload`)
        .set('Authorization', 'Bearer test-token')
        .send({ documentId: document.id })
        .expect(200);

      expect(response.body.processingStatus).toBe('COMPLETE');
    });

    it('should return 400 for already confirmed document', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const document = await createTestDocument(project.id, owner.id, {
        status: 'COMPLETE',
      });

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/documents/confirm-upload`)
        .set('Authorization', 'Bearer test-token')
        .send({ documentId: document.id })
        .expect(400);
    });

    it('should return 404 for non-existent document', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/documents/confirm-upload`)
        .set('Authorization', 'Bearer test-token')
        .send({ documentId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });
  });

  describe('DELETE /api/v1/projects/:id/documents/:documentId', () => {
    it('should delete document as ADMIN', async () => {
      const owner = await createTestUser(testUsers.owner);
      const admin = await createTestUser(testUsers.admin);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);
      const document = await createTestDocument(project.id, owner.id);

      setMockUser(testUsers.admin);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/documents/${document.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      // Verify document was deleted
      const deletedDocument = await testPrisma.document.findUnique({
        where: { id: document.id },
      });
      expect(deletedDocument).toBeNull();
    });

    it('should return 403 for MEMBER role', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);
      const document = await createTestDocument(project.id, owner.id);

      setMockUser(testUsers.member);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/documents/${document.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });

    it('should return 404 for non-existent document', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/documents/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });
  });
});
