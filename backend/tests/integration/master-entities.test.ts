import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { setMockUser, clearMockUser } from '../utils/auth-mock';

describe('Master Entities API - Entity Deduplication', () => {
  const testUser = {
    id: 'test-user-master-entities',
    auth0Id: 'auth0|master-entities-test',
    email: 'master-entities@test.com',
    name: 'Master Entities Test User',
  };

  const testUser2 = {
    id: 'test-user-master-entities-2',
    auth0Id: 'auth0|master-entities-test-2',
    email: 'master-entities2@test.com',
    name: 'Master Entities Test User 2',
  };

  // setMockUser expects { sub, email, name } — map from the Prisma-shaped fixtures above.
  const asMock = (u: { auth0Id: string; email: string; name: string }) => ({
    sub: u.auth0Id,
    email: u.email,
    name: u.name,
  });

  let projectId: string;
  let documentId: string;

  beforeAll(async () => {
    // Create test user
    await prisma.user.upsert({
      where: { id: testUser.id },
      update: {},
      create: testUser,
    });

    await prisma.user.upsert({
      where: { id: testUser2.id },
      update: {},
      create: testUser2,
    });

    // Create test project
    const project = await prisma.project.create({
      data: {
        name: 'Master Entities Test Project',
        members: {
          create: [
            { userId: testUser.id, role: 'OWNER' },
            { userId: testUser2.id, role: 'MEMBER' },
          ],
        },
      },
    });
    projectId = project.id;

    // Create a test document
    const document = await prisma.document.create({
      data: {
        projectId,
        name: 'Test Document for Entities',
        s3Key: `test/${projectId}/entities-test.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 1000,
        processingStatus: 'COMPLETE',
        uploadedById: testUser.id,
      },
    });
    documentId = document.id;
  });

  afterAll(async () => {
    // Clean up in correct order
    await prisma.documentEntity.deleteMany({
      where: { document: { projectId } },
    });
    await prisma.entityRelationship.deleteMany({
      where: {
        OR: [
          { sourceEntity: { projectId } },
          { targetEntity: { projectId } },
        ],
      },
    });
    await prisma.masterEntity.deleteMany({ where: { projectId } });
    await prisma.document.deleteMany({ where: { projectId } });
    await prisma.projectMember.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.user.deleteMany({
      where: { id: { in: [testUser.id, testUser2.id] } },
    });
    clearMockUser();
  });

  beforeEach(async () => {
    // Clean up entities between tests
    await prisma.documentEntity.deleteMany({
      where: { documentId },
    });
    await prisma.masterEntity.deleteMany({ where: { projectId } });
    setMockUser(asMock(testUser));
  });

  describe('POST /projects/:id/master-entities', () => {
    it('should create a master entity', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/master-entities`)
        .send({
          canonicalName: 'Acme Corporation',
          entityType: 'ORGANIZATION',
          aliases: ['Acme Corp', 'ACME'],
        });

      expect(res.status).toBe(201);
      expect(res.body.canonicalName).toBe('Acme Corporation');
      expect(res.body.entityType).toBe('ORGANIZATION');
      expect(res.body.aliases).toContain('Acme Corp');
    });

    it('should reject duplicate canonical names for same type', async () => {
      await prisma.masterEntity.create({
        data: {
          projectId,
          canonicalName: 'Acme Corporation',
          entityType: 'ORGANIZATION',
        },
      });

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/master-entities`)
        .send({
          canonicalName: 'Acme Corporation',
          entityType: 'ORGANIZATION',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already exists');
    });

    it('should allow same name for different entity types', async () => {
      await prisma.masterEntity.create({
        data: {
          projectId,
          canonicalName: 'Apple',
          entityType: 'ORGANIZATION',
        },
      });

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/master-entities`)
        .send({
          canonicalName: 'Apple',
          entityType: 'LOCATION',
        });

      expect(res.status).toBe(201);
    });

    it('should require ADMIN role', async () => {
      setMockUser(asMock(testUser2)); // MEMBER role

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/master-entities`)
        .send({
          canonicalName: 'Test Entity',
          entityType: 'ORGANIZATION',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /projects/:id/master-entities', () => {
    beforeEach(async () => {
      await prisma.masterEntity.createMany({
        data: [
          { projectId, canonicalName: 'Acme Inc', entityType: 'ORGANIZATION' },
          { projectId, canonicalName: 'John Smith', entityType: 'PERSON' },
          { projectId, canonicalName: 'Jane Doe', entityType: 'PERSON' },
        ],
      });
    });

    it('should list all master entities', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/master-entities`
      );

      expect(res.status).toBe(200);
      expect(res.body.entities).toHaveLength(3);
      expect(res.body.pagination.total).toBe(3);
    });

    it('should filter by entity type', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/master-entities?entityType=PERSON`
      );

      expect(res.status).toBe(200);
      expect(res.body.entities).toHaveLength(2);
      expect(res.body.entities.every((e: { entityType: string }) => e.entityType === 'PERSON')).toBe(true);
    });

    it('should search by name', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/master-entities?search=john`
      );

      expect(res.status).toBe(200);
      expect(res.body.entities).toHaveLength(1);
      expect(res.body.entities[0].canonicalName).toBe('John Smith');
    });

    it('should allow MEMBER role to list', async () => {
      setMockUser(asMock(testUser2));

      const res = await request(app).get(
        `/api/v1/projects/${projectId}/master-entities`
      );

      expect(res.status).toBe(200);
    });
  });

  describe('POST /projects/:id/master-entities/deduplicate', () => {
    beforeEach(async () => {
      // Create document entities that need deduplication
      await prisma.documentEntity.createMany({
        data: [
          {
            documentId,
            text: 'Acme Corporation',
            entityType: 'ORGANIZATION',
            confidence: 0.95,
            source: 'berrydb',
          },
          {
            documentId,
            text: 'Acme Corp',
            entityType: 'ORGANIZATION',
            confidence: 0.9,
            source: 'berrydb',
          },
          {
            documentId,
            text: 'ACME Inc.',
            entityType: 'ORGANIZATION',
            confidence: 0.85,
            source: 'berrydb',
          },
          {
            documentId,
            text: 'John Smith',
            entityType: 'PERSON',
            confidence: 0.95,
            source: 'berrydb',
          },
          {
            documentId,
            text: '$1,000,000',
            entityType: 'MONEY',
            confidence: 0.99,
            source: 'berrydb',
          },
        ],
      });
    });

    it('should deduplicate entities and create master entities', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/master-entities/deduplicate`)
        .send({ threshold: 0.7 });

      expect(res.status).toBe(200);
      expect(res.body.stats.processed).toBeGreaterThan(0);

      // Check that master entities were created
      const masterEntities = await prisma.masterEntity.findMany({
        where: { projectId },
      });
      expect(masterEntities.length).toBeGreaterThan(0);

      // Check that document entities are linked
      const linkedEntities = await prisma.documentEntity.findMany({
        where: { documentId, masterEntityId: { not: null } },
      });
      expect(linkedEntities.length).toBeGreaterThan(0);
    });

    it('should skip non-deduplicatable entity types', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/master-entities/deduplicate`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.stats.skipped).toBe(1); // MONEY entity skipped
    });

    it('should require ADMIN role', async () => {
      setMockUser(asMock(testUser2));

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/master-entities/deduplicate`)
        .send({});

      expect(res.status).toBe(403);
    });
  });

  describe('POST /projects/:id/master-entities/merge', () => {
    let entity1Id: string;
    let entity2Id: string;

    beforeEach(async () => {
      const entity1 = await prisma.masterEntity.create({
        data: {
          projectId,
          canonicalName: 'Acme Corporation',
          entityType: 'ORGANIZATION',
          aliases: ['Acme'],
        },
      });
      entity1Id = entity1.id;

      const entity2 = await prisma.masterEntity.create({
        data: {
          projectId,
          canonicalName: 'Acme Corp',
          entityType: 'ORGANIZATION',
          aliases: ['ACME Inc'],
        },
      });
      entity2Id = entity2.id;

      // Create document entities linked to each
      await prisma.documentEntity.createMany({
        data: [
          {
            documentId,
            text: 'Acme Corporation',
            entityType: 'ORGANIZATION',
            confidence: 0.95,
            masterEntityId: entity1Id,
          },
          {
            documentId,
            text: 'Acme Corp',
            entityType: 'ORGANIZATION',
            confidence: 0.9,
            masterEntityId: entity2Id,
          },
        ],
      });
    });

    it('should merge entities into target', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/master-entities/merge`)
        .send({
          sourceEntityIds: [entity2Id],
          targetEntityId: entity1Id,
        });

      expect(res.status).toBe(200);
      expect(res.body.entity.canonicalName).toBe('Acme Corporation');
      expect(res.body.entity.aliases).toContain('Acme Corp');

      // Source entity should be deleted
      const sourceEntity = await prisma.masterEntity.findUnique({
        where: { id: entity2Id },
      });
      expect(sourceEntity).toBeNull();

      // All document entities should now link to target
      const docEntities = await prisma.documentEntity.findMany({
        where: { documentId },
      });
      expect(docEntities.every((e) => e.masterEntityId === entity1Id)).toBe(true);
    });

    it('should allow updating canonical name during merge', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/master-entities/merge`)
        .send({
          sourceEntityIds: [entity2Id],
          targetEntityId: entity1Id,
          canonicalName: 'ACME International',
        });

      expect(res.status).toBe(200);
      expect(res.body.entity.canonicalName).toBe('ACME International');
    });

    it('should reject merging different entity types', async () => {
      const personEntity = await prisma.masterEntity.create({
        data: {
          projectId,
          canonicalName: 'John Acme',
          entityType: 'PERSON',
        },
      });

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/master-entities/merge`)
        .send({
          sourceEntityIds: [personEntity.id],
          targetEntityId: entity1Id,
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('same type');
    });
  });

  describe('POST /projects/:id/master-entities/:entityId/split', () => {
    let masterEntityId: string;
    let docEntity1Id: string;
    let docEntity2Id: string;

    beforeEach(async () => {
      const masterEntity = await prisma.masterEntity.create({
        data: {
          projectId,
          canonicalName: 'Acme Corporation',
          entityType: 'ORGANIZATION',
        },
      });
      masterEntityId = masterEntity.id;

      const docEntity1 = await prisma.documentEntity.create({
        data: {
          documentId,
          text: 'Acme Corporation',
          entityType: 'ORGANIZATION',
          confidence: 0.95,
          masterEntityId,
        },
      });
      docEntity1Id = docEntity1.id;

      const docEntity2 = await prisma.documentEntity.create({
        data: {
          documentId,
          text: 'Acme Industries',
          entityType: 'ORGANIZATION',
          confidence: 0.9,
          masterEntityId,
        },
      });
      docEntity2Id = docEntity2.id;
    });

    it('should split document entities into new master entity', async () => {
      const res = await request(app)
        .post(
          `/api/v1/projects/${projectId}/master-entities/${masterEntityId}/split`
        )
        .send({
          documentEntityIds: [docEntity2Id],
          newCanonicalName: 'Acme Industries',
        });

      expect(res.status).toBe(200);
      expect(res.body.entity.canonicalName).toBe('Acme Industries');

      // Check document entity is now linked to new master
      const updatedDocEntity = await prisma.documentEntity.findUnique({
        where: { id: docEntity2Id },
      });
      expect(updatedDocEntity?.masterEntityId).toBe(res.body.entity.id);
      expect(updatedDocEntity?.masterEntityId).not.toBe(masterEntityId);
    });

    it('should reject split with conflicting name', async () => {
      await prisma.masterEntity.create({
        data: {
          projectId,
          canonicalName: 'Acme Industries',
          entityType: 'ORGANIZATION',
        },
      });

      const res = await request(app)
        .post(
          `/api/v1/projects/${projectId}/master-entities/${masterEntityId}/split`
        )
        .send({
          documentEntityIds: [docEntity2Id],
          newCanonicalName: 'Acme Industries',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('already exists');
    });
  });

  describe('GET /projects/:id/master-entities/duplicates', () => {
    beforeEach(async () => {
      await prisma.masterEntity.createMany({
        data: [
          { projectId, canonicalName: 'Acme Corporation', entityType: 'ORGANIZATION' },
          { projectId, canonicalName: 'Acme Corp', entityType: 'ORGANIZATION' },
          { projectId, canonicalName: 'Beta Industries', entityType: 'ORGANIZATION' },
          { projectId, canonicalName: 'John Smith', entityType: 'PERSON' },
          { projectId, canonicalName: 'Jon Smith', entityType: 'PERSON' },
        ],
      });
    });

    it('should find potential duplicates', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/master-entities/duplicates?threshold=0.7`
      );

      expect(res.status).toBe(200);
      expect(res.body.duplicates.length).toBeGreaterThan(0);

      // Should find Acme Corporation / Acme Corp as duplicates
      const acmePair = res.body.duplicates.find(
        (d: { entity1: { canonicalName: string }; entity2: { canonicalName: string } }) =>
          (d.entity1.canonicalName === 'Acme Corporation' &&
            d.entity2.canonicalName === 'Acme Corp') ||
          (d.entity1.canonicalName === 'Acme Corp' &&
            d.entity2.canonicalName === 'Acme Corporation')
      );
      expect(acmePair).toBeDefined();
      expect(acmePair.similarity).toBeGreaterThan(0.7);
    });

    it('should filter by entity type', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/master-entities/duplicates?entityType=PERSON&threshold=0.7`
      );

      expect(res.status).toBe(200);
      // Should only find John/Jon Smith pair
      expect(
        res.body.duplicates.every(
          (d: { entity1: { entityType: string }; entity2: { entityType: string } }) =>
            d.entity1.entityType === 'PERSON' && d.entity2.entityType === 'PERSON'
        )
      ).toBe(true);
    });
  });

  describe('GET /projects/:id/master-entities/:entityId/documents', () => {
    let masterEntityId: string;

    beforeEach(async () => {
      const masterEntity = await prisma.masterEntity.create({
        data: {
          projectId,
          canonicalName: 'Acme Corporation',
          entityType: 'ORGANIZATION',
        },
      });
      masterEntityId = masterEntity.id;

      await prisma.documentEntity.createMany({
        data: [
          {
            documentId,
            text: 'Acme Corporation',
            entityType: 'ORGANIZATION',
            confidence: 0.95,
            pageNumber: 1,
            masterEntityId,
          },
          {
            documentId,
            text: 'Acme Corp',
            entityType: 'ORGANIZATION',
            confidence: 0.9,
            pageNumber: 3,
            masterEntityId,
          },
        ],
      });
    });

    it('should return documents mentioning the entity', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${projectId}/master-entities/${masterEntityId}/documents`
      );

      expect(res.status).toBe(200);
      expect(res.body.entity.canonicalName).toBe('Acme Corporation');
      expect(res.body.documents).toHaveLength(1);
      expect(res.body.documents[0].document.id).toBe(documentId);
      expect(res.body.documents[0].mentions).toHaveLength(2);
    });

    it('should allow MEMBER to view', async () => {
      setMockUser(asMock(testUser2));

      const res = await request(app).get(
        `/api/v1/projects/${projectId}/master-entities/${masterEntityId}/documents`
      );

      expect(res.status).toBe(200);
    });
  });

  describe('IDOR Protection', () => {
    let otherProjectId: string;
    let otherMasterEntityId: string;

    beforeAll(async () => {
      // Create another project the test user doesn't have access to
      const otherProject = await prisma.project.create({
        data: {
          name: 'Other Project',
        },
      });
      otherProjectId = otherProject.id;

      const otherMasterEntity = await prisma.masterEntity.create({
        data: {
          projectId: otherProjectId,
          canonicalName: 'Secret Entity',
          entityType: 'ORGANIZATION',
        },
      });
      otherMasterEntityId = otherMasterEntity.id;
    });

    afterAll(async () => {
      await prisma.masterEntity.deleteMany({ where: { projectId: otherProjectId } });
      await prisma.project.delete({ where: { id: otherProjectId } });
    });

    it('should not allow access to entities in other projects', async () => {
      const res = await request(app).get(
        `/api/v1/projects/${otherProjectId}/master-entities/${otherMasterEntityId}`
      );

      expect(res.status).toBe(403);
    });

    it('should not allow merging entities from different projects', async () => {
      const localEntity = await prisma.masterEntity.create({
        data: {
          projectId,
          canonicalName: 'Local Entity',
          entityType: 'ORGANIZATION',
        },
      });

      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/master-entities/merge`)
        .send({
          sourceEntityIds: [otherMasterEntityId],
          targetEntityId: localEntity.id,
        });

      expect(res.status).toBe(404);
    });
  });
});
