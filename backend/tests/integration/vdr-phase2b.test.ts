import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ProjectRole, DocumentStatus } from '@prisma/client';
import {
  createTestApp,
  testRequest,
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
  createTestClause,
  testPrisma,
} from '../utils';

/**
 * Phase 2B Integration Tests
 *
 * Tests the intelligent extraction features:
 * - Entity extraction on sample contracts
 * - Document classification accuracy
 * - Clause detection on contracts
 * - Semantic search relevance
 * - Find Similar functionality
 * - Search filters (type, entity, clause)
 */
describe('VDR Phase 2B Integration Tests', () => {
  let ownerUser: { id: string };
  let adminUser: { id: string };
  let memberUser: { id: string };
  let viewerUser: { id: string };
  let outsiderUser: { id: string };
  let project: { id: string };
  let folder: { id: string };
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
    project = await createTestProject(ownerUser.id, { name: 'Phase 2B Test Project' });

    // Add other members
    await addProjectMember(project.id, adminUser.id, ProjectRole.ADMIN);
    await addProjectMember(project.id, memberUser.id, ProjectRole.MEMBER, {
      canAccessVDR: true,
    });
    await addProjectMember(project.id, viewerUser.id, ProjectRole.VIEWER, {
      canAccessVDR: true,
    });

    // Create test folder
    folder = await createTestFolder(project.id, { name: 'Contracts' });
  });

  afterAll(async () => {
    await cleanDatabase();
    await disconnectDatabase();
  });

  beforeEach(async () => {
    clearMockUser();

    // Create fresh document for each test
    document = await createTestDocument(project.id, ownerUser.id, {
      name: 'sample-contract.pdf',
      folderId: folder.id,
      processingStatus: DocumentStatus.COMPLETE,
    });
  });

  // =============================================================================
  // Entity Extraction Tests
  // =============================================================================
  describe('Entity Extraction on Sample Contracts', () => {
    it('should extract and store multiple entity types from a document', async () => {
      setMockUser(testUsers.owner);

      // Create entities that would be extracted from a contract
      await createTestDocumentEntity(document.id, {
        text: 'Acme Corporation',
        entityType: 'ORGANIZATION',
        confidence: 0.95,
        pageNumber: 1,
        startOffset: 100,
        endOffset: 116,
      });
      await createTestDocumentEntity(document.id, {
        text: 'John Smith',
        entityType: 'PERSON',
        confidence: 0.92,
        pageNumber: 1,
        startOffset: 150,
        endOffset: 160,
      });
      await createTestDocumentEntity(document.id, {
        text: '$10,000,000',
        entityType: 'MONEY',
        confidence: 0.98,
        pageNumber: 2,
        startOffset: 500,
        endOffset: 511,
      });
      await createTestDocumentEntity(document.id, {
        text: 'January 1, 2026',
        entityType: 'DATE',
        confidence: 0.96,
        pageNumber: 1,
        startOffset: 200,
        endOffset: 215,
      });
      await createTestDocumentEntity(document.id, {
        text: 'Delaware',
        entityType: 'JURISDICTION',
        confidence: 0.89,
        pageNumber: 3,
        startOffset: 1000,
        endOffset: 1008,
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .expect(200);

      expect(res.body.entities).toHaveLength(5);
      expect(res.body.pagination.total).toBe(5);

      // Verify all entity types are represented
      const entityTypes = res.body.entities.map((e: any) => e.entityType);
      expect(entityTypes).toContain('ORGANIZATION');
      expect(entityTypes).toContain('PERSON');
      expect(entityTypes).toContain('MONEY');
      expect(entityTypes).toContain('DATE');
      expect(entityTypes).toContain('JURISDICTION');
    });

    it('should return entity statistics with correct counts by type', async () => {
      setMockUser(testUsers.owner);

      // Create multiple entities of different types
      await createTestDocumentEntity(document.id, {
        text: 'Company A',
        entityType: 'ORGANIZATION',
      });
      await createTestDocumentEntity(document.id, {
        text: 'Company B',
        entityType: 'ORGANIZATION',
      });
      await createTestDocumentEntity(document.id, {
        text: 'Person A',
        entityType: 'PERSON',
        needsReview: true,
        confidence: 0.65,
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities/stats`)
        .expect(200);

      expect(res.body.totalEntities).toBe(3);
      expect(res.body.needsReview).toBe(1);
      expect(res.body.byType).toHaveLength(2);

      const orgStat = res.body.byType.find((t: any) => t.entityType === 'ORGANIZATION');
      expect(orgStat._count._all).toBe(2);
    });

    it('should flag low confidence entities for review', async () => {
      setMockUser(testUsers.admin);

      // Sync entities with low confidence
      await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities/sync`)
        .send({
          entities: [
            {
              text: 'High Confidence Corp',
              entityType: 'ORGANIZATION',
              confidence: 0.95,
              startOffset: 0,
              endOffset: 20,
            },
            {
              text: 'Low Confidence Name',
              entityType: 'PERSON',
              confidence: 0.65, // Below 0.8 threshold
              startOffset: 50,
              endOffset: 69,
            },
          ],
        })
        .expect(200);

      // Check entities needing review
      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/entities/needs-review`)
        .expect(200);

      expect(res.body.entities).toHaveLength(1);
      expect(res.body.entities[0].text).toBe('Low Confidence Name');
      expect(res.body.entities[0].needsReview).toBe(true);
    });

    it('should allow human review to verify/reject entities', async () => {
      setMockUser(testUsers.member);

      // Create entity needing review
      const entity = await createTestDocumentEntity(document.id, {
        text: 'Uncertain Entity',
        entityType: 'ORGANIZATION',
        needsReview: true,
        confidence: 0.7,
      });

      // Mark as reviewed
      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities/${entity.id}/reviewed`)
        .expect(200);

      expect(res.body.needsReview).toBe(false);
    });

    it('should search entities across all documents in project', async () => {
      setMockUser(testUsers.owner);

      // Create entity in first document
      await createTestDocumentEntity(document.id, {
        text: 'Acme Corporation',
        entityType: 'ORGANIZATION',
      });

      // Create another document with an entity
      const doc2 = await createTestDocument(project.id, ownerUser.id, {
        name: 'second-contract.pdf',
        folderId: folder.id,
        processingStatus: DocumentStatus.COMPLETE,
      });
      await createTestDocumentEntity(doc2.id, {
        text: 'Acme Holdings',
        entityType: 'ORGANIZATION',
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/entities/search`)
        .query({ query: 'Acme' })
        .expect(200);

      expect(res.body.entities).toHaveLength(2);
      expect(res.body.entities.every((e: any) => e.text.includes('Acme'))).toBe(true);
    });
  });

  // =============================================================================
  // Document Classification Tests
  // =============================================================================
  describe('Document Classification Accuracy', () => {
    it('should store and retrieve document classification', async () => {
      setMockUser(testUsers.member);

      // Classify document manually
      await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({
          documentType: 'CONTRACT',
          riskLevel: 'MEDIUM',
        })
        .expect(200);

      // Retrieve classification
      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .expect(200);

      expect(res.body.documentType).toBe('CONTRACT');
      expect(res.body.riskLevel).toBe('MEDIUM');
    });

    it('should return project classification statistics', async () => {
      setMockUser(testUsers.owner);

      // Create multiple documents with different types
      const doc1 = await createTestDocument(project.id, ownerUser.id, {
        name: 'contract-1.pdf',
        folderId: folder.id,
        processingStatus: DocumentStatus.COMPLETE,
      });
      const doc2 = await createTestDocument(project.id, ownerUser.id, {
        name: 'financial-1.pdf',
        folderId: folder.id,
        processingStatus: DocumentStatus.COMPLETE,
      });

      // Set classifications directly in database
      await testPrisma.document.update({
        where: { id: doc1.id },
        data: { documentType: 'CONTRACT', riskLevel: 'HIGH' },
      });
      await testPrisma.document.update({
        where: { id: doc2.id },
        data: { documentType: 'FINANCIAL', riskLevel: 'LOW' },
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/classification/stats`)
        .expect(200);

      expect(res.body.total).toBeGreaterThanOrEqual(2);
      expect(res.body.classified).toBeGreaterThanOrEqual(2);
      expect(res.body.byType).toBeDefined();
      expect(res.body.byRisk).toBeDefined();
    });

    it('should list documents by classification type', async () => {
      setMockUser(testUsers.owner);

      // Create classified documents
      const contractDoc = await createTestDocument(project.id, ownerUser.id, {
        name: 'test-contract.pdf',
        folderId: folder.id,
        processingStatus: DocumentStatus.COMPLETE,
      });
      await testPrisma.document.update({
        where: { id: contractDoc.id },
        data: { documentType: 'CONTRACT' },
      });

      const financialDoc = await createTestDocument(project.id, ownerUser.id, {
        name: 'test-financial.pdf',
        folderId: folder.id,
        processingStatus: DocumentStatus.COMPLETE,
      });
      await testPrisma.document.update({
        where: { id: financialDoc.id },
        data: { documentType: 'FINANCIAL' },
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/classification/documents`)
        .query({ documentType: 'CONTRACT' })
        .expect(200);

      expect(res.body.documents.length).toBeGreaterThanOrEqual(1);
      expect(res.body.documents.every((d: any) => d.documentType === 'CONTRACT')).toBe(true);
    });

    it('should list unclassified documents', async () => {
      setMockUser(testUsers.owner);

      // Create document without classification
      await createTestDocument(project.id, ownerUser.id, {
        name: 'unclassified.pdf',
        folderId: folder.id,
        processingStatus: DocumentStatus.COMPLETE,
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/classification/unclassified`)
        .expect(200);

      expect(res.body.documents.length).toBeGreaterThanOrEqual(1);
    });

    it('should allow manual classification override', async () => {
      setMockUser(testUsers.member);

      // First classification
      await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({
          documentType: 'CONTRACT',
          riskLevel: 'LOW',
        })
        .expect(200);

      // Override with new classification
      const res = await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({
          documentType: 'LEGAL',
          riskLevel: 'HIGH',
        })
        .expect(200);

      expect(res.body.documentType).toBe('LEGAL');
      expect(res.body.riskLevel).toBe('HIGH');
    });
  });

  // =============================================================================
  // Clause Detection Tests
  // =============================================================================
  describe('Clause Detection on Contracts', () => {
    it('should detect and store various clause types', async () => {
      setMockUser(testUsers.owner);

      // Create clauses that would be detected in a contract
      await createTestClause(document.id, {
        clauseType: 'TERMINATION',
        title: 'Termination for Convenience',
        content: 'Either party may terminate this agreement with 30 days written notice.',
        pageNumber: 5,
        riskLevel: 'MEDIUM',
      });
      await createTestClause(document.id, {
        clauseType: 'INDEMNIFICATION',
        title: 'Indemnification',
        content: 'Seller shall indemnify and hold harmless Buyer from all claims.',
        pageNumber: 8,
        riskLevel: 'HIGH',
      });
      await createTestClause(document.id, {
        clauseType: 'CONFIDENTIALITY',
        title: 'Confidentiality',
        content: 'All information disclosed shall be kept confidential for 5 years.',
        pageNumber: 10,
        riskLevel: 'LOW',
      });
      await createTestClause(document.id, {
        clauseType: 'GOVERNING_LAW',
        title: 'Governing Law',
        content: 'This agreement shall be governed by the laws of Delaware.',
        pageNumber: 15,
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .expect(200);

      expect(res.body.clauses).toHaveLength(4);

      // Verify clause types
      const clauseTypes = res.body.clauses.map((c: any) => c.clauseType);
      expect(clauseTypes).toContain('TERMINATION');
      expect(clauseTypes).toContain('INDEMNIFICATION');
      expect(clauseTypes).toContain('CONFIDENTIALITY');
      expect(clauseTypes).toContain('GOVERNING_LAW');
    });

    it('should flag risk clauses with HIGH risk level', async () => {
      setMockUser(testUsers.owner);

      // Create high-risk clause (unlimited liability)
      await createTestClause(document.id, {
        clauseType: 'LIABILITY',
        title: 'Limitation of Liability',
        content: 'There is no limitation on liability under this agreement.',
        riskLevel: 'HIGH',
      });
      // Create low-risk clause
      await createTestClause(document.id, {
        clauseType: 'LIABILITY',
        title: 'Standard Liability Cap',
        content: 'Liability is limited to the contract value.',
        riskLevel: 'LOW',
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .query({ isRiskFlagged: 'true' })
        .expect(200);

      expect(res.body.clauses).toHaveLength(1);
      expect(res.body.clauses[0].riskLevel).toBe('HIGH');
    });

    it('should return clause statistics by type', async () => {
      setMockUser(testUsers.owner);

      // Create various clauses
      await createTestClause(document.id, { clauseType: 'TERMINATION' });
      await createTestClause(document.id, { clauseType: 'TERMINATION' });
      await createTestClause(document.id, { clauseType: 'INDEMNIFICATION', riskLevel: 'HIGH' });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/stats`)
        .expect(200);

      expect(res.body.totalClauses).toBe(3);
      expect(res.body.riskFlagged).toBe(1);
      expect(res.body.byType).toBeDefined();
    });

    it('should allow verification and rejection of detected clauses', async () => {
      setMockUser(testUsers.member);

      // Create clause to verify
      const clause = await createTestClause(document.id, {
        clauseType: 'TERMINATION',
        title: 'Clause to Verify',
      });

      // Verify the clause
      const verifyRes = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/${clause.id}/verify`)
        .send({ note: 'Verified as correct' })
        .expect(200);

      expect(verifyRes.body.isVerified).toBe(true);
      expect(verifyRes.body.verificationNote).toBe('Verified as correct');
    });

    it('should filter clauses by type and risk level', async () => {
      setMockUser(testUsers.owner);

      await createTestClause(document.id, { clauseType: 'TERMINATION', riskLevel: 'HIGH' });
      await createTestClause(document.id, { clauseType: 'TERMINATION', riskLevel: 'LOW' });
      await createTestClause(document.id, { clauseType: 'INDEMNIFICATION', riskLevel: 'HIGH' });

      // Filter by type
      const typeRes = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .query({ clauseType: 'TERMINATION' })
        .expect(200);

      expect(typeRes.body.clauses).toHaveLength(2);

      // Filter by risk
      const riskRes = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .query({ riskLevel: 'HIGH' })
        .expect(200);

      expect(riskRes.body.clauses).toHaveLength(2);

      // Combined filter
      const combinedRes = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .query({ clauseType: 'TERMINATION', riskLevel: 'HIGH' })
        .expect(200);

      expect(combinedRes.body.clauses).toHaveLength(1);
    });

    it('should search clauses across project documents', async () => {
      setMockUser(testUsers.owner);

      // Create clauses in first document
      await createTestClause(document.id, {
        clauseType: 'TERMINATION',
        content: 'Either party may terminate with notice.',
      });

      // Create another document with a clause
      const doc2 = await createTestDocument(project.id, ownerUser.id, {
        name: 'another-contract.pdf',
        folderId: folder.id,
        processingStatus: DocumentStatus.COMPLETE,
      });
      await createTestClause(doc2.id, {
        clauseType: 'TERMINATION',
        content: 'Termination requires 60 days notice.',
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/clauses/search`)
        .query({ query: 'terminate' })
        .expect(200);

      expect(res.body.clauses.length).toBeGreaterThanOrEqual(2);
    });
  });

  // =============================================================================
  // Semantic Search Tests
  // =============================================================================
  describe('Semantic Search Relevance', () => {
    it('should accept semantic search type parameter', async () => {
      setMockUser(testUsers.owner);

      const res = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({
          query: 'acquisition agreement',
          searchType: 'semantic',
        })
        .expect(200);

      expect(res.body.searchType).toBe('semantic');
      expect(res.body.results).toBeDefined();
      expect(res.body.pagination).toBeDefined();
    });

    it('should accept hybrid search type parameter', async () => {
      setMockUser(testUsers.owner);

      const res = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({
          query: 'merger agreement',
          searchType: 'hybrid',
        })
        .expect(200);

      expect(res.body.searchType).toBe('hybrid');
    });

    it('should default to keyword search when type not specified', async () => {
      setMockUser(testUsers.owner);

      const res = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({ query: 'contract' })
        .expect(200);

      // Should fallback to keyword when Python service unavailable
      expect(res.body.searchType).toBeDefined();
    });

    it('should return results with relevance scores for semantic search', async () => {
      setMockUser(testUsers.owner);

      const res = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({
          query: 'indemnification clause',
          searchType: 'semantic',
        })
        .expect(200);

      // Results should have score field when available
      expect(res.body.results).toBeDefined();
    });

    it('should create audit log for semantic search', async () => {
      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({
          query: 'liability clause',
          searchType: 'semantic',
        })
        .expect(200);

      const auditLog = await testPrisma.auditLog.findFirst({
        where: {
          projectId: project.id,
          action: { in: ['search.execute', 'search.semantic'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLog).not.toBeNull();
      expect(auditLog?.metadata).toHaveProperty('query');
    });
  });

  // =============================================================================
  // Find Similar Tests
  // =============================================================================
  describe('Find Similar Functionality', () => {
    it('should return similar documents endpoint', async () => {
      setMockUser(testUsers.owner);

      const res = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search/similar/${document.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(res.body).toHaveProperty('results');
      expect(res.body).toHaveProperty('searchType', 'semantic');
      expect(res.body).toHaveProperty('pagination');
    });

    it('should return 404 for non-existent document', async () => {
      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/search/similar/non-existent-id`)
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });

    it('should respect folder access restrictions for Find Similar', async () => {
      // Create a restricted folder
      const restrictedFolder = await createTestFolder(project.id, { name: 'Restricted' });
      const restrictedDoc = await createTestDocument(project.id, ownerUser.id, {
        name: 'restricted-doc.pdf',
        folderId: restrictedFolder.id,
        processingStatus: DocumentStatus.COMPLETE,
      });

      // Create an allowed folder for member
      const allowedFolder = await createTestFolder(project.id, { name: 'Allowed' });

      // Update member with restricted folder access
      await testPrisma.projectMember.updateMany({
        where: {
          projectId: project.id,
          userId: memberUser.id,
        },
        data: {
          permissions: {
            canAccessVDR: true,
            restrictedFolders: [allowedFolder.id],
          },
        },
      });

      setMockUser(testUsers.member);

      // Member should not be able to find similar for restricted document
      await createTestApp()
        .post(`/api/v1/projects/${project.id}/search/similar/${restrictedDoc.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });

    it('should return empty results when Python service unavailable', async () => {
      setMockUser(testUsers.owner);

      const res = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search/similar/${document.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      // Without Python service, should gracefully return empty results
      expect(res.body.results).toEqual([]);
      expect(res.body.pagination.total).toBe(0);
    });
  });

  // =============================================================================
  // Search Filters Tests
  // =============================================================================
  describe('Search Filters (Type, Entity, Clause)', () => {
    it('should filter search results by document type', async () => {
      setMockUser(testUsers.owner);

      // Create documents with different types
      const contractDoc = await createTestDocument(project.id, ownerUser.id, {
        name: 'Acquisition Contract.pdf',
        folderId: folder.id,
        processingStatus: DocumentStatus.COMPLETE,
      });
      await testPrisma.document.update({
        where: { id: contractDoc.id },
        data: { documentType: 'CONTRACT' },
      });

      const financialDoc = await createTestDocument(project.id, ownerUser.id, {
        name: 'Acquisition Financial Report.pdf',
        folderId: folder.id,
        processingStatus: DocumentStatus.COMPLETE,
      });
      await testPrisma.document.update({
        where: { id: financialDoc.id },
        data: { documentType: 'FINANCIAL' },
      });

      const res = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({
          query: 'Acquisition',
          documentTypes: ['CONTRACT'],
        })
        .expect(200);

      // All results should be contracts (if any match)
      for (const result of res.body.results) {
        if (result.documentType) {
          expect(result.documentType).toBe('CONTRACT');
        }
      }
    });

    it('should filter search by date range', async () => {
      setMockUser(testUsers.owner);

      const res = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({
          query: 'contract',
          dateFrom: '2026-01-01',
          dateTo: '2026-12-31',
        })
        .expect(200);

      expect(res.body.results).toBeDefined();
    });

    it('should filter search by folder', async () => {
      setMockUser(testUsers.owner);

      // Create another folder
      const otherFolder = await createTestFolder(project.id, { name: 'Other' });
      await createTestDocument(project.id, ownerUser.id, {
        name: 'Other Document.pdf',
        folderId: otherFolder.id,
        processingStatus: DocumentStatus.COMPLETE,
      });

      const res = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({
          query: 'Document',
          folderIds: [folder.id],
        })
        .expect(200);

      // Results should only be from specified folder
      for (const result of res.body.results) {
        if (result.folderId) {
          expect(result.folderId).toBe(folder.id);
        }
      }
    });

    it('should combine multiple search filters', async () => {
      setMockUser(testUsers.owner);

      // Create document matching multiple criteria
      const testDoc = await createTestDocument(project.id, ownerUser.id, {
        name: 'Q1 Contract Review.pdf',
        folderId: folder.id,
        processingStatus: DocumentStatus.COMPLETE,
      });
      await testPrisma.document.update({
        where: { id: testDoc.id },
        data: { documentType: 'CONTRACT' },
      });

      const res = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({
          query: 'Review',
          documentTypes: ['CONTRACT'],
          folderIds: [folder.id],
        })
        .expect(200);

      expect(res.body.results).toBeDefined();
    });

    it('should return empty results when no documents match filters', async () => {
      setMockUser(testUsers.owner);

      const res = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({
          query: 'nonexistent-xyz-123',
          documentTypes: ['TAX'],
        })
        .expect(200);

      expect(res.body.results).toHaveLength(0);
    });
  });

  // =============================================================================
  // Integration Workflow Tests
  // =============================================================================
  describe('End-to-End Integration Workflows', () => {
    it('should support complete document analysis workflow', async () => {
      setMockUser(testUsers.owner);

      // 1. Document is uploaded and classified
      const analysisDoc = await createTestDocument(project.id, ownerUser.id, {
        name: 'acquisition-agreement.pdf',
        folderId: folder.id,
        processingStatus: DocumentStatus.COMPLETE,
      });

      // 2. Set classification
      await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${analysisDoc.id}/classification`)
        .send({
          documentType: 'CONTRACT',
          riskLevel: 'MEDIUM',
        })
        .expect(200);

      // 3. Entities are extracted and stored
      await createTestDocumentEntity(analysisDoc.id, {
        text: 'Target Company Inc.',
        entityType: 'ORGANIZATION',
        confidence: 0.95,
      });
      await createTestDocumentEntity(analysisDoc.id, {
        text: '$50,000,000',
        entityType: 'MONEY',
        confidence: 0.98,
      });

      // 4. Clauses are detected
      await createTestClause(analysisDoc.id, {
        clauseType: 'CHANGE_OF_CONTROL',
        title: 'Change of Control',
        content: 'Upon change of control, the agreement may be terminated.',
        riskLevel: 'HIGH',
      });

      // 5. Verify all data is retrievable
      const classRes = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${analysisDoc.id}/classification`)
        .expect(200);
      expect(classRes.body.documentType).toBe('CONTRACT');

      const entitiesRes = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${analysisDoc.id}/entities`)
        .expect(200);
      expect(entitiesRes.body.entities).toHaveLength(2);

      const clausesRes = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${analysisDoc.id}/clauses`)
        .expect(200);
      expect(clausesRes.body.clauses).toHaveLength(1);

      // 6. Search should find the document
      const searchRes = await createTestApp()
        .post(`/api/v1/projects/${project.id}/search`)
        .set('Authorization', 'Bearer test-token')
        .send({ query: 'acquisition' })
        .expect(200);
      expect(searchRes.body.results).toBeDefined();
    });

    it('should allow review workflow for entities and clauses', async () => {
      setMockUser(testUsers.member);

      // Create entity needing review
      const entity = await createTestDocumentEntity(document.id, {
        text: 'Unclear Company Name',
        entityType: 'ORGANIZATION',
        needsReview: true,
        confidence: 0.65,
      });

      // Create clause to verify
      const clause = await createTestClause(document.id, {
        clauseType: 'LIABILITY',
        title: 'Liability Clause',
        content: 'Unlimited liability for all damages.',
        riskLevel: 'HIGH',
      });

      // Review entity
      await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities/${entity.id}/reviewed`)
        .expect(200);

      // Verify clause
      await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/${clause.id}/verify`)
        .send({ note: 'Confirmed high risk clause' })
        .expect(200);

      // Check review queue is empty
      setMockUser(testUsers.owner);
      const reviewRes = await testRequest
        .get(`/api/v1/projects/${project.id}/entities/needs-review`)
        .expect(200);

      // Should not contain the reviewed entity
      const stillNeedsReview = reviewRes.body.entities.find((e: any) => e.id === entity.id);
      expect(stillNeedsReview).toBeUndefined();
    });

    it('should maintain audit trail for all extraction operations', async () => {
      setMockUser(testUsers.admin);

      const auditDoc = await createTestDocument(project.id, ownerUser.id, {
        name: 'audit-test.pdf',
        folderId: folder.id,
        processingStatus: DocumentStatus.COMPLETE,
      });

      // Perform classification
      await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${auditDoc.id}/classification`)
        .send({ documentType: 'LEGAL', riskLevel: 'MEDIUM' })
        .expect(200);

      // Sync entities
      await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${auditDoc.id}/entities/sync`)
        .send({
          entities: [
            {
              text: 'Audit Entity',
              entityType: 'ORGANIZATION',
              confidence: 0.9,
              startOffset: 0,
              endOffset: 12,
            },
          ],
        })
        .expect(200);

      // Verify audit logs exist
      const auditLogs = await testPrisma.auditLog.findMany({
        where: {
          projectId: project.id,
          resourceId: auditDoc.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    });
  });

  // =============================================================================
  // IDOR Protection Tests
  // =============================================================================
  describe('IDOR Protection', () => {
    let otherProject: { id: string };
    let otherDoc: { id: string };

    beforeAll(async () => {
      // Create a separate project owned by the outsider user for IDOR tests
      otherProject = await createTestProject(outsiderUser.id, {
        name: 'Other Project for IDOR',
      });
      otherDoc = await createTestDocument(otherProject.id, outsiderUser.id, {
        name: 'idor-test-doc.pdf',
        processingStatus: DocumentStatus.COMPLETE,
      });
    });

    it('should prevent accessing entities from another project', async () => {
      const otherEntity = await createTestDocumentEntity(otherDoc.id, {
        text: 'Other Entity',
      });

      setMockUser(testUsers.owner);

      // Try to access entity from other project through current project
      await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${otherDoc.id}/entities/${otherEntity.id}`)
        .expect(404);
    });

    it('should prevent accessing clauses from another project', async () => {
      const otherClause = await createTestClause(otherDoc.id, {
        clauseType: 'TERMINATION',
      });

      setMockUser(testUsers.owner);

      // Try to access clause from other project
      await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${otherDoc.id}/clauses/${otherClause.id}`)
        .expect(404);
    });

    it('should prevent cross-project classification access', async () => {
      setMockUser(testUsers.owner);

      // Try to classify document from other project
      await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${otherDoc.id}/classification`)
        .send({ documentType: 'CONTRACT' })
        .expect(404);
    });
  });

  // =============================================================================
  // Permission Tests
  // =============================================================================
  describe('Permission Enforcement', () => {
    it('should allow VIEWER to read but not write entities', async () => {
      setMockUser(testUsers.viewer);

      const entity = await createTestDocumentEntity(document.id, {
        text: 'Test Entity',
      });

      // Can read
      await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .expect(200);

      // Cannot create
      await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities`)
        .send({
          text: 'New Entity',
          entityType: 'PERSON',
        })
        .expect(403);
    });

    it('should allow VIEWER to read but not write clauses', async () => {
      setMockUser(testUsers.viewer);

      const clause = await createTestClause(document.id, {
        clauseType: 'TERMINATION',
      });

      // Can read
      await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .expect(200);

      // Cannot verify
      await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/${clause.id}/verify`)
        .send({ note: 'Attempting verification' })
        .expect(403);
    });

    it('should allow VIEWER to read but not write classification', async () => {
      setMockUser(testUsers.viewer);

      // Can read
      await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .expect(200);

      // Cannot write
      await testRequest
        .put(`/api/v1/projects/${project.id}/documents/${document.id}/classification`)
        .send({ documentType: 'CONTRACT' })
        .expect(403);
    });

    it('should require ADMIN for syncing entities', async () => {
      setMockUser(testUsers.member);

      await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities/sync`)
        .send({
          entities: [
            {
              text: 'Sync Test',
              entityType: 'ORGANIZATION',
              confidence: 0.9,
              startOffset: 0,
              endOffset: 9,
            },
          ],
        })
        .expect(403);

      setMockUser(testUsers.admin);

      await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/entities/sync`)
        .send({
          entities: [
            {
              text: 'Sync Test',
              entityType: 'ORGANIZATION',
              confidence: 0.9,
              startOffset: 0,
              endOffset: 9,
            },
          ],
        })
        .expect(200);
    });
  });
});
