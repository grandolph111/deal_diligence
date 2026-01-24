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
  testPrisma,
} from '../utils';
import { auditService } from '../../src/modules/audit/audit.service';
import { AuditAction, AuditResourceType } from '../../src/modules/audit/audit.validators';

describe('Audit Module', () => {
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

  describe('Audit Service', () => {
    describe('createLog', () => {
      it('should create an audit log entry', async () => {
        const owner = await createTestUser(testUsers.owner);
        const project = await createTestProject(owner.id);

        const log = await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.FOLDER_CREATE,
          resourceType: AuditResourceType.FOLDER,
          resourceId: '00000000-0000-0000-0000-000000000001',
          metadata: { name: 'Test Folder' },
          ipAddress: '127.0.0.1',
          userAgent: 'test-agent',
        });

        expect(log).toBeDefined();
        expect(log.projectId).toBe(project.id);
        expect(log.userId).toBe(owner.id);
        expect(log.action).toBe('folder.create');
        expect(log.resourceType).toBe('folder');
        expect(log.ipAddress).toBe('127.0.0.1');
        expect(log.userAgent).toBe('test-agent');
      });
    });

    describe('queryLogs', () => {
      it('should query logs with filters', async () => {
        const owner = await createTestUser(testUsers.owner);
        const project = await createTestProject(owner.id);

        // Create multiple logs
        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.FOLDER_CREATE,
          resourceType: AuditResourceType.FOLDER,
        });

        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.DOCUMENT_UPLOAD,
          resourceType: AuditResourceType.DOCUMENT,
        });

        // Query all
        const { logs: allLogs, total } = await auditService.queryLogs(project.id, {
          limit: 50,
          offset: 0,
        });

        expect(allLogs).toHaveLength(2);
        expect(total).toBe(2);

        // Query with action filter
        const { logs: folderLogs } = await auditService.queryLogs(project.id, {
          action: AuditAction.FOLDER_CREATE,
          limit: 50,
          offset: 0,
        });

        expect(folderLogs).toHaveLength(1);
        expect(folderLogs[0].action).toBe('folder.create');
      });

      it('should filter by date range', async () => {
        const owner = await createTestUser(testUsers.owner);
        const project = await createTestProject(owner.id);

        // Create a log
        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.FOLDER_CREATE,
          resourceType: AuditResourceType.FOLDER,
        });

        // Query with future date range (should return nothing)
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + 1);

        const { logs } = await auditService.queryLogs(project.id, {
          startDate: futureDate,
          limit: 50,
          offset: 0,
        });

        expect(logs).toHaveLength(0);
      });

      it('should include user information', async () => {
        const owner = await createTestUser(testUsers.owner);
        const project = await createTestProject(owner.id);

        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.FOLDER_CREATE,
          resourceType: AuditResourceType.FOLDER,
        });

        const { logs } = await auditService.queryLogs(project.id, {
          limit: 50,
          offset: 0,
        });

        expect(logs[0]).toHaveProperty('user');
        expect(logs[0].user).toHaveProperty('id', owner.id);
        expect(logs[0].user).toHaveProperty('email');
      });
    });

    describe('getResourceLogs', () => {
      it('should get logs for a specific resource', async () => {
        const owner = await createTestUser(testUsers.owner);
        const project = await createTestProject(owner.id);
        const folder = await createTestFolder(project.id, { name: 'Test Folder' });

        // Create logs for different resources
        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.FOLDER_VIEW,
          resourceType: AuditResourceType.FOLDER,
          resourceId: folder.id,
        });

        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.FOLDER_RENAME,
          resourceType: AuditResourceType.FOLDER,
          resourceId: folder.id,
        });

        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.FOLDER_CREATE,
          resourceType: AuditResourceType.FOLDER,
          resourceId: '00000000-0000-0000-0000-000000000002', // Different folder
        });

        const logs = await auditService.getResourceLogs(
          project.id,
          AuditResourceType.FOLDER,
          folder.id
        );

        expect(logs).toHaveLength(2);
        logs.forEach((log) => {
          expect(log.resourceId).toBe(folder.id);
        });
      });
    });

    describe('getUserActivity', () => {
      it('should get activity for a specific user', async () => {
        const owner = await createTestUser(testUsers.owner);
        const admin = await createTestUser(testUsers.admin);
        const project = await createTestProject(owner.id);
        await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);

        // Create logs for different users
        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.FOLDER_CREATE,
          resourceType: AuditResourceType.FOLDER,
        });

        await auditService.createLog({
          projectId: project.id,
          userId: admin.id,
          action: AuditAction.FOLDER_VIEW,
          resourceType: AuditResourceType.FOLDER,
        });

        const ownerLogs = await auditService.getUserActivity(project.id, owner.id);
        const adminLogs = await auditService.getUserActivity(project.id, admin.id);

        expect(ownerLogs).toHaveLength(1);
        expect(ownerLogs[0].userId).toBe(owner.id);

        expect(adminLogs).toHaveLength(1);
        expect(adminLogs[0].userId).toBe(admin.id);
      });
    });
  });

  describe('Audit Routes', () => {
    describe('GET /api/v1/projects/:id/audit-logs', () => {
      it('should return 401 when not authenticated', async () => {
        const owner = await createTestUser(testUsers.owner);
        const project = await createTestProject(owner.id);
        clearMockUser();

        await createTestApp()
          .get(`/api/v1/projects/${project.id}/audit-logs`)
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);
      });

      it('should return 403 for MEMBER', async () => {
        const owner = await createTestUser(testUsers.owner);
        const member = await createTestUser(testUsers.member);
        const project = await createTestProject(owner.id);
        await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

        setMockUser(testUsers.member);

        await createTestApp()
          .get(`/api/v1/projects/${project.id}/audit-logs`)
          .set('Authorization', 'Bearer test-token')
          .expect(403);
      });

      it('should return 403 for VIEWER', async () => {
        const owner = await createTestUser(testUsers.owner);
        const viewer = await createTestUser(testUsers.viewer);
        const project = await createTestProject(owner.id);
        await addProjectMember(project.id, viewer.id, ProjectRole.VIEWER);

        setMockUser(testUsers.viewer);

        await createTestApp()
          .get(`/api/v1/projects/${project.id}/audit-logs`)
          .set('Authorization', 'Bearer test-token')
          .expect(403);
      });

      it('should allow ADMIN to access audit logs', async () => {
        const owner = await createTestUser(testUsers.owner);
        const admin = await createTestUser(testUsers.admin);
        const project = await createTestProject(owner.id);
        await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);

        // Create a log
        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.FOLDER_CREATE,
          resourceType: AuditResourceType.FOLDER,
        });

        setMockUser(testUsers.admin);

        const response = await createTestApp()
          .get(`/api/v1/projects/${project.id}/audit-logs`)
          .set('Authorization', 'Bearer test-token')
          .expect(200);

        expect(response.body).toHaveProperty('logs');
        expect(response.body).toHaveProperty('pagination');
        expect(response.body.logs).toHaveLength(1);
      });

      it('should allow OWNER to access audit logs', async () => {
        const owner = await createTestUser(testUsers.owner);
        const project = await createTestProject(owner.id);

        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.DOCUMENT_UPLOAD,
          resourceType: AuditResourceType.DOCUMENT,
        });

        setMockUser(testUsers.owner);

        const response = await createTestApp()
          .get(`/api/v1/projects/${project.id}/audit-logs`)
          .set('Authorization', 'Bearer test-token')
          .expect(200);

        expect(response.body.logs).toHaveLength(1);
        expect(response.body.pagination.total).toBe(1);
      });

      it('should filter by action', async () => {
        const owner = await createTestUser(testUsers.owner);
        const project = await createTestProject(owner.id);

        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.FOLDER_CREATE,
          resourceType: AuditResourceType.FOLDER,
        });

        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.DOCUMENT_UPLOAD,
          resourceType: AuditResourceType.DOCUMENT,
        });

        setMockUser(testUsers.owner);

        const response = await createTestApp()
          .get(`/api/v1/projects/${project.id}/audit-logs`)
          .query({ action: 'folder.create' })
          .set('Authorization', 'Bearer test-token')
          .expect(200);

        expect(response.body.logs).toHaveLength(1);
        expect(response.body.logs[0].action).toBe('folder.create');
      });

      it('should paginate results', async () => {
        const owner = await createTestUser(testUsers.owner);
        const project = await createTestProject(owner.id);

        // Create multiple logs
        for (let i = 0; i < 5; i++) {
          await auditService.createLog({
            projectId: project.id,
            userId: owner.id,
            action: AuditAction.FOLDER_VIEW,
            resourceType: AuditResourceType.FOLDER,
            metadata: { index: i },
          });
        }

        setMockUser(testUsers.owner);

        const response = await createTestApp()
          .get(`/api/v1/projects/${project.id}/audit-logs`)
          .query({ limit: 2, offset: 0 })
          .set('Authorization', 'Bearer test-token')
          .expect(200);

        expect(response.body.logs).toHaveLength(2);
        expect(response.body.pagination.total).toBe(5);
        expect(response.body.pagination.hasMore).toBe(true);
      });
    });

    describe('GET /api/v1/projects/:id/audit-logs/resource/:resourceType/:resourceId', () => {
      it('should get logs for a specific resource', async () => {
        const owner = await createTestUser(testUsers.owner);
        const project = await createTestProject(owner.id);
        const folder = await createTestFolder(project.id, { name: 'Test Folder' });

        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.FOLDER_VIEW,
          resourceType: AuditResourceType.FOLDER,
          resourceId: folder.id,
        });

        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.FOLDER_RENAME,
          resourceType: AuditResourceType.FOLDER,
          resourceId: folder.id,
        });

        setMockUser(testUsers.owner);

        const response = await createTestApp()
          .get(`/api/v1/projects/${project.id}/audit-logs/resource/folder/${folder.id}`)
          .set('Authorization', 'Bearer test-token')
          .expect(200);

        expect(response.body.logs).toHaveLength(2);
      });

      it('should return 403 for MEMBER', async () => {
        const owner = await createTestUser(testUsers.owner);
        const member = await createTestUser(testUsers.member);
        const project = await createTestProject(owner.id);
        await addProjectMember(project.id, member.id, ProjectRole.MEMBER);
        const folder = await createTestFolder(project.id, { name: 'Test' });

        setMockUser(testUsers.member);

        await createTestApp()
          .get(`/api/v1/projects/${project.id}/audit-logs/resource/folder/${folder.id}`)
          .set('Authorization', 'Bearer test-token')
          .expect(403);
      });
    });

    describe('GET /api/v1/projects/:id/audit-logs/user/:userId', () => {
      it('should get activity for a specific user', async () => {
        const owner = await createTestUser(testUsers.owner);
        const admin = await createTestUser(testUsers.admin);
        const project = await createTestProject(owner.id);
        await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);

        await auditService.createLog({
          projectId: project.id,
          userId: admin.id,
          action: AuditAction.FOLDER_CREATE,
          resourceType: AuditResourceType.FOLDER,
        });

        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.DOCUMENT_UPLOAD,
          resourceType: AuditResourceType.DOCUMENT,
        });

        setMockUser(testUsers.owner);

        const response = await createTestApp()
          .get(`/api/v1/projects/${project.id}/audit-logs/user/${admin.id}`)
          .set('Authorization', 'Bearer test-token')
          .expect(200);

        expect(response.body.logs).toHaveLength(1);
        expect(response.body.logs[0].userId).toBe(admin.id);
      });

      it('should return 403 for MEMBER', async () => {
        const owner = await createTestUser(testUsers.owner);
        const member = await createTestUser(testUsers.member);
        const project = await createTestProject(owner.id);
        await addProjectMember(project.id, member.id, ProjectRole.MEMBER);

        setMockUser(testUsers.member);

        await createTestApp()
          .get(`/api/v1/projects/${project.id}/audit-logs/user/${owner.id}`)
          .set('Authorization', 'Bearer test-token')
          .expect(403);
      });
    });
  });

  describe('Audit Logging Methods', () => {
    describe('Document audit methods', () => {
      it('should log document upload', async () => {
        const owner = await createTestUser(testUsers.owner);
        const project = await createTestProject(owner.id);
        const docId = '00000000-0000-0000-0000-000000000001';

        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.DOCUMENT_UPLOAD,
          resourceType: AuditResourceType.DOCUMENT,
          resourceId: docId,
          metadata: { fileName: 'test.pdf', sizeBytes: 1024 },
        });

        const logs = await auditService.getResourceLogs(
          project.id,
          AuditResourceType.DOCUMENT,
          docId
        );

        expect(logs).toHaveLength(1);
        expect(logs[0].action).toBe('document.upload');
        expect(logs[0].metadata).toEqual({ fileName: 'test.pdf', sizeBytes: 1024 });
      });

      it('should log document download', async () => {
        const owner = await createTestUser(testUsers.owner);
        const project = await createTestProject(owner.id);
        const docId = '00000000-0000-0000-0000-000000000001';

        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.DOCUMENT_DOWNLOAD,
          resourceType: AuditResourceType.DOCUMENT,
          resourceId: docId,
        });

        const logs = await auditService.getResourceLogs(
          project.id,
          AuditResourceType.DOCUMENT,
          docId
        );

        expect(logs).toHaveLength(1);
        expect(logs[0].action).toBe('document.download');
      });
    });

    describe('Folder audit methods', () => {
      it('should log folder operations', async () => {
        const owner = await createTestUser(testUsers.owner);
        const project = await createTestProject(owner.id);
        const folder = await createTestFolder(project.id, { name: 'Test' });

        // Log create
        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.FOLDER_CREATE,
          resourceType: AuditResourceType.FOLDER,
          resourceId: folder.id,
          metadata: { name: 'Test' },
        });

        // Log rename
        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.FOLDER_RENAME,
          resourceType: AuditResourceType.FOLDER,
          resourceId: folder.id,
          metadata: { oldName: 'Test', newName: 'Renamed' },
        });

        const logs = await auditService.getResourceLogs(
          project.id,
          AuditResourceType.FOLDER,
          folder.id
        );

        expect(logs).toHaveLength(2);
        const actions = logs.map((l) => l.action);
        expect(actions).toContain('folder.create');
        expect(actions).toContain('folder.rename');
      });
    });

    describe('Search audit methods', () => {
      it('should log search queries', async () => {
        const owner = await createTestUser(testUsers.owner);
        const project = await createTestProject(owner.id);

        await auditService.createLog({
          projectId: project.id,
          userId: owner.id,
          action: AuditAction.SEARCH_EXECUTE,
          resourceType: AuditResourceType.PROJECT,
          resourceId: project.id,
          metadata: {
            query: 'contract terms',
            resultCount: 5,
            searchType: 'keyword',
          },
        });

        const { logs } = await auditService.queryLogs(project.id, {
          action: AuditAction.SEARCH_EXECUTE,
          limit: 50,
          offset: 0,
        });

        expect(logs).toHaveLength(1);
        expect(logs[0].metadata).toEqual({
          query: 'contract terms',
          resultCount: 5,
          searchType: 'keyword',
        });
      });
    });
  });
});
