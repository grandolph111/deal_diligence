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
  createTestFolder,
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
  async function createTestDocumentLocal(
    projectId: string,
    uploadedById: string,
    data: { name?: string; status?: DocumentStatus; folderId?: string } = {}
  ) {
    return testPrisma.document.create({
      data: {
        projectId,
        name: data.name || 'test-document.pdf',
        s3Key: `projects/${projectId}/documents/${Date.now()}-${Math.random().toString(36).slice(2)}/test-document.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        uploadedById,
        folderId: data.folderId || null,
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

      await createTestDocumentLocal(project.id, owner.id, { name: 'doc1.pdf' });
      await createTestDocumentLocal(project.id, owner.id, { name: 'doc2.pdf' });

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
        await createTestDocumentLocal(project.id, owner.id, { name: `doc${i}.pdf` });
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
      const document = await createTestDocumentLocal(project.id, owner.id, {
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
      const document = await createTestDocumentLocal(project.id, owner.id);

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
      const document = await createTestDocumentLocal(project.id, owner.id, {
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
      const document = await createTestDocumentLocal(project.id, owner.id, {
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
      const document = await createTestDocumentLocal(project.id, owner.id);

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
      const document = await createTestDocumentLocal(project.id, owner.id);

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

  describe('GET /api/v1/projects/:id/documents with folderId filter', () => {
    it('should filter documents by folderId', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      // Create two folders
      const folder1 = await createTestFolder(project.id, { name: 'Folder 1' });
      const folder2 = await createTestFolder(project.id, { name: 'Folder 2' });

      // Create documents in different folders
      await createTestDocumentLocal(project.id, owner.id, {
        name: 'doc-in-folder1.pdf',
        folderId: folder1.id,
      });
      await createTestDocumentLocal(project.id, owner.id, {
        name: 'doc-in-folder2.pdf',
        folderId: folder2.id,
      });
      await createTestDocumentLocal(project.id, owner.id, {
        name: 'doc-at-root.pdf',
        folderId: undefined,
      });

      setMockUser(testUsers.owner);

      // Filter by folder1
      const response1 = await createTestApp()
        .get(`/api/v1/projects/${project.id}/documents?folderId=${folder1.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response1.body.documents).toHaveLength(1);
      expect(response1.body.documents[0].name).toBe('doc-in-folder1.pdf');

      // Filter by folder2
      const response2 = await createTestApp()
        .get(`/api/v1/projects/${project.id}/documents?folderId=${folder2.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response2.body.documents).toHaveLength(1);
      expect(response2.body.documents[0].name).toBe('doc-in-folder2.pdf');
    });

    it('should return documents with folder info', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const folder = await createTestFolder(project.id, { name: 'Test Folder' });
      await createTestDocumentLocal(project.id, owner.id, {
        name: 'doc.pdf',
        folderId: folder.id,
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/documents`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.documents).toHaveLength(1);
      expect(response.body.documents[0].folder).toBeDefined();
      expect(response.body.documents[0].folder.id).toBe(folder.id);
      expect(response.body.documents[0].folder.name).toBe('Test Folder');
    });
  });

  describe('PATCH /api/v1/projects/:id/documents/:documentId/move', () => {
    it('should move document to a folder as ADMIN', async () => {
      const owner = await createTestUser(testUsers.owner);
      const admin = await createTestUser(testUsers.admin);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);

      const folder = await createTestFolder(project.id, { name: 'Target Folder' });
      const document = await createTestDocumentLocal(project.id, owner.id);

      setMockUser(testUsers.admin);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}/documents/${document.id}/move`)
        .set('Authorization', 'Bearer test-token')
        .send({ folderId: folder.id })
        .expect(200);

      expect(response.body.folderId).toBe(folder.id);
      expect(response.body.folder.name).toBe('Target Folder');
    });

    it('should move document to root (null folderId)', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const folder = await createTestFolder(project.id, { name: 'Source Folder' });
      const document = await createTestDocumentLocal(project.id, owner.id, {
        folderId: folder.id,
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}/documents/${document.id}/move`)
        .set('Authorization', 'Bearer test-token')
        .send({ folderId: null })
        .expect(200);

      expect(response.body.folderId).toBeNull();
    });

    it('should return 403 for MEMBER role', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

      const folder = await createTestFolder(project.id, { name: 'Folder' });
      const document = await createTestDocumentLocal(project.id, owner.id);

      setMockUser(testUsers.member);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}/documents/${document.id}/move`)
        .set('Authorization', 'Bearer test-token')
        .send({ folderId: folder.id })
        .expect(403);
    });

    it('should return 404 for non-existent document', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const folder = await createTestFolder(project.id, { name: 'Folder' });

      setMockUser(testUsers.owner);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}/documents/00000000-0000-0000-0000-000000000000/move`)
        .set('Authorization', 'Bearer test-token')
        .send({ folderId: folder.id })
        .expect(404);
    });

    it('should return 404 for non-existent folder', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const document = await createTestDocumentLocal(project.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}/documents/${document.id}/move`)
        .set('Authorization', 'Bearer test-token')
        .send({ folderId: '00000000-0000-0000-0000-000000000000' })
        .expect(404);
    });

    it('should return 404 for folder in different project (IDOR protection)', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project1 = await createTestProject(owner.id, { name: 'Project 1' });
      const project2 = await testPrisma.project.create({
        data: {
          name: 'Project 2',
          members: {
            create: {
              userId: owner.id,
              role: ProjectRole.OWNER,
              acceptedAt: new Date(),
            },
          },
        },
      });

      const folderInProject2 = await createTestFolder(project2.id, { name: 'Folder in P2' });
      const document = await createTestDocumentLocal(project1.id, owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .patch(`/api/v1/projects/${project1.id}/documents/${document.id}/move`)
        .set('Authorization', 'Bearer test-token')
        .send({ folderId: folderInProject2.id })
        .expect(404);
    });
  });
});
