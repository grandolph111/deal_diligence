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

describe('Folders Module', () => {
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

  describe('GET /api/v1/projects/:id/folders', () => {
    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser(testUsers.owner);
      const project = await createTestProject(user.id);
      clearMockUser();

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/folders`)
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return folder tree for project owner', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const rootFolder = await createTestFolder(project.id, { name: 'Root Folder' });
      await createTestFolder(project.id, {
        name: 'Child Folder',
        parentId: rootFolder.id,
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/folders`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('Root Folder');
      expect(response.body[0].children).toHaveLength(1);
      expect(response.body[0].children[0].name).toBe('Child Folder');
    });

    it('should return flat list when format=flat', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const rootFolder = await createTestFolder(project.id, { name: 'Root Folder' });
      await createTestFolder(project.id, {
        name: 'Child Folder',
        parentId: rootFolder.id,
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/folders?format=flat`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(2);
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
        .get(`/api/v1/projects/${project.id}/folders`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });

    it('should allow member with VDR permission', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessVDR: true,
      });

      await createTestFolder(project.id, { name: 'Test Folder' });

      setMockUser(testUsers.member);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/folders`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(1);
    });
  });

  describe('GET /api/v1/projects/:id/folders/:folderId', () => {
    it('should return folder details with children', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const parentFolder = await createTestFolder(project.id, { name: 'Parent' });
      await createTestFolder(project.id, {
        name: 'Child 1',
        parentId: parentFolder.id,
      });
      await createTestFolder(project.id, {
        name: 'Child 2',
        parentId: parentFolder.id,
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/folders/${parentFolder.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body.name).toBe('Parent');
      expect(response.body.children).toHaveLength(2);
    });

    it('should return 404 for non-existent folder', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .get(`/api/v1/projects/${project.id}/folders/non-existent-id`)
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });
  });

  describe('GET /api/v1/projects/:id/folders/:folderId/path', () => {
    it('should return folder path (breadcrumb)', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const root = await createTestFolder(project.id, { name: 'Root' });
      const middle = await createTestFolder(project.id, {
        name: 'Middle',
        parentId: root.id,
      });
      const leaf = await createTestFolder(project.id, {
        name: 'Leaf',
        parentId: middle.id,
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .get(`/api/v1/projects/${project.id}/folders/${leaf.id}/path`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveLength(3);
      expect(response.body[0].name).toBe('Root');
      expect(response.body[1].name).toBe('Middle');
      expect(response.body[2].name).toBe('Leaf');
    });
  });

  describe('POST /api/v1/projects/:id/folders', () => {
    it('should create a root folder', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/folders`)
        .set('Authorization', 'Bearer test-token')
        .send({
          name: 'New Folder',
          categoryType: 'financial',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe('New Folder');
      expect(response.body.categoryType).toBe('financial');
      expect(response.body.parentId).toBeNull();
    });

    it('should create a child folder', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const parentFolder = await createTestFolder(project.id, { name: 'Parent' });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/folders`)
        .set('Authorization', 'Bearer test-token')
        .send({
          name: 'Child Folder',
          parentId: parentFolder.id,
        })
        .expect(201);

      expect(response.body.parentId).toBe(parentFolder.id);
    });

    it('should return 409 for duplicate folder name at same level', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      await createTestFolder(project.id, { name: 'Existing Folder' });

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/folders`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Existing Folder' })
        .expect(409);
    });

    it('should allow same folder name at different levels', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const parentFolder = await createTestFolder(project.id, { name: 'Shared Name' });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/folders`)
        .set('Authorization', 'Bearer test-token')
        .send({
          name: 'Shared Name',
          parentId: parentFolder.id,
        })
        .expect(201);

      expect(response.body.name).toBe('Shared Name');
    });

    it('should return 403 for MEMBER', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessVDR: true,
      });

      setMockUser(testUsers.member);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/folders`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Member Folder' })
        .expect(403);
    });

    it('should allow ADMIN to create folders', async () => {
      const owner = await createTestUser(testUsers.owner);
      const admin = await createTestUser(testUsers.admin);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, admin.id, ProjectRole.ADMIN);

      setMockUser(testUsers.admin);

      const response = await createTestApp()
        .post(`/api/v1/projects/${project.id}/folders`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Admin Folder' })
        .expect(201);

      expect(response.body.name).toBe('Admin Folder');
    });

    it('should fail with missing name', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/folders`)
        .set('Authorization', 'Bearer test-token')
        .send({ categoryType: 'financial' })
        .expect(400);
    });

    it('should return 404 for non-existent parent', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/folders`)
        .set('Authorization', 'Bearer test-token')
        .send({
          name: 'Orphan Folder',
          parentId: '00000000-0000-0000-0000-000000000000',
        })
        .expect(404);
    });
  });

  describe('PATCH /api/v1/projects/:id/folders/:folderId', () => {
    it('should rename folder', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const folder = await createTestFolder(project.id, { name: 'Original Name' });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}/folders/${folder.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Updated Name' })
        .expect(200);

      expect(response.body.name).toBe('Updated Name');
    });

    it('should update isViewOnly', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const folder = await createTestFolder(project.id, { name: 'Folder', isViewOnly: false });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}/folders/${folder.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ isViewOnly: true })
        .expect(200);

      expect(response.body.isViewOnly).toBe(true);
    });

    it('should return 409 for duplicate name at same level', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      await createTestFolder(project.id, { name: 'Existing' });
      const folder = await createTestFolder(project.id, { name: 'To Rename' });

      setMockUser(testUsers.owner);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}/folders/${folder.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Existing' })
        .expect(409);
    });

    it('should return 400 when no fields provided', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const folder = await createTestFolder(project.id, { name: 'Folder' });

      setMockUser(testUsers.owner);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}/folders/${folder.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({})
        .expect(400);
    });
  });

  describe('PATCH /api/v1/projects/:id/folders/:folderId/move', () => {
    it('should move folder to new parent', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const parent1 = await createTestFolder(project.id, { name: 'Parent 1' });
      const parent2 = await createTestFolder(project.id, { name: 'Parent 2' });
      const child = await createTestFolder(project.id, {
        name: 'Child',
        parentId: parent1.id,
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}/folders/${child.id}/move`)
        .set('Authorization', 'Bearer test-token')
        .send({ parentId: parent2.id })
        .expect(200);

      expect(response.body.parentId).toBe(parent2.id);
    });

    it('should move folder to root', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const parent = await createTestFolder(project.id, { name: 'Parent' });
      const child = await createTestFolder(project.id, {
        name: 'Child',
        parentId: parent.id,
      });

      setMockUser(testUsers.owner);

      const response = await createTestApp()
        .patch(`/api/v1/projects/${project.id}/folders/${child.id}/move`)
        .set('Authorization', 'Bearer test-token')
        .send({ parentId: null })
        .expect(200);

      expect(response.body.parentId).toBeNull();
    });

    it('should return 400 when moving folder into itself', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const folder = await createTestFolder(project.id, { name: 'Folder' });

      setMockUser(testUsers.owner);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}/folders/${folder.id}/move`)
        .set('Authorization', 'Bearer test-token')
        .send({ parentId: folder.id })
        .expect(400);
    });

    it('should return 400 when moving folder into its descendant', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const parent = await createTestFolder(project.id, { name: 'Parent' });
      const child = await createTestFolder(project.id, {
        name: 'Child',
        parentId: parent.id,
      });

      setMockUser(testUsers.owner);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}/folders/${parent.id}/move`)
        .set('Authorization', 'Bearer test-token')
        .send({ parentId: child.id })
        .expect(400);
    });

    it('should return 409 for name conflict at destination', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const parent = await createTestFolder(project.id, { name: 'Parent' });
      await createTestFolder(project.id, {
        name: 'Duplicate',
        parentId: parent.id,
      });
      const toMove = await createTestFolder(project.id, { name: 'Duplicate' });

      setMockUser(testUsers.owner);

      await createTestApp()
        .patch(`/api/v1/projects/${project.id}/folders/${toMove.id}/move`)
        .set('Authorization', 'Bearer test-token')
        .send({ parentId: parent.id })
        .expect(409);
    });
  });

  describe('DELETE /api/v1/projects/:id/folders/:folderId', () => {
    it('should delete empty folder', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const folder = await createTestFolder(project.id, { name: 'Empty Folder' });

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/folders/${folder.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(204);

      // Verify folder is deleted
      const deletedFolder = await testPrisma.folder.findUnique({
        where: { id: folder.id },
      });
      expect(deletedFolder).toBeNull();
    });

    it('should return 400 when folder has children', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const parent = await createTestFolder(project.id, { name: 'Parent' });
      await createTestFolder(project.id, {
        name: 'Child',
        parentId: parent.id,
      });

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/folders/${parent.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });

    it('should return 400 when folder has documents', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      const folder = await createTestFolder(project.id, { name: 'With Docs' });

      // Create a document in the folder
      await testPrisma.document.create({
        data: {
          projectId: project.id,
          folderId: folder.id,
          name: 'test.pdf',
          s3Key: 'test-key',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          uploadedById: owner.id,
        },
      });

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/folders/${folder.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(400);
    });

    it('should return 403 for MEMBER', async () => {
      const owner = await createTestUser(testUsers.owner);
      const member = await createTestUser(testUsers.member);
      const project = await createTestProject(owner.id);
      await addProjectMember(project.id, member.id, ProjectRole.MEMBER, {
        canAccessVDR: true,
      });

      const folder = await createTestFolder(project.id, { name: 'Folder' });

      setMockUser(testUsers.member);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/folders/${folder.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });

    it('should return 404 for non-existent folder', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project = await createTestProject(owner.id);

      setMockUser(testUsers.owner);

      await createTestApp()
        .delete(`/api/v1/projects/${project.id}/folders/non-existent-id`)
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });
  });

  describe('IDOR Protection', () => {
    it('should not access folder from another project', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project1 = await createTestProject(owner.id);
      const project2 = await createTestProject(owner.id, { name: 'Project 2' });

      const folder = await createTestFolder(project1.id, { name: 'Project 1 Folder' });

      setMockUser(testUsers.owner);

      // Try to access folder from project1 using project2's URL
      await createTestApp()
        .get(`/api/v1/projects/${project2.id}/folders/${folder.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(404);
    });

    it('should not update folder from another project', async () => {
      const owner = await createTestUser(testUsers.owner);
      const project1 = await createTestProject(owner.id);
      const project2 = await createTestProject(owner.id, { name: 'Project 2' });

      const folder = await createTestFolder(project1.id, { name: 'Project 1 Folder' });

      setMockUser(testUsers.owner);

      await createTestApp()
        .patch(`/api/v1/projects/${project2.id}/folders/${folder.id}`)
        .set('Authorization', 'Bearer test-token')
        .send({ name: 'Hacked' })
        .expect(404);
    });
  });
});
