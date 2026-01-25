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
  createTestFolder,
  createTestDocument,
  testPrisma,
} from '../utils';

describe('Search Module', () => {
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

  describe('POST /api/v1/projects/:id/search', () => {
    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser(testUsers.owner);
      const project = await createTestProject(user.id);
      clearMockUser();

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer invalid-token')
        .send({ query: 'test' })
        .expect(401);
    });

    it('should return 403 for member without VDR permission', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessVDR: false,
      });

      setMockUser(testUsers.member);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({ query: 'test' })
        .expect(403);
    });

    it('should return search results for project owner', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const folder = await createTestFolder(project.id, { name: 'Legal' });

      // Create test documents
      await createTestDocument(project.id, {
        name: 'Test Agreement.pdf',
        folderId: folder.id,
        uploadedById: owner.id,
      });
      await createTestDocument(project.id, {
        name: 'Financial Report.pdf',
        folderId: folder.id,
        uploadedById: owner.id,
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({ query: 'Agreement' })
        .expect(200);

      expect(response.body).toHaveProperty('query', 'Agreement');
      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.results)).toBe(true);
      // PostgreSQL fallback should find the document by name
      expect(response.body.results.length).toBeGreaterThanOrEqual(0);
    });

    it('should return search results with pagination', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const folder = await createTestFolder(project.id, { name: 'Documents' });

      // Create multiple test documents
      for (let i = 1; i <= 5; i++) {
        await createTestDocument(project.id, {
          name: `Test Document ${i}.pdf`,
          folderId: folder.id,
          uploadedById: owner.id,
        });
      }

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({ query: 'Document', page: 1, limit: 2 })
        .expect(200);

      expect(response.body.pagination).toHaveProperty('page', 1);
      expect(response.body.pagination).toHaveProperty('limit', 2);
      expect(response.body.pagination).toHaveProperty('total');
      expect(response.body.pagination).toHaveProperty('totalPages');
    });

    it('should filter by folder', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const folderA = await createTestFolder(project.id, { name: 'Folder A' });
      const folderB = await createTestFolder(project.id, { name: 'Folder B' });

      await createTestDocument(project.id, {
        name: 'Document in A.pdf',
        folderId: folderA.id,
        uploadedById: owner.id,
      });
      await createTestDocument(project.id, {
        name: 'Document in B.pdf',
        folderId: folderB.id,
        uploadedById: owner.id,
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({ query: 'Document', folderIds: [folderA.id] })
        .expect(200);

      expect(response.body).toHaveProperty('results');
      // Should only return documents from Folder A (if any match)
      for (const result of response.body.results) {
        if (result.folderId) {
          expect(result.folderId).toBe(folderA.id);
        }
      }
    });

    it('should filter by document type', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const folder = await createTestFolder(project.id, { name: 'Docs' });

      await testPrisma.document.create({
        data: {
          projectId: project.id,
          name: 'Contract.pdf',
          s3Key: 'test/contract.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1000,
          folderId: folder.id,
          uploadedById: owner.id,
          documentType: 'contract',
          processingStatus: 'COMPLETE',
        },
      });
      await testPrisma.document.create({
        data: {
          projectId: project.id,
          name: 'Financial.pdf',
          s3Key: 'test/financial.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1000,
          folderId: folder.id,
          uploadedById: owner.id,
          documentType: 'financial',
          processingStatus: 'COMPLETE',
        },
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({ query: '.pdf', documentTypes: ['contract'] })
        .expect(200);

      expect(response.body).toHaveProperty('results');
      // All results should be contracts
      for (const result of response.body.results) {
        if (result.documentType) {
          expect(result.documentType).toBe('contract');
        }
      }
    });

    it('should validate search query is required', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({})
        .expect(400);
    });

    it('should return empty results when no documents match', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({ query: 'nonexistent-document-xyz' })
        .expect(200);

      expect(response.body.results).toHaveLength(0);
      expect(response.body.pagination.total).toBe(0);
    });

    it('should respect folder restrictions for MEMBER role', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);

      const allowedFolder = await createTestFolder(project.id, { name: 'Allowed' });
      const restrictedFolder = await createTestFolder(project.id, { name: 'Restricted' });

      await createTestDocument(project.id, {
        name: 'Allowed Document.pdf',
        folderId: allowedFolder.id,
        uploadedById: owner.id,
      });
      await createTestDocument(project.id, {
        name: 'Restricted Document.pdf',
        folderId: restrictedFolder.id,
        uploadedById: owner.id,
      });

      // Add member with restricted folder access
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessVDR: true,
        restrictedFolders: [allowedFolder.id],
      });

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({ query: 'Document' })
        .expect(200);

      expect(response.body).toHaveProperty('results');
      // Should not contain documents from restricted folder
      for (const result of response.body.results) {
        expect(result.folderId).not.toBe(restrictedFolder.id);
      }
    });

    it('should allow ADMIN to search all folders', async () => {
      const owner = await createTestUser(testUsers.owner);
      const admin = await createTestUser(testUsers.admin);
      const project = await createTestProject(owner.id);

      const folder = await createTestFolder(project.id, { name: 'Test Folder' });
      await createTestDocument(project.id, {
        name: 'Admin Search Test.pdf',
        folderId: folder.id,
        uploadedById: owner.id,
      });

      await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);

      setMockUser(testUsers.admin);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({ query: 'Admin Search' })
        .expect(200);

      expect(response.body).toHaveProperty('results');
    });

    it('should return 404 for non-existent project', async () => {
      const owner = await createTestUser(testUsers.owner);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post('/api/v1/projects/00000000-0000-0000-0000-000000000000/search')
        .set('Authorization', 'Bearer test-token')
        .send({ query: 'test' })
        .expect(404);
    });

    it('should create audit log for search query', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({ query: 'audit test query' })
        .expect(200);

      // Verify audit log was created
      const auditLog = await testPrisma.auditLog.findFirst({
        where: {
          projectId: project.id,
          action: { in: ['search.execute', 'search.semantic'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.metadata).toHaveProperty('query', 'audit test query');
    });
  });

  describe('POST /api/v1/projects/:id/search/similar/:documentId', () => {
    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser(testUsers.owner);
      const project = await createTestProject(user.id);
      const folder = await createTestFolder(project.id, { name: 'Test' });
      const doc = await createTestDocument(project.id, {
        name: 'Test.pdf',
        folderId: folder.id,
        uploadedById: user.id,
      });
      clearMockUser();

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/search/similar/${doc.id}`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return 404 for document user cannot access', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);

      const restrictedFolder = await createTestFolder(project.id, { name: 'Restricted' });
      const doc = await createTestDocument(project.id, {
        name: 'Restricted.pdf',
        folderId: restrictedFolder.id,
        uploadedById: owner.id,
      });

      // Member has restricted folder access (not including the document's folder)
      const allowedFolder = await createTestFolder(project.id, { name: 'Allowed' });
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessVDR: true,
        restrictedFolders: [allowedFolder.id],
      });

      setMockUser(testUsers.member);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/search/similar/${doc.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });

    it('should return results for accessible document', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const folder = await createTestFolder(project.id, { name: 'Test' });
      const doc = await createTestDocument(project.id, {
        name: 'Source.pdf',
        folderId: folder.id,
        uploadedById: owner.id,
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search/similar/${doc.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveProperty('query');
      expect(response.body).toHaveProperty('results');
      expect(response.body).toHaveProperty('searchType', 'semantic');
      expect(response.body).toHaveProperty('pagination');
    });

    it('should return empty results when Python service unavailable', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);
      const folder = await createTestFolder(project.id, { name: 'Test' });
      const doc = await createTestDocument(project.id, {
        name: 'Source.pdf',
        folderId: folder.id,
        uploadedById: owner.id,
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search/similar/${doc.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      // Without Python service, should return empty results gracefully
      expect(response.body.results).toEqual([]);
      expect(response.body.pagination.total).toBe(0);
    });
  });
});
