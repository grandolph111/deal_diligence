import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { setMockUser, clearMockUser } from '../utils/auth-mock';

describe('Relationships API - Knowledge Graph Phase 2C', () => {
  // Database user records
  const testUserDb = {
    id: 'test-user-relationships',
    auth0Id: 'auth0|relationships-test',
    email: 'relationships@test.com',
    name: 'Relationships Test User',
  };

  const testUser2Db = {
    id: 'test-user-relationships-2',
    auth0Id: 'auth0|relationships-test-2',
    email: 'relationships2@test.com',
    name: 'Relationships Test User 2',
  };

  // Mock users for auth middleware (must use 'sub' field)
  const testUser = {
    sub: 'auth0|relationships-test',
    email: 'relationships@test.com',
    name: 'Relationships Test User',
  };

  const testUser2 = {
    sub: 'auth0|relationships-test-2',
    email: 'relationships2@test.com',
    name: 'Relationships Test User 2',
  };

  let projectId: string;
  let documentId: string;
  let masterEntity1Id: string;
  let masterEntity2Id: string;
  let masterEntity3Id: string;

  beforeAll(async () => {
    // Create test users
    await prisma.user.upsert({
      where: { id: testUserDb.id },
      update: {},
      create: testUserDb,
    });

    await prisma.user.upsert({
      where: { id: testUser2Db.id },
      update: {},
      create: testUser2Db,
    });

    // Create test project
    const project = await prisma.project.create({
      data: {
        name: 'Relationships Test Project',
        members: {
          create: [
            { userId: testUserDb.id, role: 'OWNER' },
            { userId: testUser2Db.id, role: 'MEMBER' },
          ],
        },
      },
    });
    projectId = project.id;

    // Create a test document
    const document = await prisma.document.create({
      data: {
        projectId,
        name: 'Test Document for Relationships',
        s3Key: `test/${projectId}/relationships-test.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        processingStatus: 'COMPLETE',
        uploadedById: testUserDb.id,
      },
    });
    documentId = document.id;

    // Create master entities for relationships
    const entity1 = await prisma.masterEntity.create({
      data: {
        projectId,
        canonicalName: 'Acme Corporation',
        entityType: 'ORGANIZATION',
      },
    });
    masterEntity1Id = entity1.id;

    const entity2 = await prisma.masterEntity.create({
      data: {
        projectId,
        canonicalName: 'TechStart Inc.',
        entityType: 'ORGANIZATION',
      },
    });
    masterEntity2Id = entity2.id;

    const entity3 = await prisma.masterEntity.create({
      data: {
        projectId,
        canonicalName: 'John Smith',
        entityType: 'PERSON',
      },
    });
    masterEntity3Id = entity3.id;
  });

  afterAll(async () => {
    // Clean up in correct order
    await prisma.entityRelationship.deleteMany({
      where: {
        OR: [
          { sourceEntity: { projectId } },
          { targetEntity: { projectId } },
        ],
      },
    });
    await prisma.documentEntity.deleteMany({
      where: { document: { projectId } },
    });
    await prisma.masterEntity.deleteMany({ where: { projectId } });
    await prisma.document.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.user.deleteMany({
      where: { id: { in: [testUserDb.id, testUser2Db.id] } },
    });
    clearMockUser();
  });

  beforeEach(async () => {
    // Clean up relationships between tests
    await prisma.entityRelationship.deleteMany({
      where: {
        OR: [
          { sourceEntity: { projectId } },
          { targetEntity: { projectId } },
        ],
      },
    });
    setMockUser(testUser);
  });

  describe('POST /projects/:id/relationships', () => {
    it('should create a relationship between entities', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/relationships`)
        .send({
          sourceEntityId: masterEntity1Id,
          targetEntityId: masterEntity2Id,
          relationshipType: 'CONTRACTS_WITH',
          confidence: 0.95,
        });

      expect(res.status).toBe(201);
      expect(res.body.sourceEntityId).toBe(masterEntity1Id);
      expect(res.body.targetEntityId).toBe(masterEntity2Id);
      expect(res.body.relationshipType).toBe('CONTRACTS_WITH');
      expect(res.body.confidence).toBe(0.95);
    });

    it('should create a relationship with document reference', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/relationships`)
        .send({
          sourceEntityId: masterEntity3Id,
          targetEntityId: masterEntity1Id,
          relationshipType: 'SIGNATORY',
          documentId,
          confidence: 0.9,
        });

      expect(res.status).toBe(201);
      expect(res.body.documentId).toBe(documentId);
      expect(res.body.relationshipType).toBe('SIGNATORY');
    });

    it('should reject duplicate relationships', async () => {
      // Create initial relationship
      await prisma.entityRelationship.create({
        data: {
          sourceEntityId: masterEntity1Id,
          targetEntityId: masterEntity2Id,
          relationshipType: 'PARTY_TO',
          confidence: 0.8,
        },
      });

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/relationships`)
        .send({
          sourceEntityId: masterEntity1Id,
          targetEntityId: masterEntity2Id,
          relationshipType: 'PARTY_TO',
          confidence: 0.9,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already exists');
    });

    it('should allow same entities with different relationship types', async () => {
      await prisma.entityRelationship.create({
        data: {
          sourceEntityId: masterEntity1Id,
          targetEntityId: masterEntity2Id,
          relationshipType: 'CONTRACTS_WITH',
          confidence: 0.8,
        },
      });

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/relationships`)
        .send({
          sourceEntityId: masterEntity1Id,
          targetEntityId: masterEntity2Id,
          relationshipType: 'ACQUIRES',
          confidence: 0.7,
        });

      expect(res.status).toBe(201);
      expect(res.body.relationshipType).toBe('ACQUIRES');
    });

    it('should reject invalid relationship type', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/relationships`)
        .send({
          sourceEntityId: masterEntity1Id,
          targetEntityId: masterEntity2Id,
          relationshipType: 'INVALID_TYPE',
          confidence: 0.9,
        });

      expect(res.status).toBe(400);
    });

    it('should reject non-existent source entity', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/relationships`)
        .send({
          sourceEntityId: '00000000-0000-0000-0000-000000000000',
          targetEntityId: masterEntity2Id,
          relationshipType: 'CONTRACTS_WITH',
          confidence: 0.9,
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Source entity');
    });

    it('should require ADMIN role', async () => {
      setMockUser(testUser2); // MEMBER role

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/relationships`)
        .send({
          sourceEntityId: masterEntity1Id,
          targetEntityId: masterEntity2Id,
          relationshipType: 'CONTRACTS_WITH',
          confidence: 0.9,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /projects/:id/relationships', () => {
    beforeEach(async () => {
      await prisma.entityRelationship.createMany({
        data: [
          {
            sourceEntityId: masterEntity1Id,
            targetEntityId: masterEntity2Id,
            relationshipType: 'CONTRACTS_WITH',
            confidence: 0.95,
          },
          {
            sourceEntityId: masterEntity3Id,
            targetEntityId: masterEntity1Id,
            relationshipType: 'SIGNATORY',
            confidence: 0.9,
          },
          {
            sourceEntityId: masterEntity1Id,
            targetEntityId: masterEntity3Id,
            relationshipType: 'EMPLOYS',
            confidence: 0.85,
          },
        ],
      });
    });

    it('should list all relationships in project', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/relationships`
      );

      expect(res.status).toBe(200);
      expect(res.body.relationships).toHaveLength(3);
      expect(res.body.pagination.total).toBe(3);
    });

    it('should filter by relationship type', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/relationships?relationshipType=SIGNATORY`
      );

      expect(res.status).toBe(200);
      expect(res.body.relationships).toHaveLength(1);
      expect(res.body.relationships[0].relationshipType).toBe('SIGNATORY');
    });

    it('should filter by source entity', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/relationships?sourceEntityId=${masterEntity1Id}`
      );

      expect(res.status).toBe(200);
      expect(res.body.relationships).toHaveLength(2);
      expect(
        res.body.relationships.every(
          (r: { sourceEntityId: string }) => r.sourceEntityId === masterEntity1Id
        )
      ).toBe(true);
    });

    it('should filter by target entity', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/relationships?targetEntityId=${masterEntity1Id}`
      );

      expect(res.status).toBe(200);
      expect(res.body.relationships).toHaveLength(1);
      expect(res.body.relationships[0].targetEntityId).toBe(masterEntity1Id);
    });

    it('should include source and target entity details', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/relationships`
      );

      expect(res.status).toBe(200);
      expect(res.body.relationships[0].sourceEntity).toBeDefined();
      expect(res.body.relationships[0].sourceEntity.canonicalName).toBeDefined();
      expect(res.body.relationships[0].targetEntity).toBeDefined();
    });

    it('should paginate results', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/relationships?page=1&limit=2`
      );

      expect(res.status).toBe(200);
      expect(res.body.relationships).toHaveLength(2);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(2);
      expect(res.body.pagination.totalPages).toBe(2);
    });

    it('should allow MEMBER role to list', async () => {
      setMockUser(testUser2);

      const res = await request(app).get(
        `/api/v1/projects/${projectId}/relationships`
      );

      expect(res.status).toBe(200);
    });
  });

  describe('GET /projects/:id/relationships/:relationshipId', () => {
    let relationshipId: string;

    beforeEach(async () => {
      const relationship = await prisma.entityRelationship.create({
        data: {
          sourceEntityId: masterEntity1Id,
          targetEntityId: masterEntity2Id,
          relationshipType: 'CONTRACTS_WITH',
          confidence: 0.95,
        },
      });
      relationshipId = relationship.id;
    });

    it('should get relationship by ID', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/relationships/${relationshipId}`
      );

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(relationshipId);
      expect(res.body.relationshipType).toBe('CONTRACTS_WITH');
    });

    it('should return 404 for non-existent relationship', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/relationships/00000000-0000-0000-0000-000000000000`
      );

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /projects/:id/relationships/:relationshipId', () => {
    let relationshipId: string;

    beforeEach(async () => {
      setMockUser(testUser); // Reset to OWNER
      const relationship = await prisma.entityRelationship.create({
        data: {
          sourceEntityId: masterEntity1Id,
          targetEntityId: masterEntity2Id,
          relationshipType: 'CONTRACTS_WITH',
          confidence: 0.8,
        },
      });
      relationshipId = relationship.id;
    });

    it('should update relationship confidence', async () => {
      const res = await request(app)
        .patch(`/api/v1/projects/${projectId}/relationships/${relationshipId}`)
        .send({
          confidence: 0.95,
        });

      expect(res.status).toBe(200);
      expect(res.body.confidence).toBe(0.95);
    });

    it('should update relationship type', async () => {
      const res = await request(app)
        .patch(`/api/v1/projects/${projectId}/relationships/${relationshipId}`)
        .send({
          relationshipType: 'ACQUIRES',
        });

      expect(res.status).toBe(200);
      expect(res.body.relationshipType).toBe('ACQUIRES');
    });

    it('should update metadata', async () => {
      const res = await request(app)
        .patch(`/api/v1/projects/${projectId}/relationships/${relationshipId}`)
        .send({
          metadata: { verified: true, notes: 'Confirmed via contract review' },
        });

      expect(res.status).toBe(200);
      expect(res.body.metadata).toEqual({
        verified: true,
        notes: 'Confirmed via contract review',
      });
    });

    it('should require ADMIN role', async () => {
      setMockUser(testUser2);

      const res = await request(app)
        .patch(`/api/v1/projects/${projectId}/relationships/${relationshipId}`)
        .send({
          confidence: 0.95,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /projects/:id/relationships/:relationshipId', () => {
    let relationshipId: string;

    beforeEach(async () => {
      setMockUser(testUser); // Reset to OWNER
      const relationship = await prisma.entityRelationship.create({
        data: {
          sourceEntityId: masterEntity1Id,
          targetEntityId: masterEntity2Id,
          relationshipType: 'CONTRACTS_WITH',
          confidence: 0.95,
        },
      });
      relationshipId = relationship.id;
    });

    it('should delete a relationship', async () => {
      const res = await request(app).delete(
        `/api/v1/projects/${projectId}/relationships/${relationshipId}`
      );

      expect(res.status).toBe(204);

      // Verify deletion
      const deleted = await prisma.entityRelationship.findUnique({
        where: { id: relationshipId },
      });
      expect(deleted).toBeNull();
    });

    it('should require ADMIN role', async () => {
      setMockUser(testUser2);

      const res = await request(app).delete(
        `/api/v1/projects/${projectId}/relationships/${relationshipId}`
      );

      expect(res.status).toBe(403);
    });
  });

  describe('GET /projects/:id/entities/:entityId/relationships', () => {
    beforeEach(async () => {
      await prisma.entityRelationship.createMany({
        data: [
          {
            sourceEntityId: masterEntity1Id,
            targetEntityId: masterEntity2Id,
            relationshipType: 'CONTRACTS_WITH',
            confidence: 0.95,
          },
          {
            sourceEntityId: masterEntity3Id,
            targetEntityId: masterEntity1Id,
            relationshipType: 'SIGNATORY',
            confidence: 0.9,
          },
          {
            sourceEntityId: masterEntity1Id,
            targetEntityId: masterEntity3Id,
            relationshipType: 'EMPLOYS',
            confidence: 0.85,
          },
        ],
      });
    });

    it('should get relationships for a specific entity', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/entities/${masterEntity1Id}/relationships`
      );

      expect(res.status).toBe(200);
      expect(res.body.entity.id).toBe(masterEntity1Id);
      expect(res.body.relationships).toHaveLength(3);
    });

    it('should include both outgoing and incoming relationships', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/entities/${masterEntity1Id}/relationships`
      );

      expect(res.status).toBe(200);

      // Entity1 is source in 2 relationships, target in 1
      const outgoing = res.body.relationships.filter(
        (r: { sourceEntityId: string }) => r.sourceEntityId === masterEntity1Id
      );
      const incoming = res.body.relationships.filter(
        (r: { targetEntityId: string }) => r.targetEntityId === masterEntity1Id
      );

      expect(outgoing.length).toBe(2);
      expect(incoming.length).toBe(1);
    });

    it('should return 404 for non-existent entity', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/entities/00000000-0000-0000-0000-000000000000/relationships`
      );

      expect(res.status).toBe(404);
    });

    it('should allow MEMBER role to view', async () => {
      setMockUser(testUser2);

      const res = await request(app).get(
        `/api/v1/projects/${projectId}/entities/${masterEntity1Id}/relationships`
      );

      expect(res.status).toBe(200);
    });
  });

  describe('GET /projects/:id/documents/:documentId/related', () => {
    let document2Id: string;

    beforeEach(async () => {
      // Create a second document
      const document2 = await prisma.document.create({
        data: {
          projectId,
          name: 'Related Document',
          s3Key: `test/${projectId}/related-test.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 2000,
          processingStatus: 'COMPLETE',
          uploadedById: testUserDb.id,
        },
      });
      document2Id = document2.id;

      // Link entities to documents
      await prisma.documentEntity.createMany({
        data: [
          {
            documentId,
            text: 'Acme Corporation',
            entityType: 'ORGANIZATION',
            confidence: 0.95,
            masterEntityId: masterEntity1Id,
          },
          {
            documentId,
            text: 'TechStart Inc.',
            entityType: 'ORGANIZATION',
            confidence: 0.9,
            masterEntityId: masterEntity2Id,
          },
          {
            documentId: document2Id,
            text: 'Acme Corp',
            entityType: 'ORGANIZATION',
            confidence: 0.88,
            masterEntityId: masterEntity1Id,
          },
        ],
      });
    });

    afterEach(async () => {
      await prisma.documentEntity.deleteMany({
        where: { documentId: { in: [documentId, document2Id] } },
      });
      await prisma.document.deleteMany({
        where: { id: document2Id },
      });
    });

    it('should find related documents based on shared entities', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/documents/${documentId}/related`
      );

      expect(res.status).toBe(200);
      expect(res.body.document.id).toBe(documentId);
      expect(res.body.relatedDocuments).toHaveLength(1);
      expect(res.body.relatedDocuments[0].document.id).toBe(document2Id);
      expect(res.body.relatedDocuments[0].sharedEntityCount).toBe(1);
    });

    it('should include shared entity details', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/documents/${documentId}/related`
      );

      expect(res.status).toBe(200);
      expect(res.body.relatedDocuments[0].sharedEntities).toBeDefined();
      expect(res.body.relatedDocuments[0].sharedEntities[0].canonicalName).toBe('Acme Corporation');
    });

    it('should return empty array when no related documents', async () => {
      // Clean document entities
      await prisma.documentEntity.deleteMany({ where: { documentId } });

      const res = await request(app).get(
        `/api/v1/projects/${projectId}/documents/${documentId}/related`
      );

      expect(res.status).toBe(200);
      expect(res.body.relatedDocuments).toHaveLength(0);
    });
  });

  describe('GET /projects/:id/relationships/stats', () => {
    beforeEach(async () => {
      setMockUser(testUser); // Reset to OWNER
      await prisma.entityRelationship.createMany({
        data: [
          {
            sourceEntityId: masterEntity1Id,
            targetEntityId: masterEntity2Id,
            relationshipType: 'CONTRACTS_WITH',
            confidence: 0.95,
          },
          {
            sourceEntityId: masterEntity3Id,
            targetEntityId: masterEntity1Id,
            relationshipType: 'SIGNATORY',
            confidence: 0.9,
          },
          {
            sourceEntityId: masterEntity1Id,
            targetEntityId: masterEntity3Id,
            relationshipType: 'EMPLOYS',
            confidence: 0.85,
          },
          {
            sourceEntityId: masterEntity2Id,
            targetEntityId: masterEntity3Id,
            relationshipType: 'EMPLOYS',
            confidence: 0.88,
          },
        ],
      });
    });

    it('should return relationship statistics', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/relationships/stats`
      );

      expect(res.status).toBe(200);
      expect(res.body.totalRelationships).toBe(4);
      expect(res.body.byType).toBeDefined();
      expect(res.body.byType.EMPLOYS).toBe(2);
      expect(res.body.byType.CONTRACTS_WITH).toBe(1);
      expect(res.body.byType.SIGNATORY).toBe(1);
    });

    it('should include entity statistics', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/relationships/stats`
      );

      expect(res.status).toBe(200);
      expect(res.body.totalEntities).toBeDefined();
      expect(res.body.entitiesWithRelationships).toBeDefined();
      expect(res.body.entitiesWithoutRelationships).toBeDefined();
    });
  });

  describe('POST /projects/:id/relationships/extract', () => {
    beforeEach(() => {
      setMockUser(testUser); // Reset to OWNER
    });

    // Note: Extract endpoint is covered by the route integration
    // The mock Python service returns mock data for development

    it('should require ADMIN role', async () => {
      setMockUser(testUser2);

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/relationships/extract`)
        .send({
          documentId,
        });

      expect(res.status).toBe(403);
    });
  });

  describe('IDOR Protection', () => {
    let otherProjectId: string;
    let otherEntityId: string;

    beforeEach(() => {
      setMockUser(testUser); // Reset to OWNER
    });

    beforeAll(async () => {
      // Create another project the test user doesn't have access to
      const otherProject = await prisma.project.create({
        data: {
          name: 'Other Relationships Project',
        },
      });
      otherProjectId = otherProject.id;

      const otherEntity = await prisma.masterEntity.create({
        data: {
          projectId: otherProjectId,
          canonicalName: 'Secret Entity',
          entityType: 'ORGANIZATION',
        },
      });
      otherEntityId = otherEntity.id;
    });

    afterAll(async () => {
      await prisma.entityRelationship.deleteMany({
        where: {
          OR: [
            { sourceEntity: { projectId: otherProjectId } },
            { targetEntity: { projectId: otherProjectId } },
          ],
        },
      });
      await prisma.masterEntity.deleteMany({ where: { projectId: otherProjectId } });
      await prisma.project.delete({ where: { id: otherProjectId } });
    });

    it('should not allow access to relationships in other projects', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${otherProjectId}/relationships`
      );

      expect(res.status).toBe(403);
    });

    it('should not allow creating relationships with entities from other projects', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/relationships`)
        .send({
          sourceEntityId: masterEntity1Id,
          targetEntityId: otherEntityId,
          relationshipType: 'CONTRACTS_WITH',
          confidence: 0.9,
        });

      // Either 403 (no access to other project) or 404 (entity not found in project)
      expect([403, 404]).toContain(res.status);
    });
  });
});
