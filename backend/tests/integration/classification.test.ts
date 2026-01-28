import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ProjectRole, DocumentStatus } from '@prisma/client';
import {
  testRequest,
  testUsers,
  setMockUser,
  clearMockUser,
  cleanDatabase,
  disconnectDatabase,
  createTestUser,
  createTestProject,
  addProjectMember,
  createTestDocument,
} from '../utils';

describe('Document Classification API', () => {
  let ownerUser: { id: string };
  let adminUser: { id: string };
  let memberUser: { id: string };
  let viewerUser: { id: string };
  let outsiderUser: { id: string };
  let project: { id: string };
  let document: { id: string };

  beforeAll(async () => {
    await cleanDatabase();

    // Create test users
    ownerUser = await createTestUser(testUsers.owner);
    adminUser = await createTestUser(testUsers.admin);
    memberUser = await createTestUser(testUsers.member);
    viewerUser = await createTestUser(testUsers.viewer);
    outsiderUser = await createTestUser(testUsers.outsider);

    // Create project with owner
    project = await createTestProject(ownerUser.id, { name: 'Classification Test Project' });

    // Add other members
    await addProjectMember(project.id, adminUser.id, ProjectRole.ADMIN);
    await addProjectMember(project.id, memberUser.id, ProjectRole.MEMBER, {
      canAccessVDR: true,
    });
    await addProjectMember(project.id, viewerUser.id, ProjectRole.VIEWER, {
      canAccessVDR: true,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  beforeEach(async () => {
    clearMockUser();

    // Create a fresh document for each test
    document = await createTestDocument(project.id, ownerUser.id, {
      name: 'test-contract.pdf',
      processingStatus: DocumentStatus.COMPLETE,
    });
  });

  describe('GET /projects/:projectId/documents/:documentId/classification', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('should return 403 when user is not a project member', async () => {
      setMockUser(testUsers.outsider);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .expect(403);

      expect(res.body.error).toBeDefined();
    });

    it('should return 404 for non-existent document', async () => {
      setMockUser(testUsers.owner);

      const fakeDocId = '00000000-0000-0000-0000-000000000000';
      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${fakeDocId}/classification`)
        .expect(404);

      expect(res.body.error).toBeDefined();
    });

    it('should return classification for document as owner', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .expect(200);

      expect(res.body.documentId).toBe(document.id);
      expect(res.body).toHaveProperty('documentType');
      expect(res.body).toHaveProperty('riskLevel');
      expect(res.body).toHaveProperty('processingStatus');
    });

    it('should return classification for document as member with VDR access', async () => {
      setMockUser(testUsers.member);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .expect(200);

      expect(res.body.documentId).toBe(document.id);
    });

    it('should return classification for document as viewer with VDR access', async () => {
      setMockUser(testUsers.viewer);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .expect(200);

      expect(res.body.documentId).toBe(document.id);
    });
  });

  describe('PUT /projects/:projectId/documents/:documentId/classification (manual classification)', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({ documentType: 'CONTRACT' })
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('should return 403 when user is VIEWER', async () => {
      setMockUser(testUsers.viewer);

      const res = await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({ documentType: 'CONTRACT' })
        .expect(403);

      expect(res.body.error).toBeDefined();
    });

    it('should classify document as MEMBER', async () => {
      setMockUser(testUsers.member);

      const res = await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({ documentType: 'CONTRACT', riskLevel: 'LOW' })
        .expect(200);

      expect(res.body.documentId).toBe(document.id);
      expect(res.body.documentType).toBe('CONTRACT');
      expect(res.body.riskLevel).toBe('LOW');
    });

    it('should classify document as ADMIN', async () => {
      setMockUser(testUsers.admin);

      const res = await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({ documentType: 'FINANCIAL', riskLevel: 'HIGH' })
        .expect(200);

      expect(res.body.documentId).toBe(document.id);
      expect(res.body.documentType).toBe('FINANCIAL');
      expect(res.body.riskLevel).toBe('HIGH');
    });

    it('should classify document as OWNER', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({ documentType: 'LEGAL' })
        .expect(200);

      expect(res.body.documentId).toBe(document.id);
      expect(res.body.documentType).toBe('LEGAL');
    });

    it('should return 400 for invalid document type', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({ documentType: 'INVALID_TYPE' })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('should return 400 for invalid risk level', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({ documentType: 'CONTRACT', riskLevel: 'INVALID' })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('DELETE /projects/:projectId/documents/:documentId/classification (clear classification)', () => {
    it('should return 403 when user is MEMBER', async () => {
      setMockUser(testUsers.member);

      const res = await testRequest
        .delete(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .expect(403);

      expect(res.body.error).toBeDefined();
    });

    it('should clear classification as ADMIN', async () => {
      setMockUser(testUsers.admin);

      // First, classify the document
      await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({ documentType: 'CONTRACT', riskLevel: 'HIGH' })
        .expect(200);

      // Then clear it
      await testRequest
        .delete(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .expect(204);

      // Verify it's cleared
      const getRes = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .expect(200);

      expect(getRes.body.documentType).toBeNull();
      expect(getRes.body.riskLevel).toBeNull();
    });
  });

  describe('GET /projects/:projectId/classification/stats', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/classification/stats`)
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('should return classification statistics', async () => {
      setMockUser(testUsers.owner);

      // First, classify the document
      await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({ documentType: 'CONTRACT', riskLevel: 'HIGH' })
        .expect(200);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/classification/stats`)
        .expect(200);

      expect(res.body).toHaveProperty('totalDocuments');
      expect(res.body).toHaveProperty('classifiedDocuments');
      expect(res.body).toHaveProperty('unclassifiedDocuments');
      expect(res.body).toHaveProperty('byType');
      expect(res.body).toHaveProperty('byRiskLevel');
      expect(typeof res.body.totalDocuments).toBe('number');
      expect(typeof res.body.classifiedDocuments).toBe('number');
    });
  });

  describe('GET /projects/:projectId/classification/documents', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/classification/documents`)
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('should list documents by document type', async () => {
      setMockUser(testUsers.owner);

      // Classify the document
      await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({ documentType: 'CONTRACT' })
        .expect(200);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/classification/documents?documentType=CONTRACT`)
        .expect(200);

      expect(res.body.documents).toBeInstanceOf(Array);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.documents.length).toBeGreaterThan(0);
      expect(res.body.documents[0].documentType).toBe('CONTRACT');
    });

    it('should list documents by risk level', async () => {
      setMockUser(testUsers.owner);

      // Classify the document with risk level
      await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({ documentType: 'LEGAL', riskLevel: 'HIGH' })
        .expect(200);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/classification/documents?riskLevel=HIGH`)
        .expect(200);

      expect(res.body.documents).toBeInstanceOf(Array);
      expect(res.body.documents.length).toBeGreaterThan(0);
      expect(res.body.documents[0].riskLevel).toBe('HIGH');
    });

    it('should support pagination', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/classification/documents?page=1&limit=10`)
        .expect(200);

      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(10);
    });
  });

  describe('GET /projects/:projectId/classification/unclassified', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/classification/unclassified`)
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('should list unclassified documents', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/classification/unclassified`)
        .expect(200);

      expect(res.body.documents).toBeInstanceOf(Array);
      expect(res.body.pagination).toBeDefined();
    });
  });

  describe('POST /projects/:projectId/documents/:documentId/classification/sync', () => {
    it('should return 403 when user is MEMBER', async () => {
      setMockUser(testUsers.member);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/classification/sync`)
        .send({
          documentType: 'CONTRACT',
          documentTypeConfidence: 0.95,
        })
        .expect(403);

      expect(res.body.error).toBeDefined();
    });

    it('should sync classification from Python service as ADMIN', async () => {
      setMockUser(testUsers.admin);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/classification/sync`)
        .send({
          documentType: 'FINANCIAL',
          documentTypeConfidence: 0.92,
          riskLevel: 'MEDIUM',
          riskLevelConfidence: 0.85,
          language: 'en',
          currency: 'USD',
          region: 'US',
        })
        .expect(200);

      expect(res.body.documentId).toBe(document.id);
      expect(res.body.documentType).toBe('FINANCIAL');
      expect(res.body.riskLevel).toBe('MEDIUM');
      expect(res.body.language).toBe('en');
      expect(res.body.currency).toBe('USD');
      expect(res.body.region).toBe('US');
    });
  });

  describe('POST /projects/:projectId/classification/batch', () => {
    it('should return 403 when user is MEMBER', async () => {
      setMockUser(testUsers.member);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/classification/batch`)
        .send({ documentIds: [document.id] })
        .expect(403);

      expect(res.body.error).toBeDefined();
    });

    it('should return 400 when documentIds is missing', async () => {
      setMockUser(testUsers.admin);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/classification/batch`)
        .send({})
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('should return 400 when documentIds is empty', async () => {
      setMockUser(testUsers.admin);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/classification/batch`)
        .send({ documentIds: [] })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('should return 400 when exceeding max batch size', async () => {
      setMockUser(testUsers.admin);

      // Create array of 51 fake IDs
      const tooManyIds = Array(51)
        .fill(null)
        .map((_, i) => `00000000-0000-0000-0000-00000000000${i}`);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/classification/batch`)
        .send({ documentIds: tooManyIds })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('IDOR Protection', () => {
    let otherProject: { id: string };
    let otherDocument: { id: string };

    beforeAll(async () => {
      // Create another project that outsider owns
      otherProject = await createTestProject(outsiderUser.id, { name: 'Other Project' });
      otherDocument = await createTestDocument(otherProject.id, outsiderUser.id, {
        name: 'other-document.pdf',
        processingStatus: DocumentStatus.COMPLETE,
      });
    });

    it('should return 404 when accessing document from different project', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${otherDocument.id}/classification`)
        .expect(404);

      expect(res.body.error).toBeDefined();
    });

    it('should prevent classifying document from different project', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${otherDocument.id}/classification`)
        .send({ documentType: 'CONTRACT' })
        .expect(404);

      expect(res.body.error).toBeDefined();
    });
  });
});
