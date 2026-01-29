import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { ProjectRole, DocumentStatus } from '@prisma/client';
import {
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
  createTestDocumentEntity,
  createTestMasterEntity,
  createTestEntityRelationship,
  testPrisma,
} from '../utils';

/**
 * Phase 2C Integration Tests - Knowledge Graph
 *
 * These tests verify the integration of knowledge graph features:
 * - Entity deduplication across documents
 * - Relationship extraction and mapping
 * - Graph visualization (API for graph data)
 * - Related documents suggestions
 * - Entity merge/split functionality
 *
 * Note: Comprehensive unit tests for individual endpoints exist in
 * master-entities.test.ts and relationships.test.ts. These integration
 * tests focus on end-to-end workflows.
 */
describe('VDR Phase 2C Integration Tests - Knowledge Graph', () => {
  let ownerUser: { id: string };
  let memberUser: { id: string };
  let project: { id: string };
  let folder: { id: string };
  let document1: { id: string };
  let document2: { id: string };

  beforeAll(async () => {
    await cleanDatabase();

    // Create test users
    ownerUser = await createTestUser(testUsers.owner);
    memberUser = await createTestUser(testUsers.member);

    // Create project with owner
    project = await createTestProject(ownerUser.id, { name: 'Phase 2C Test Project' });

    // Add member
    await addProjectMember(project.id, memberUser.id, ProjectRole.MEMBER, {
      canAccessVDR: true,
    });

    // Create test folder
    folder = await createTestFolder(project.id, { name: 'Contracts' });

    // Create documents
    document1 = await createTestDocument(project.id, ownerUser.id, {
      name: 'acquisition-agreement.pdf',
      folderId: folder.id,
      processingStatus: DocumentStatus.COMPLETE,
    });
    document2 = await createTestDocument(project.id, ownerUser.id, {
      name: 'due-diligence-report.pdf',
      folderId: folder.id,
      processingStatus: DocumentStatus.COMPLETE,
    });
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  beforeEach(async () => {
    clearMockUser();

    // Clean up entities and relationships before each test
    await testPrisma.entityRelationship.deleteMany({
      where: {
        OR: [
          { sourceEntity: { projectId: project.id } },
          { targetEntity: { projectId: project.id } },
        ],
      },
    });
    await testPrisma.documentEntity.deleteMany({
      where: { document: { projectId: project.id } },
    });
    await testPrisma.masterEntity.deleteMany({
      where: { projectId: project.id },
    });
  });

  // =============================================================================
  // Entity Deduplication Tests
  // =============================================================================
  describe('Entity Deduplication', () => {
    it('should deduplicate entities and create master entities', async () => {
      setMockUser(testUsers.owner);

      // Create similar entities in different documents
      await createTestDocumentEntity(document1.id, {
        text: 'Acme Corporation',
        entityType: 'ORGANIZATION',
        confidence: 0.95,
      });
      await createTestDocumentEntity(document2.id, {
        text: 'Acme Corp',
        entityType: 'ORGANIZATION',
        confidence: 0.88,
      });

      // Run deduplication
      const res = await request(app)
        .post(`/api/v1/projects/${project.id}/master-entities/deduplicate`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ threshold: 0.7 });

      expect(res.status).toBe(200);
      expect(res.body.stats.processed).toBeGreaterThan(0);

      // Verify master entities were created
      const masterEntities = await testPrisma.masterEntity.findMany({
        where: { projectId: project.id },
      });
      expect(masterEntities.length).toBeGreaterThan(0);
    });

    it('should find potential duplicates for review', async () => {
      setMockUser(testUsers.owner);

      // Create master entities with similar names
      await createTestMasterEntity(project.id, {
        canonicalName: 'Acme Corporation',
        entityType: 'ORGANIZATION',
      });
      await createTestMasterEntity(project.id, {
        canonicalName: 'Acme Corp',
        entityType: 'ORGANIZATION',
      });

      const res = await request(app)
        .get(`/api/v1/projects/${project.id}/master-entities/duplicates`)
        .query({ threshold: 0.7 });

      expect(res.status).toBe(200);
      expect(res.body.duplicates.length).toBeGreaterThan(0);
    });
  });

  // =============================================================================
  // Relationship Tests
  // =============================================================================
  describe('Relationship Mapping', () => {
    it('should retrieve relationships for a specific entity', async () => {
      setMockUser(testUsers.owner);

      const entity1 = await createTestMasterEntity(project.id, {
        canonicalName: 'Central Corp',
        entityType: 'ORGANIZATION',
      });
      const entity2 = await createTestMasterEntity(project.id, {
        canonicalName: 'Partner Corp',
        entityType: 'ORGANIZATION',
      });
      const person = await createTestMasterEntity(project.id, {
        canonicalName: 'CEO',
        entityType: 'PERSON',
      });

      // Create relationships
      await createTestEntityRelationship(entity1.id, entity2.id, {
        relationshipType: 'CONTRACTS_WITH',
      });
      await createTestEntityRelationship(person.id, entity1.id, {
        relationshipType: 'SIGNATORY',
      });

      const res = await request(app)
        .get(`/api/v1/projects/${project.id}/entities/${entity1.id}/relationships`);

      expect(res.status).toBe(200);
      expect(res.body.entity.id).toBe(entity1.id);
      expect(res.body.relationships).toHaveLength(2);
    });

    it('should get relationship statistics for graph visualization', async () => {
      setMockUser(testUsers.owner);

      const entity1 = await createTestMasterEntity(project.id, {
        canonicalName: 'Company A',
        entityType: 'ORGANIZATION',
      });
      const entity2 = await createTestMasterEntity(project.id, {
        canonicalName: 'Company B',
        entityType: 'ORGANIZATION',
      });
      const person = await createTestMasterEntity(project.id, {
        canonicalName: 'John Doe',
        entityType: 'PERSON',
      });

      await createTestEntityRelationship(entity1.id, entity2.id, {
        relationshipType: 'CONTRACTS_WITH',
      });
      await createTestEntityRelationship(person.id, entity1.id, {
        relationshipType: 'SIGNATORY',
      });

      const res = await request(app)
        .get(`/api/v1/projects/${project.id}/relationships/stats`);

      expect(res.status).toBe(200);
      expect(res.body.totalRelationships).toBe(2);
      expect(res.body.totalEntities).toBe(3);
    });
  });

  // =============================================================================
  // Related Documents Tests
  // =============================================================================
  describe('Related Documents', () => {
    it('should find related documents based on shared entities', async () => {
      setMockUser(testUsers.owner);

      // Create a master entity
      const sharedEntity = await createTestMasterEntity(project.id, {
        canonicalName: 'Shared Corp',
        entityType: 'ORGANIZATION',
      });

      // Link entity to both documents
      const docEntity1 = await createTestDocumentEntity(document1.id, {
        text: 'Shared Corp',
        entityType: 'ORGANIZATION',
        confidence: 0.95,
      });
      await testPrisma.documentEntity.update({
        where: { id: docEntity1.id },
        data: { masterEntityId: sharedEntity.id },
      });

      const docEntity2 = await createTestDocumentEntity(document2.id, {
        text: 'Shared Corporation',
        entityType: 'ORGANIZATION',
        confidence: 0.90,
      });
      await testPrisma.documentEntity.update({
        where: { id: docEntity2.id },
        data: { masterEntityId: sharedEntity.id },
      });

      const res = await request(app)
        .get(`/api/v1/projects/${project.id}/documents/${document1.id}/related`);

      expect(res.status).toBe(200);
      expect(res.body.relatedDocuments).toHaveLength(1);
      expect(res.body.relatedDocuments[0].document.id).toBe(document2.id);
      expect(res.body.relatedDocuments[0].sharedEntityCount).toBe(1);
    });

    it('should include shared entity details', async () => {
      setMockUser(testUsers.owner);

      const sharedEntity = await createTestMasterEntity(project.id, {
        canonicalName: 'Shared Entity',
        entityType: 'PERSON',
      });

      const docEntity1 = await createTestDocumentEntity(document1.id, {
        text: 'Shared Entity',
        entityType: 'PERSON',
      });
      await testPrisma.documentEntity.update({
        where: { id: docEntity1.id },
        data: { masterEntityId: sharedEntity.id },
      });

      const docEntity2 = await createTestDocumentEntity(document2.id, {
        text: 'Shared Entity',
        entityType: 'PERSON',
      });
      await testPrisma.documentEntity.update({
        where: { id: docEntity2.id },
        data: { masterEntityId: sharedEntity.id },
      });

      const res = await request(app)
        .get(`/api/v1/projects/${project.id}/documents/${document1.id}/related`);

      expect(res.status).toBe(200);
      expect(res.body.relatedDocuments[0].sharedEntities).toBeDefined();
      expect(res.body.relatedDocuments[0].sharedEntities[0].canonicalName).toBe('Shared Entity');
    });

    it('should return empty array when no related documents exist', async () => {
      setMockUser(testUsers.owner);

      const res = await request(app)
        .get(`/api/v1/projects/${project.id}/documents/${document1.id}/related`);

      expect(res.status).toBe(200);
      expect(res.body.relatedDocuments).toHaveLength(0);
    });
  });

  // =============================================================================
  // Entity Merge/Split Tests
  // =============================================================================
  describe('Entity Merge/Split', () => {
    it('should merge entities and consolidate references', async () => {
      setMockUser(testUsers.owner);

      // Create two entities to merge
      const entity1 = await createTestMasterEntity(project.id, {
        canonicalName: 'Acme Corporation',
        entityType: 'ORGANIZATION',
        aliases: ['Acme'],
      });
      const entity2 = await createTestMasterEntity(project.id, {
        canonicalName: 'Acme Corp',
        entityType: 'ORGANIZATION',
      });

      // Link document entities
      const docEntity1 = await createTestDocumentEntity(document1.id, {
        text: 'Acme Corporation',
        entityType: 'ORGANIZATION',
      });
      await testPrisma.documentEntity.update({
        where: { id: docEntity1.id },
        data: { masterEntityId: entity1.id },
      });

      const docEntity2 = await createTestDocumentEntity(document2.id, {
        text: 'Acme Corp',
        entityType: 'ORGANIZATION',
      });
      await testPrisma.documentEntity.update({
        where: { id: docEntity2.id },
        data: { masterEntityId: entity2.id },
      });

      // Merge
      const res = await request(app)
        .post(`/api/v1/projects/${project.id}/master-entities/merge`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          sourceEntityIds: [entity2.id],
          targetEntityId: entity1.id,
        });

      expect(res.status).toBe(200);
      expect(res.body.entity.aliases).toContain('Acme Corp');

      // Verify source was deleted
      const deletedEntity = await testPrisma.masterEntity.findUnique({
        where: { id: entity2.id },
      });
      expect(deletedEntity).toBeNull();

      // Verify all doc entities now point to target
      const docEntities = await testPrisma.documentEntity.findMany({
        where: { masterEntityId: entity1.id },
      });
      expect(docEntities.length).toBe(2);
    });

    it('should split document entities into new master entity', async () => {
      setMockUser(testUsers.owner);

      // Create master entity with multiple document entities
      const masterEntity = await createTestMasterEntity(project.id, {
        canonicalName: 'Combined Entity',
        entityType: 'ORGANIZATION',
      });

      const docEntity1 = await createTestDocumentEntity(document1.id, {
        text: 'Combined Entity',
        entityType: 'ORGANIZATION',
      });
      await testPrisma.documentEntity.update({
        where: { id: docEntity1.id },
        data: { masterEntityId: masterEntity.id },
      });

      const docEntity2 = await createTestDocumentEntity(document2.id, {
        text: 'Different Entity',
        entityType: 'ORGANIZATION',
      });
      await testPrisma.documentEntity.update({
        where: { id: docEntity2.id },
        data: { masterEntityId: masterEntity.id },
      });

      // Split
      const res = await request(app)
        .post(`/api/v1/projects/${project.id}/master-entities/${masterEntity.id}/split`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          documentEntityIds: [docEntity2.id],
          newCanonicalName: 'Split Out Entity',
        });

      expect(res.status).toBe(200);
      expect(res.body.entity.canonicalName).toBe('Split Out Entity');

      // Verify split
      const updatedDocEntity = await testPrisma.documentEntity.findUnique({
        where: { id: docEntity2.id },
      });
      expect(updatedDocEntity?.masterEntityId).toBe(res.body.entity.id);
      expect(updatedDocEntity?.masterEntityId).not.toBe(masterEntity.id);
    });

    it('should reject merging entities of different types', async () => {
      setMockUser(testUsers.owner);

      const orgEntity = await createTestMasterEntity(project.id, {
        canonicalName: 'Organization',
        entityType: 'ORGANIZATION',
      });
      const personEntity = await createTestMasterEntity(project.id, {
        canonicalName: 'Person',
        entityType: 'PERSON',
      });

      const res = await request(app)
        .post(`/api/v1/projects/${project.id}/master-entities/merge`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          sourceEntityIds: [personEntity.id],
          targetEntityId: orgEntity.id,
        });

      expect(res.status).toBe(400);
    });
  });

  // =============================================================================
  // Permission Tests
  // =============================================================================
  describe('Permissions', () => {
    it('should require ADMIN role for deduplication', async () => {
      setMockUser(testUsers.member);

      const res = await request(app)
        .post(`/api/v1/projects/${project.id}/master-entities/deduplicate`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ threshold: 0.7 });

      expect(res.status).toBe(403);
    });

    it('should require ADMIN role for merge operations', async () => {
      setMockUser(testUsers.member);

      const entity1 = await createTestMasterEntity(project.id, {
        canonicalName: 'Entity 1',
        entityType: 'ORGANIZATION',
      });
      const entity2 = await createTestMasterEntity(project.id, {
        canonicalName: 'Entity 2',
        entityType: 'ORGANIZATION',
      });

      const res = await request(app)
        .post(`/api/v1/projects/${project.id}/master-entities/merge`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          sourceEntityIds: [entity2.id],
          targetEntityId: entity1.id,
        });

      expect(res.status).toBe(403);
    });

    it('should allow MEMBER to read master entities and relationships', async () => {
      setMockUser(testUsers.member);

      const entity1 = await createTestMasterEntity(project.id, {
        canonicalName: 'Readable Entity',
        entityType: 'ORGANIZATION',
      });
      const entity2 = await createTestMasterEntity(project.id, {
        canonicalName: 'Another Entity',
        entityType: 'ORGANIZATION',
      });

      await createTestEntityRelationship(entity1.id, entity2.id, {
        relationshipType: 'CONTRACTS_WITH',
      });

      // Should be able to list master entities
      const entitiesRes = await request(app)
        .get(`/api/v1/projects/${project.id}/master-entities`);
      expect(entitiesRes.status).toBe(200);

      // Should be able to list relationships
      const relationshipsRes = await request(app)
        .get(`/api/v1/projects/${project.id}/relationships`);
      expect(relationshipsRes.status).toBe(200);
    });

    it('should allow MEMBER to read related documents', async () => {
      setMockUser(testUsers.member);

      const res = await request(app)
        .get(`/api/v1/projects/${project.id}/documents/${document1.id}/related`);

      expect(res.status).toBe(200);
    });
  });

  // =============================================================================
  // End-to-End Workflow Tests
  // =============================================================================
  describe('End-to-End Workflow', () => {
    it('should support complete entity resolution workflow', async () => {
      setMockUser(testUsers.owner);

      // Step 1: Create documents with entities
      await createTestDocumentEntity(document1.id, {
        text: 'Acquisition Target Inc.',
        entityType: 'ORGANIZATION',
        confidence: 0.95,
      });
      await createTestDocumentEntity(document2.id, {
        text: 'Acquisition Target, Inc.',
        entityType: 'ORGANIZATION',
        confidence: 0.88,
      });

      // Step 2: Run deduplication
      const dedupeRes = await request(app)
        .post(`/api/v1/projects/${project.id}/master-entities/deduplicate`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({ threshold: 0.6 });

      expect(dedupeRes.status).toBe(200);
      expect(dedupeRes.body.stats.processed).toBeGreaterThan(0);

      // Step 3: Check master entities were created
      const masterRes = await request(app)
        .get(`/api/v1/projects/${project.id}/master-entities`);

      expect(masterRes.status).toBe(200);
      expect(masterRes.body.entities.length).toBeGreaterThan(0);

      // Step 4: Check related documents
      const relatedRes = await request(app)
        .get(`/api/v1/projects/${project.id}/documents/${document1.id}/related`);

      expect(relatedRes.status).toBe(200);
      // Documents should be related via shared entity
      expect(relatedRes.body.relatedDocuments).toBeDefined();
    });
  });
});
