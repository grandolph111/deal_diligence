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
  createTestDocumentEntity,
} from '../utils';

describe('Entity Extraction API', () => {
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
    project = await createTestProject(ownerUser.id, { name: 'Entity Test Project' });

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

  describe('GET /projects/:projectId/documents/:documentId/entities', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('should return 403 when user is not a project member', async () => {
      setMockUser(testUsers.outsider);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .expect(403);

      expect(res.body.error).toBeDefined();
    });

    it('should return 404 for non-existent document', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/non-existent-id/entities`)
        .expect(404);

      expect(res.body.error).toBeDefined();
    });

    it('should return empty list when document has no entities', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .expect(200);

      expect(res.body.entities).toEqual([]);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.total).toBe(0);
    });

    it('should return entities for document', async () => {
      setMockUser(testUsers.owner);

      // Create test entities
      await createTestDocumentEntity(document.id, {
        text: 'Acme Corp',
        entityType: 'ORGANIZATION',
        confidence: 0.95,
      });
      await createTestDocumentEntity(document.id, {
        text: 'John Smith',
        entityType: 'PERSON',
        confidence: 0.88,
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .expect(200);

      expect(res.body.entities).toHaveLength(2);
      expect(res.body.pagination.total).toBe(2);
    });

    it('should filter by entity type', async () => {
      setMockUser(testUsers.owner);

      await createTestDocumentEntity(document.id, {
        text: 'Acme Corp',
        entityType: 'ORGANIZATION',
      });
      await createTestDocumentEntity(document.id, {
        text: 'John Smith',
        entityType: 'PERSON',
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .query({ entityType: 'PERSON' })
        .expect(200);

      expect(res.body.entities).toHaveLength(1);
      expect(res.body.entities[0].entityType).toBe('PERSON');
    });

    it('should filter by needsReview', async () => {
      setMockUser(testUsers.owner);

      await createTestDocumentEntity(document.id, {
        text: 'Clear Entity',
        needsReview: false,
      });
      await createTestDocumentEntity(document.id, {
        text: 'Unclear Entity',
        needsReview: true,
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .query({ needsReview: true })
        .expect(200);

      expect(res.body.entities).toHaveLength(1);
      expect(res.body.entities[0].needsReview).toBe(true);
    });

    it('should filter by minimum confidence', async () => {
      setMockUser(testUsers.owner);

      await createTestDocumentEntity(document.id, {
        text: 'High Confidence',
        confidence: 0.95,
      });
      await createTestDocumentEntity(document.id, {
        text: 'Low Confidence',
        confidence: 0.6,
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .query({ minConfidence: 0.9 })
        .expect(200);

      expect(res.body.entities).toHaveLength(1);
      expect(res.body.entities[0].confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('should paginate results', async () => {
      setMockUser(testUsers.owner);

      // Create 5 entities
      for (let i = 0; i < 5; i++) {
        await createTestDocumentEntity(document.id, {
          text: `Entity ${i}`,
          pageNumber: i + 1,
        });
      }

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(res.body.entities).toHaveLength(2);
      expect(res.body.pagination.total).toBe(5);
      expect(res.body.pagination.totalPages).toBe(3);
    });

    it('should allow VIEWER with canAccessVDR permission', async () => {
      setMockUser(testUsers.viewer);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .expect(200);

      expect(res.body.entities).toBeDefined();
    });
  });

  describe('GET /projects/:projectId/documents/:documentId/entities/:entityId', () => {
    it('should return single entity by ID', async () => {
      setMockUser(testUsers.owner);

      const entity = await createTestDocumentEntity(document.id, {
        text: 'Specific Entity',
        entityType: 'ORGANIZATION',
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities/${entity.id}`)
        .expect(200);

      expect(res.body.id).toBe(entity.id);
      expect(res.body.text).toBe('Specific Entity');
    });

    it('should return 404 for non-existent entity', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities/non-existent`)
        .expect(404);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /projects/:projectId/documents/:documentId/entities/stats', () => {
    it('should return entity statistics', async () => {
      setMockUser(testUsers.owner);

      await createTestDocumentEntity(document.id, {
        text: 'Company 1',
        entityType: 'ORGANIZATION',
      });
      await createTestDocumentEntity(document.id, {
        text: 'Company 2',
        entityType: 'ORGANIZATION',
      });
      await createTestDocumentEntity(document.id, {
        text: 'Person 1',
        entityType: 'PERSON',
        needsReview: true,
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities/stats`)
        .expect(200);

      expect(res.body.documentId).toBe(document.id);
      expect(res.body.totalEntities).toBe(3);
      expect(res.body.needsReview).toBe(1);
      expect(res.body.byType).toHaveLength(2);
    });
  });

  describe('POST /projects/:projectId/documents/:documentId/entities', () => {
    it('should allow MEMBER to create manual entity', async () => {
      setMockUser(testUsers.member);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .send({
          text: 'Manual Entity',
          entityType: 'ORGANIZATION',
        })
        .expect(201);

      expect(res.body.text).toBe('Manual Entity');
      expect(res.body.entityType).toBe('ORGANIZATION');
      expect(res.body.source).toBe('manual');
    });

    it('should validate required fields', async () => {
      setMockUser(testUsers.member);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .send({})
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('should validate entity type', async () => {
      setMockUser(testUsers.member);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .send({
          text: 'Invalid Entity',
          entityType: 'INVALID_TYPE',
        })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('should reject VIEWER from creating entities', async () => {
      setMockUser(testUsers.viewer);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .send({
          text: 'Should Fail',
          entityType: 'PERSON',
        })
        .expect(403);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('PATCH /projects/:projectId/documents/:documentId/entities/:entityId', () => {
    it('should allow MEMBER to update entity', async () => {
      setMockUser(testUsers.member);

      const entity = await createTestDocumentEntity(document.id, {
        text: 'Original Text',
        entityType: 'PERSON',
      });

      const res = await testRequest
        .patch(`/api/v1/projects/${project.id}/documents/${document.id}/entities/${entity.id}`)
        .send({
          text: 'Updated Text',
          normalizedText: 'Updated Normalized',
        })
        .expect(200);

      expect(res.body.text).toBe('Updated Text');
      expect(res.body.normalizedText).toBe('Updated Normalized');
    });

    it('should allow updating needsReview flag', async () => {
      setMockUser(testUsers.member);

      const entity = await createTestDocumentEntity(document.id, {
        needsReview: true,
      });

      const res = await testRequest
        .patch(`/api/v1/projects/${project.id}/documents/${document.id}/entities/${entity.id}`)
        .send({
          needsReview: false,
        })
        .expect(200);

      expect(res.body.needsReview).toBe(false);
    });
  });

  describe('DELETE /projects/:projectId/documents/:documentId/entities/:entityId', () => {
    it('should allow ADMIN to delete entity', async () => {
      setMockUser(testUsers.admin);

      const entity = await createTestDocumentEntity(document.id, {
        text: 'To Delete',
      });

      await testRequest
        .delete(`/api/v1/projects/${project.id}/documents/${document.id}/entities/${entity.id}`)
        .expect(204);

      // Verify deleted
      setMockUser(testUsers.admin);
      await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities/${entity.id}`)
        .expect(404);
    });

    it('should reject MEMBER from deleting entities', async () => {
      setMockUser(testUsers.member);

      const entity = await createTestDocumentEntity(document.id, {
        text: 'Should Not Delete',
      });

      await testRequest
        .delete(`/api/v1/projects/${project.id}/documents/${document.id}/entities/${entity.id}`)
        .expect(403);
    });
  });

  describe('POST /projects/:projectId/documents/:documentId/entities/:entityId/flag', () => {
    it('should flag entity for review', async () => {
      setMockUser(testUsers.member);

      const entity = await createTestDocumentEntity(document.id, {
        needsReview: false,
      });

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities/${entity.id}/flag`)
        .expect(200);

      expect(res.body.needsReview).toBe(true);
    });
  });

  describe('POST /projects/:projectId/documents/:documentId/entities/:entityId/reviewed', () => {
    it('should mark entity as reviewed', async () => {
      setMockUser(testUsers.member);

      const entity = await createTestDocumentEntity(document.id, {
        needsReview: true,
      });

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities/${entity.id}/reviewed`)
        .expect(200);

      expect(res.body.needsReview).toBe(false);
    });
  });

  describe('GET /projects/:projectId/entities/search', () => {
    it('should search entities across documents', async () => {
      setMockUser(testUsers.owner);

      await createTestDocumentEntity(document.id, {
        text: 'Acme Corporation',
        entityType: 'ORGANIZATION',
      });
      await createTestDocumentEntity(document.id, {
        text: 'John Smith',
        entityType: 'PERSON',
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/entities/search`)
        .query({ query: 'Acme' })
        .expect(200);

      expect(res.body.entities).toHaveLength(1);
      expect(res.body.entities[0].text).toContain('Acme');
    });

    it('should filter search by entity type', async () => {
      setMockUser(testUsers.owner);

      await createTestDocumentEntity(document.id, {
        text: 'Acme Corp',
        entityType: 'ORGANIZATION',
      });
      await createTestDocumentEntity(document.id, {
        text: 'Acme Plaza',
        entityType: 'LOCATION',
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/entities/search`)
        .query({ query: 'Acme', entityType: 'ORGANIZATION' })
        .expect(200);

      expect(res.body.entities).toHaveLength(1);
      expect(res.body.entities[0].entityType).toBe('ORGANIZATION');
    });

    it('should require search query', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/entities/search`)
        .expect(400);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /projects/:projectId/entities/needs-review', () => {
    it('should return entities needing review', async () => {
      setMockUser(testUsers.owner);

      await createTestDocumentEntity(document.id, {
        text: 'Needs Review',
        needsReview: true,
        confidence: 0.6,
      });
      await createTestDocumentEntity(document.id, {
        text: 'Does Not Need Review',
        needsReview: false,
        confidence: 0.95,
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/entities/needs-review`)
        .expect(200);

      expect(res.body.entities).toHaveLength(1);
      expect(res.body.entities[0].needsReview).toBe(true);
    });

    it('should order by confidence ascending', async () => {
      setMockUser(testUsers.owner);

      await createTestDocumentEntity(document.id, {
        text: 'Higher Confidence',
        needsReview: true,
        confidence: 0.75,
      });
      await createTestDocumentEntity(document.id, {
        text: 'Lower Confidence',
        needsReview: true,
        confidence: 0.5,
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/entities/needs-review`)
        .expect(200);

      expect(res.body.entities).toHaveLength(2);
      expect(res.body.entities[0].confidence).toBe(0.5);
      expect(res.body.entities[1].confidence).toBe(0.75);
    });
  });

  describe('POST /projects/:projectId/documents/:documentId/entities/sync', () => {
    it('should allow ADMIN to sync entities', async () => {
      setMockUser(testUsers.admin);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities/sync`)
        .send({
          entities: [
            {
              text: 'Synced Company',
              entityType: 'ORGANIZATION',
              confidence: 0.92,
              startOffset: 0,
              endOffset: 15,
              pageNumber: 1,
            },
            {
              text: 'Synced Person',
              entityType: 'PERSON',
              confidence: 0.88,
              startOffset: 20,
              endOffset: 33,
              pageNumber: 1,
            },
          ],
        })
        .expect(200);

      expect(res.body.synced).toBe(2);
      expect(res.body.documentId).toBe(document.id);

      // Verify entities were created
      const listRes = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .expect(200);

      expect(listRes.body.entities).toHaveLength(2);
    });

    it('should reject MEMBER from syncing entities', async () => {
      setMockUser(testUsers.member);

      await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities/sync`)
        .send({
          entities: [
            {
              text: 'Should Fail',
              entityType: 'ORGANIZATION',
              confidence: 0.9,
              startOffset: 0,
              endOffset: 10,
            },
          ],
        })
        .expect(403);
    });

    it('should flag low confidence entities for review', async () => {
      setMockUser(testUsers.admin);

      await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities/sync`)
        .send({
          entities: [
            {
              text: 'Low Confidence Entity',
              entityType: 'PERSON',
              confidence: 0.65, // Below 0.8 threshold
              startOffset: 0,
              endOffset: 20,
            },
          ],
        })
        .expect(200);

      const listRes = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .expect(200);

      expect(listRes.body.entities[0].needsReview).toBe(true);
    });
  });

  describe('IDOR Protection', () => {
    it('should prevent accessing entities from another project', async () => {
      // Create another project
      const otherProject = await createTestProject(outsiderUser.id, {
        name: 'Other Project',
      });
      const otherDocument = await createTestDocument(otherProject.id, outsiderUser.id, {
        processingStatus: DocumentStatus.COMPLETE,
      });

      // Owner tries to access other project's document entities
      setMockUser(testUsers.owner);

      await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${otherDocument.id}/entities`)
        .expect(404);
    });
  });
});
