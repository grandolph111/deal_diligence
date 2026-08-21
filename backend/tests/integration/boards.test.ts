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
  testPrisma,
} from '../utils';

const IP = '04-intellectual-property';
const TAX = '11-tax';

/**
 * Boards are per-specialist: one SME owns a board, and its scope is that
 * member's workstream grants rather than a separate per-board selection.
 */
describe('Kanban boards — SME scoping', () => {
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

  /** Owner + two members holding the SAME grant, so "same scope" is tested too. */
  const setup = async () => {
    const owner = await createTestUser(testUsers.owner);
    const smeA = await createTestUser(testUsers.member);
    const smeB = await createTestUser(testUsers.viewer);
    const project = await createTestProject(owner.id);
    await addProjectMember(project.id, smeA.id, ProjectRole.MEMBER, {
      canAccessKanban: true,
      restrictedWorkstreams: [IP],
    });
    await addProjectMember(project.id, smeB.id, ProjectRole.MEMBER, {
      canAccessKanban: true,
      restrictedWorkstreams: [IP],
    });
    return { owner, smeA, smeB, project };
  };

  const createBoard = async (
    projectId: string,
    body: Record<string, unknown>,
    expectStatus = 201
  ) =>
    createTestApp()
      .post(`/api/v1/projects/${projectId}/boards`)
      .set('Authorization', 'Bearer test-token')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send(body)
      .expect(expectStatus);

  describe('creation', () => {
    it('derives the board scope from the SME grants', async () => {
      const { smeA, project } = await setup();
      setMockUser(testUsers.owner);

      const res = await createBoard(project.id, {
        name: 'IP Diligence',
        smeUserId: smeA.id,
      });

      expect(res.body.sme.id).toBe(smeA.id);
      expect(res.body.workstreams).toHaveLength(1);
      expect(res.body.workstreams[0].id).toBe(IP);
    });

    it('rejects an SME who holds no workstreams', async () => {
      const { project } = await setup();
      const outsider = await createTestUser(testUsers.admin);
      await addProjectMember(project.id, outsider.id, ProjectRole.MEMBER, {
        canAccessKanban: true,
      });
      setMockUser(testUsers.owner);

      const res = await createBoard(
        project.id,
        { name: 'Empty', smeUserId: outsider.id },
        400
      );
      expect(res.body.error?.message ?? res.body.message).toMatch(/no workstreams/i);
    });

    it('rejects a board with no SME at all', async () => {
      const { project } = await setup();
      setMockUser(testUsers.owner);
      await createBoard(project.id, { name: 'Nobody' }, 400);
    });

    it('pins a board created by a non-admin to that member', async () => {
      const { smeA, smeB, project } = await setup();
      setMockUser(testUsers.member); // smeA

      // smeA tries to create a board for smeB — the API ignores it and
      // assigns the board to smeA, so this cannot be used to widen access.
      const res = await createBoard(project.id, {
        name: 'My IP work',
        smeUserId: smeB.id,
      });

      expect(res.body.sme.id).toBe(smeA.id);
    });
  });

  describe('visibility', () => {
    it('shows an SME only their own board, not a peer with identical grants', async () => {
      const { smeA, smeB, project } = await setup();
      setMockUser(testUsers.owner);
      const boardA = await createBoard(project.id, {
        name: 'IP — A',
        smeUserId: smeA.id,
      });
      await createBoard(project.id, { name: 'IP — B', smeUserId: smeB.id });

      setMockUser(testUsers.member); // smeA
      const res = await createTestApp()
        .get(`/api/v1/projects/${project.id}/boards`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(res.body.boards).toHaveLength(1);
      expect(res.body.boards[0].id).toBe(boardA.body.id);
    });

    it('shows an admin every board regardless of SME', async () => {
      const { smeA, smeB, project } = await setup();
      setMockUser(testUsers.owner);
      await createBoard(project.id, { name: 'IP — A', smeUserId: smeA.id });
      await createBoard(project.id, { name: 'IP — B', smeUserId: smeB.id });

      const res = await createTestApp()
        .get(`/api/v1/projects/${project.id}/boards`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(res.body.boards).toHaveLength(2);
    });

    it("403s when an SME opens a peer's board directly by id", async () => {
      const { smeB, project } = await setup();
      setMockUser(testUsers.owner);
      const boardB = await createBoard(project.id, {
        name: 'IP — B',
        smeUserId: smeB.id,
      });

      setMockUser(testUsers.member); // smeA
      await createTestApp()
        .get(`/api/v1/projects/${project.id}/boards/${boardB.body.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });

    it("403s when an SME lists tasks on a peer's board by id", async () => {
      const { smeB, project } = await setup();
      setMockUser(testUsers.owner);
      const boardB = await createBoard(project.id, {
        name: 'IP — B',
        smeUserId: smeB.id,
      });

      setMockUser(testUsers.member); // smeA
      await createTestApp()
        .get(`/api/v1/projects/${project.id}/tasks/board?boardId=${boardB.body.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(403);
    });
  });

  describe('derivation', () => {
    it('re-scopes the board when the SME grants change', async () => {
      const { smeA, project } = await setup();
      setMockUser(testUsers.owner);
      const board = await createBoard(project.id, {
        name: 'IP Diligence',
        smeUserId: smeA.id,
      });

      // Admin → Team: grant Tax as well. Nothing touches the board.
      await testPrisma.projectMember.update({
        where: { projectId_userId: { projectId: project.id, userId: smeA.id } },
        data: { permissions: { canAccessKanban: true, restrictedWorkstreams: [IP, TAX] } },
      });

      const res = await createTestApp()
        .get(`/api/v1/projects/${project.id}/boards/${board.body.id}`)
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(res.body.workstreams.map((w: { id: string }) => w.id).sort()).toEqual(
        [IP, TAX].sort()
      );
    });
  });

  describe('task assignment', () => {
    it("rejects assigning a task to someone who cannot open the board", async () => {
      const { smeA, smeB, project } = await setup();
      setMockUser(testUsers.owner);
      const board = await createBoard(project.id, {
        name: 'IP — A',
        smeUserId: smeA.id,
      });

      const res = await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', 'Bearer test-token')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          title: 'Patent coverage',
          boardId: board.body.id,
          assigneeIds: [smeB.id],
        })
        .expect(400);

      expect(res.body.error?.message ?? res.body.message).toMatch(/assign/i);
    });

    it('allows assigning the board SME', async () => {
      const { smeA, project } = await setup();
      setMockUser(testUsers.owner);
      const board = await createBoard(project.id, {
        name: 'IP — A',
        smeUserId: smeA.id,
      });

      await createTestApp()
        .post(`/api/v1/projects/${project.id}/tasks`)
        .set('Authorization', 'Bearer test-token')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send({
          title: 'Patent coverage',
          boardId: board.body.id,
          assigneeIds: [smeA.id],
        })
        .expect(201);
    });
  });
});
