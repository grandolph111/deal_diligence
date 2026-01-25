/**
 * Document Processing Pipeline Integration Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../src/app';
import { prisma } from '../../src/config/database';
import { setMockUser, testUsers } from '../utils/auth-mock';
import {
  createTestUser,
  createTestProject,
  createTestDocument,
  addProjectMember,
  cleanDatabase,
} from '../utils/db-helpers';
import { ProjectRole } from '@prisma/client';

describe('Document Processing Pipeline', () => {
  let ownerUser: { id: string; auth0Id: string };
  let memberUser: { id: string; auth0Id: string };
  let project: { id: string };
  let document: { id: string };

  beforeEach(async () => {
    await cleanDatabase();

    // Create test users using predefined testUsers
    ownerUser = await createTestUser(testUsers.owner);
    memberUser = await createTestUser(testUsers.member);

    // Create project with owner
    project = await createTestProject(ownerUser.id, {
      name: 'Test Project',
    });

    // Add member to project with VDR access
    await addProjectMember(project.id, memberUser.id, ProjectRole.MEMBER, {
      canAccessVDR: true,
      canUploadDocs: true,
    });

    // Create test document in PENDING status
    document = await createTestDocument({
      projectId: project.id,
      uploadedById: ownerUser.id,
      name: 'test-document.pdf',
      processingStatus: 'PENDING',
    });
  });

  afterEach(async () => {
    await cleanDatabase();
  });

  describe('GET /api/v1/projects/:id/processing/status/:documentId', () => {
    it('should return processing status for a document', async () => {
      setMockUser(testUsers.owner);

      const res = await request(app)
        .get(`/api/v1/projects/${project.id}/processing/status/${document.id}`)
        .set('Authorization', 'Bearer mock-token');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        documentId: document.id,
        status: 'PENDING',
        retryCount: 0,
      });
    });

    it('should return 500 for non-existent document', async () => {
      setMockUser(testUsers.owner);

      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/api/v1/projects/${project.id}/processing/status/${fakeId}`)
        .set('Authorization', 'Bearer mock-token');

      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/v1/projects/:id/processing/pending', () => {
    it('should return pending documents for owner', async () => {
      setMockUser(testUsers.owner);

      const res = await request(app)
        .get(`/api/v1/projects/${project.id}/processing/pending`)
        .set('Authorization', 'Bearer mock-token');

      expect(res.status).toBe(200);
      expect(res.body.documents).toHaveLength(1);
      expect(res.body.documents[0].id).toBe(document.id);
    });

    it('should return 403 for member (requires ADMIN)', async () => {
      setMockUser(testUsers.member);

      const res = await request(app)
        .get(`/api/v1/projects/${project.id}/processing/pending`)
        .set('Authorization', 'Bearer mock-token');

      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/v1/projects/:id/processing/failed', () => {
    it('should return failed documents', async () => {
      setMockUser(testUsers.owner);

      // Update document to FAILED status
      await prisma.document.update({
        where: { id: document.id },
        data: {
          processingStatus: 'FAILED',
          lastError: 'Test error',
          retryCount: 3,
        },
      });

      const res = await request(app)
        .get(`/api/v1/projects/${project.id}/processing/failed`)
        .set('Authorization', 'Bearer mock-token');

      expect(res.status).toBe(200);
      expect(res.body.documents).toHaveLength(1);
      expect(res.body.documents[0].id).toBe(document.id);
      expect(res.body.documents[0].lastError).toBe('Test error');
    });

    it('should return empty array when no failed documents', async () => {
      setMockUser(testUsers.owner);

      const res = await request(app)
        .get(`/api/v1/projects/${project.id}/processing/failed`)
        .set('Authorization', 'Bearer mock-token');

      expect(res.status).toBe(200);
      expect(res.body.documents).toHaveLength(0);
    });
  });

  describe('POST /api/v1/projects/:id/processing/retry', () => {
    it('should retry a failed document', async () => {
      setMockUser(testUsers.owner);

      // Set document to FAILED status
      await prisma.document.update({
        where: { id: document.id },
        data: {
          processingStatus: 'FAILED',
          retryCount: 3,
          lastError: 'Previous error',
        },
      });

      const res = await request(app)
        .post(`/api/v1/projects/${project.id}/processing/retry`)
        .set('Authorization', 'Bearer mock-token')
        .send({ documentId: document.id });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Document queued for reprocessing');

      // Verify document status was reset (may be PENDING or PROCESSING depending on timing)
      const updatedDoc = await prisma.document.findUnique({
        where: { id: document.id },
      });
      expect(['PENDING', 'PROCESSING', 'COMPLETE']).toContain(updatedDoc?.processingStatus);
    });

    it('should return 403 for member (requires ADMIN)', async () => {
      setMockUser(testUsers.member);

      const res = await request(app)
        .post(`/api/v1/projects/${project.id}/processing/retry`)
        .set('Authorization', 'Bearer mock-token')
        .send({ documentId: document.id });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/processing/callback', () => {
    it('should update document status on successful processing', async () => {
      const res = await request(app)
        .post('/api/v1/processing/callback')
        .send({
          document_id: document.id,
          status: 'completed',
          berrydb_id: 'berry-123',
          document_type: 'contract',
          risk_level: 'medium',
          page_count: 10,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify document was updated
      const updatedDoc = await prisma.document.findUnique({
        where: { id: document.id },
      });
      expect(updatedDoc?.processingStatus).toBe('COMPLETE');
      expect(updatedDoc?.berryDbId).toBe('berry-123');
      expect(updatedDoc?.documentType).toBe('contract');
      expect(updatedDoc?.riskLevel).toBe('medium');
      expect(updatedDoc?.pageCount).toBe(10);
    });

    it('should mark document as failed on processing error', async () => {
      const res = await request(app)
        .post('/api/v1/processing/callback')
        .send({
          document_id: document.id,
          status: 'failed',
          error: 'OCR extraction failed',
        });

      expect(res.status).toBe(200);

      // Verify document has error recorded (may have retryCount incremented)
      const updatedDoc = await prisma.document.findUnique({
        where: { id: document.id },
      });
      expect(updatedDoc?.lastError).toContain('OCR extraction failed');
    });

    it('should return 500 for non-existent document', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .post('/api/v1/processing/callback')
        .send({
          document_id: fakeId,
          status: 'completed',
        });

      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/v1/projects/:id/processing/process-all', () => {
    it('should trigger processing for all pending documents', async () => {
      setMockUser(testUsers.owner);

      // Create another pending document
      await createTestDocument({
        projectId: project.id,
        uploadedById: ownerUser.id,
        name: 'another-doc.pdf',
        processingStatus: 'PENDING',
      });

      const res = await request(app)
        .post(`/api/v1/projects/${project.id}/processing/process-all`)
        .set('Authorization', 'Bearer mock-token');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Processing started for all pending documents');
    });
  });
});
