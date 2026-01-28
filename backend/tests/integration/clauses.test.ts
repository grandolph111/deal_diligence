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
  createTestClause,
} from '../utils';

describe('Clause Detection API', () => {
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
    project = await createTestProject(ownerUser.id, { name: 'Clause Test Project' });

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

  describe('GET /projects/:projectId/documents/:documentId/clauses', () => {
    it('should return 401 when not authenticated', async () => {
      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .expect(401);

      expect(res.body.error).toBeDefined();
    });

    it('should return 403 when user is not a project member', async () => {
      setMockUser(testUsers.outsider);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .expect(403);

      expect(res.body.error).toBeDefined();
    });

    it('should return 404 for non-existent document', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/non-existent-id/clauses`)
        .expect(404);

      expect(res.body.error).toBeDefined();
    });

    it('should return empty list when document has no clauses', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .expect(200);

      expect(res.body.clauses).toEqual([]);
      expect(res.body.pagination).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });

    it('should return clauses for a document', async () => {
      setMockUser(testUsers.owner);

      // Create test clauses
      await createTestClause(document.id, {
        clauseType: 'TERMINATION',
        title: 'Termination for Convenience',
        content: 'Either party may terminate this agreement...',
        riskLevel: 'MEDIUM',
      });
      await createTestClause(document.id, {
        clauseType: 'INDEMNIFICATION',
        title: 'Indemnification',
        content: 'The seller shall indemnify the buyer...',
        riskLevel: 'HIGH',
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .expect(200);

      expect(res.body.clauses).toHaveLength(2);
      expect(res.body.pagination.total).toBe(2);
    });

    it('should filter clauses by clauseType', async () => {
      setMockUser(testUsers.owner);

      await createTestClause(document.id, { clauseType: 'TERMINATION' });
      await createTestClause(document.id, { clauseType: 'INDEMNIFICATION' });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .query({ clauseType: 'TERMINATION' })
        .expect(200);

      expect(res.body.clauses).toHaveLength(1);
      expect(res.body.clauses[0].clauseType).toBe('TERMINATION');
    });

    it('should filter clauses by riskLevel', async () => {
      setMockUser(testUsers.owner);

      await createTestClause(document.id, { riskLevel: 'HIGH' });
      await createTestClause(document.id, { riskLevel: 'LOW' });
      await createTestClause(document.id, { riskLevel: undefined });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .query({ riskLevel: 'HIGH' })
        .expect(200);

      expect(res.body.clauses).toHaveLength(1);
      expect(res.body.clauses[0].riskLevel).toBe('HIGH');
    });

    it('should filter clauses by isRiskFlagged', async () => {
      setMockUser(testUsers.owner);

      await createTestClause(document.id, { riskLevel: 'HIGH' });
      await createTestClause(document.id, { riskLevel: undefined });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .query({ isRiskFlagged: 'true' })
        .expect(200);

      expect(res.body.clauses).toHaveLength(1);
      expect(res.body.clauses[0].riskLevel).toBe('HIGH');
    });

    it('should allow VIEWER with canAccessVDR permission to read clauses', async () => {
      setMockUser(testUsers.viewer);

      await createTestClause(document.id, { clauseType: 'TERMINATION' });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .expect(200);

      expect(res.body.clauses).toHaveLength(1);
    });
  });

  describe('GET /projects/:projectId/documents/:documentId/clauses/:clauseId', () => {
    it('should return a single clause', async () => {
      setMockUser(testUsers.owner);

      const clause = await createTestClause(document.id, {
        clauseType: 'LIABILITY',
        title: 'Limitation of Liability',
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/${clause.id}`)
        .expect(200);

      expect(res.body.id).toBe(clause.id);
      expect(res.body.clauseType).toBe('LIABILITY');
      expect(res.body.title).toBe('Limitation of Liability');
    });

    it('should return 404 for non-existent clause', async () => {
      setMockUser(testUsers.owner);

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/non-existent-id`)
        .expect(404);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /projects/:projectId/documents/:documentId/clauses/stats', () => {
    it('should return clause statistics for a document', async () => {
      setMockUser(testUsers.owner);

      await createTestClause(document.id, { clauseType: 'TERMINATION', riskLevel: 'HIGH' });
      await createTestClause(document.id, { clauseType: 'TERMINATION', riskLevel: 'MEDIUM' });
      await createTestClause(document.id, { clauseType: 'INDEMNIFICATION', isVerified: true });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/stats`)
        .expect(200);

      expect(res.body.documentId).toBe(document.id);
      expect(res.body.totalClauses).toBe(3);
      expect(res.body.riskFlaggedCount).toBe(2);
      expect(res.body.verifiedCount).toBe(1);
      expect(res.body.byType).toHaveLength(2);
      expect(res.body.byRiskLevel).toHaveLength(2);
    });
  });

  describe('POST /projects/:projectId/documents/:documentId/clauses', () => {
    it('should create a clause as MEMBER', async () => {
      setMockUser(testUsers.member);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .send({
          clauseType: 'TERMINATION',
          title: 'Manual Clause',
          content: 'This is a manually created clause.',
          pageNumber: 5,
          riskLevel: 'LOW',
        })
        .expect(201);

      expect(res.body.clauseType).toBe('TERMINATION');
      expect(res.body.title).toBe('Manual Clause');
      expect(res.body.source).toBe('manual');
      expect(res.body.confidence).toBe(1.0);
    });

    it('should return 403 for VIEWER trying to create clause', async () => {
      setMockUser(testUsers.viewer);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .send({
          clauseType: 'TERMINATION',
          content: 'Test content',
        })
        .expect(403);

      expect(res.body.error).toBeDefined();
    });

    it('should return 400 for invalid clauseType', async () => {
      setMockUser(testUsers.member);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .send({
          clauseType: 'INVALID_TYPE',
          content: 'Test content',
        })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });

    it('should return 400 for missing content', async () => {
      setMockUser(testUsers.member);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .send({
          clauseType: 'TERMINATION',
        })
        .expect(400);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('PATCH /projects/:projectId/documents/:documentId/clauses/:clauseId', () => {
    it('should update a clause as MEMBER', async () => {
      setMockUser(testUsers.member);

      const clause = await createTestClause(document.id, {
        clauseType: 'TERMINATION',
        riskLevel: 'LOW',
      });

      const res = await testRequest
        .patch(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/${clause.id}`)
        .send({
          riskLevel: 'HIGH',
          title: 'Updated Title',
        })
        .expect(200);

      expect(res.body.riskLevel).toBe('HIGH');
      expect(res.body.title).toBe('Updated Title');
    });

    it('should return 403 for VIEWER trying to update clause', async () => {
      setMockUser(testUsers.viewer);

      const clause = await createTestClause(document.id);

      const res = await testRequest
        .patch(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/${clause.id}`)
        .send({ riskLevel: 'HIGH' })
        .expect(403);

      expect(res.body.error).toBeDefined();
    });

    it('should return 404 for non-existent clause', async () => {
      setMockUser(testUsers.member);

      const res = await testRequest
        .patch(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/non-existent-id`)
        .send({ riskLevel: 'HIGH' })
        .expect(404);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('DELETE /projects/:projectId/documents/:documentId/clauses/:clauseId', () => {
    it('should delete a clause as ADMIN', async () => {
      setMockUser(testUsers.admin);

      const clause = await createTestClause(document.id);

      await testRequest
        .delete(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/${clause.id}`)
        .expect(204);

      // Verify deletion
      setMockUser(testUsers.owner);
      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/${clause.id}`)
        .expect(404);

      expect(res.body.error).toBeDefined();
    });

    it('should return 403 for MEMBER trying to delete clause', async () => {
      setMockUser(testUsers.member);

      const clause = await createTestClause(document.id);

      const res = await testRequest
        .delete(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/${clause.id}`)
        .expect(403);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('POST /projects/:projectId/documents/:documentId/clauses/:clauseId/verify', () => {
    it('should verify a clause as MEMBER', async () => {
      setMockUser(testUsers.member);

      const clause = await createTestClause(document.id, { source: 'berrydb' });

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/${clause.id}/verify`)
        .send({ note: 'Verified as correct' })
        .expect(200);

      expect(res.body.isVerified).toBe(true);
      expect(res.body.verifiedBy).toBeDefined();
      expect(res.body.verificationNote).toBe('Verified as correct');
    });

    it('should clear rejection when verifying', async () => {
      setMockUser(testUsers.member);

      const clause = await createTestClause(document.id, { isRejected: true });

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/${clause.id}/verify`)
        .expect(200);

      expect(res.body.isVerified).toBe(true);
      expect(res.body.isRejected).toBe(false);
    });
  });

  describe('POST /projects/:projectId/documents/:documentId/clauses/:clauseId/reject', () => {
    it('should reject a clause as MEMBER', async () => {
      setMockUser(testUsers.member);

      const clause = await createTestClause(document.id, { source: 'berrydb' });

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/${clause.id}/reject`)
        .send({ note: 'Incorrectly detected' })
        .expect(200);

      expect(res.body.isRejected).toBe(true);
      expect(res.body.rejectedBy).toBeDefined();
      expect(res.body.rejectionNote).toBe('Incorrectly detected');
    });

    it('should clear verification when rejecting', async () => {
      setMockUser(testUsers.member);

      const clause = await createTestClause(document.id, { isVerified: true });

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/${clause.id}/reject`)
        .expect(200);

      expect(res.body.isRejected).toBe(true);
      expect(res.body.isVerified).toBe(false);
    });
  });

  describe('POST /projects/:projectId/documents/:documentId/clauses/sync', () => {
    it('should sync clauses from Python service as ADMIN', async () => {
      setMockUser(testUsers.admin);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/sync`)
        .send({
          clauses: [
            {
              clauseType: 'TERMINATION',
              title: 'Termination Clause',
              content: 'Either party may terminate...',
              pageNumber: 1,
              confidence: 0.95,
              riskLevel: 'MEDIUM',
            },
            {
              clauseType: 'INDEMNIFICATION',
              content: 'The seller shall indemnify...',
              pageNumber: 3,
              confidence: 0.88,
              riskLevel: 'HIGH',
            },
          ],
        })
        .expect(200);

      expect(res.body.synced).toBe(2);
      expect(res.body.documentId).toBe(document.id);

      // Verify clauses were created
      const listRes = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${document.id}/clauses`)
        .expect(200);

      expect(listRes.body.clauses).toHaveLength(2);
    });

    it('should return 403 for MEMBER trying to sync clauses', async () => {
      setMockUser(testUsers.member);

      const res = await testRequest
        .post(`/api/v1/projects/${project.id}/documents/${document.id}/clauses/sync`)
        .send({
          clauses: [
            {
              clauseType: 'TERMINATION',
              content: 'Test',
              confidence: 0.9,
            },
          ],
        })
        .expect(403);

      expect(res.body.error).toBeDefined();
    });
  });

  describe('GET /projects/:projectId/clauses/search', () => {
    it('should search clauses across project documents', async () => {
      setMockUser(testUsers.owner);

      // Create another document
      const document2 = await createTestDocument(project.id, ownerUser.id, {
        name: 'another-contract.pdf',
        processingStatus: DocumentStatus.COMPLETE,
      });

      await createTestClause(document.id, {
        clauseType: 'TERMINATION',
        content: 'Party may terminate with 30 days notice',
      });
      await createTestClause(document2.id, {
        clauseType: 'TERMINATION',
        content: 'Immediate termination for cause',
      });
      await createTestClause(document.id, {
        clauseType: 'INDEMNIFICATION',
        content: 'Seller indemnifies buyer',
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/clauses/search`)
        .query({ query: 'termination' })
        .expect(200);

      expect(res.body.clauses).toHaveLength(2);
      expect(res.body.clauses.every((c: { clauseType: string }) => c.clauseType === 'TERMINATION')).toBe(true);
    });

    it('should filter search by clauseType', async () => {
      setMockUser(testUsers.owner);

      await createTestClause(document.id, {
        clauseType: 'TERMINATION',
        content: 'Termination clause content',
      });
      await createTestClause(document.id, {
        clauseType: 'INDEMNIFICATION',
        content: 'Indemnification and termination provisions',
      });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/clauses/search`)
        .query({ query: 'termination', clauseType: 'TERMINATION' })
        .expect(200);

      expect(res.body.clauses).toHaveLength(1);
      expect(res.body.clauses[0].clauseType).toBe('TERMINATION');
    });
  });

  describe('GET /projects/:projectId/clauses/risk-flagged', () => {
    it('should return risk-flagged clauses across project', async () => {
      setMockUser(testUsers.owner);

      await createTestClause(document.id, { riskLevel: 'HIGH' });
      await createTestClause(document.id, { riskLevel: 'CRITICAL' });
      await createTestClause(document.id, { riskLevel: undefined });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/clauses/risk-flagged`)
        .expect(200);

      expect(res.body.clauses).toHaveLength(2);
      // CRITICAL should come before HIGH
      expect(res.body.clauses[0].riskLevel).toBe('CRITICAL');
      expect(res.body.clauses[1].riskLevel).toBe('HIGH');
    });
  });

  describe('GET /projects/:projectId/clauses/unverified', () => {
    it('should return unverified AI-detected clauses', async () => {
      setMockUser(testUsers.owner);

      await createTestClause(document.id, { source: 'berrydb', isVerified: false });
      await createTestClause(document.id, { source: 'berrydb', isVerified: true });
      await createTestClause(document.id, { source: 'manual', isVerified: false });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/clauses/unverified`)
        .expect(200);

      // Only unverified AI-detected clauses should be returned
      expect(res.body.clauses).toHaveLength(1);
      expect(res.body.clauses[0].source).toBe('berrydb');
      expect(res.body.clauses[0].isVerified).toBe(false);
    });
  });

  describe('GET /projects/:projectId/clauses/stats', () => {
    it('should return project-level clause statistics', async () => {
      setMockUser(testUsers.owner);

      // Create another document
      const document2 = await createTestDocument(project.id, ownerUser.id, {
        name: 'another-contract.pdf',
        processingStatus: DocumentStatus.COMPLETE,
      });

      await createTestClause(document.id, { clauseType: 'TERMINATION', riskLevel: 'HIGH' });
      await createTestClause(document.id, { clauseType: 'INDEMNIFICATION', isVerified: true });
      await createTestClause(document2.id, { clauseType: 'TERMINATION', source: 'berrydb' });
      await createTestClause(document2.id, { isRejected: true });

      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/clauses/stats`)
        .expect(200);

      expect(res.body.projectId).toBe(project.id);
      expect(res.body.totalClauses).toBe(4);
      expect(res.body.riskFlaggedCount).toBe(1);
      expect(res.body.verifiedCount).toBe(1);
      expect(res.body.rejectedCount).toBe(1);
      expect(res.body.pendingReviewCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('IDOR Protection', () => {
    it('should return 404 when accessing document from different project', async () => {
      setMockUser(testUsers.owner);

      // Create another project
      const otherProject = await createTestProject(ownerUser.id, { name: 'Other Project' });
      const otherDocument = await createTestDocument(otherProject.id, ownerUser.id, {
        name: 'other-doc.pdf',
      });

      // Try to access document from other project via first project's URL
      const res = await testRequest
        .get(`/api/v1/projects/${project.id}/documents/${otherDocument.id}/clauses`)
        .expect(404);

      expect(res.body.error).toBeDefined();
    });
  });
});
