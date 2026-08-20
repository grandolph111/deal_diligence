/**
 * Kanban board service. Boards are project-scoped and carved out by checklist
 * workstream — this is how an admin hands a specialist their slice of the deal
 * ("IP Diligence" → 04-intellectual-property).
 *
 * A member sees a board only if ALL of the board's workstreams are in their
 * allowed set (intersection rule). Members with full-deal access, and boards
 * with no scope rows at all (the auto-generated "All Documents" board), are
 * unrestricted.
 *
 * Folder scoping is retained but dormant — see KanbanBoardFolder.
 */

import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { computeScopeKey, SCOPE_FULL } from '../utils/scope-key';
import { documentsService } from '../modules/documents/documents.service';
import { WORKSTREAMS } from '../integrations/library/checklist';
import type { ProjectMember } from '@prisma/client';

const DEFAULT_BOARD_NAME = 'All Documents';

export interface CreateBoardInput {
  name: string;
  description?: string | null;
  /** Checklist workstream slugs. At least one scope (this or folderIds) required. */
  workstreamIds?: string[];
  /** @deprecated dormant — folder scoping is retired from the UI. */
  folderIds?: string[];
}

export interface UpdateBoardInput {
  name?: string;
  description?: string | null;
  workstreamIds?: string[];
  /** @deprecated dormant. */
  folderIds?: string[];
}

const VALID_WORKSTREAM_IDS = new Set(WORKSTREAMS.map((w) => w.id));

/** Reject unknown slugs early — the checklist is static config, so there is no FK to catch typos. */
const assertValidWorkstreams = (ids: string[]): string[] => {
  const unique = [...new Set(ids)];
  const unknown = unique.filter((id) => !VALID_WORKSTREAM_IDS.has(id));
  if (unknown.length > 0) {
    throw ApiError.badRequest(`Unknown workstream(s): ${unknown.join(', ')}`);
  }
  return unique;
};

const resolveAccessibleFolderIds = async (
  projectId: string,
  member: ProjectMember
): Promise<string[] | null> => {
  // null = full access (OWNER/ADMIN or no folder restriction)
  if (computeScopeKey(member) === SCOPE_FULL) return null;
  const perms = (member.permissions ?? {}) as Record<string, unknown>;
  const restricted = (perms.restrictedFolders as string[] | undefined) ?? [];
  if (restricted.length === 0) return null;
  return documentsService.getAccessibleFolderIds(projectId, restricted);
};

/** null = full access (OWNER/ADMIN, or a member holding no workstream restriction). */
const resolveAccessibleWorkstreamIds = (member: ProjectMember): string[] | null => {
  if (computeScopeKey(member) === SCOPE_FULL) return null;
  const perms = (member.permissions ?? {}) as Record<string, unknown>;
  const restricted = (perms.restrictedWorkstreams as string[] | undefined) ?? [];
  if (restricted.length === 0) return null;
  return restricted;
};

/**
 * Board is visible to a member if every scope on the board is in the member's
 * allowed set (intersection rule). null accessible set = full access; an
 * unscoped board covers the whole project and is visible to anyone who can
 * reach the project at all.
 */
const boardVisibleTo = (
  boardScopeIds: string[],
  accessibleIds: string[] | null
): boolean => {
  if (accessibleIds == null) return true;
  return boardScopeIds.every((id) => accessibleIds.includes(id));
};

/** Hydrate a stored slug into the {id,title} shape the UI renders. */
const describeWorkstream = (workstreamId: string): { id: string; title: string } => ({
  id: workstreamId,
  title: WORKSTREAMS.find((w) => w.id === workstreamId)?.title ?? workstreamId,
});

export const boardsService = {
  /**
   * Ensure every project has an "All Documents" default board and every task
   * has a boardId. Idempotent — safe to call on every server boot.
   */
  async ensureDefaultBoardsForAllProjects(): Promise<{ created: number; linked: number }> {
    let created = 0;
    let linked = 0;

    const projectsWithoutDefault = await prisma.project.findMany({
      where: {
        boards: { none: { isDefault: true } },
      },
      select: { id: true, name: true },
    });

    for (const project of projectsWithoutDefault) {
      const creator = await prisma.projectMember.findFirst({
        where: { projectId: project.id, role: 'OWNER' },
        select: { userId: true },
      });
      if (!creator) continue; // can't create board without an owner

      const board = await prisma.kanbanBoard.create({
        data: {
          projectId: project.id,
          name: DEFAULT_BOARD_NAME,
          description:
            'Auto-generated board covering every document in this deal.',
          isDefault: true,
          createdById: creator.userId,
        },
      });
      created += 1;

      const update = await prisma.task.updateMany({
        where: { projectId: project.id, boardId: null },
        data: { boardId: board.id },
      });
      linked += update.count;
    }

    // Any orphan tasks across projects (shouldn't happen now, but safe)
    const orphans = await prisma.task.findMany({
      where: { boardId: null },
      select: { id: true, projectId: true },
    });
    for (const task of orphans) {
      const defaultBoard = await prisma.kanbanBoard.findFirst({
        where: { projectId: task.projectId, isDefault: true },
      });
      if (!defaultBoard) continue;
      await prisma.task.update({
        where: { id: task.id },
        data: { boardId: defaultBoard.id },
      });
      linked += 1;
    }

    return { created, linked };
  },

  /**
   * Ensure a default board exists for a single project. Called when a new
   * project is created, or lazily when the boards index is first visited.
   */
  async ensureDefaultBoardForProject(
    projectId: string,
    creatorUserId: string
  ): Promise<string> {
    const existing = await prisma.kanbanBoard.findFirst({
      where: { projectId, isDefault: true },
    });
    if (existing) return existing.id;

    const board = await prisma.kanbanBoard.create({
      data: {
        projectId,
        name: DEFAULT_BOARD_NAME,
        description: 'Auto-generated board covering every document in this deal.',
        isDefault: true,
        createdById: creatorUserId,
      },
    });
    await prisma.task.updateMany({
      where: { projectId, boardId: null },
      data: { boardId: board.id },
    });
    return board.id;
  },

  async listForMember(projectId: string, member: ProjectMember) {
    const [accessibleFolders, accessibleWorkstreams] = [
      await resolveAccessibleFolderIds(projectId, member),
      resolveAccessibleWorkstreamIds(member),
    ];
    const boards = await prisma.kanbanBoard.findMany({
      where: { projectId },
      include: {
        folders: {
          include: { folder: { select: { id: true, name: true } } },
        },
        workstreams: { select: { workstreamId: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    return boards
      .map((b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        isDefault: b.isDefault,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        folders: b.folders.map((bf) => bf.folder),
        workstreams: b.workstreams.map((bw) => describeWorkstream(bw.workstreamId)),
        taskCount: b._count.tasks,
      }))
      .filter(
        (b) =>
          boardVisibleTo(
            b.folders.map((f) => f.id),
            accessibleFolders
          ) &&
          boardVisibleTo(
            b.workstreams.map((w) => w.id),
            accessibleWorkstreams
          )
      );
  },

  async getForMember(boardId: string, projectId: string, member: ProjectMember) {
    const board = await prisma.kanbanBoard.findFirst({
      where: { id: boardId, projectId },
      include: {
        folders: {
          include: {
            folder: { select: { id: true, name: true, parentId: true } },
          },
        },
        workstreams: { select: { workstreamId: true } },
      },
    });
    if (!board) throw ApiError.notFound('Board not found');

    const accessibleFolders = await resolveAccessibleFolderIds(projectId, member);
    if (!boardVisibleTo(board.folders.map((bf) => bf.folderId), accessibleFolders)) {
      throw ApiError.forbidden('Board covers folders outside your access scope');
    }
    const accessibleWorkstreams = resolveAccessibleWorkstreamIds(member);
    if (
      !boardVisibleTo(board.workstreams.map((bw) => bw.workstreamId), accessibleWorkstreams)
    ) {
      throw ApiError.forbidden('Board covers workstreams outside your access scope');
    }

    return {
      id: board.id,
      name: board.name,
      description: board.description,
      isDefault: board.isDefault,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
      folders: board.folders.map((bf) => bf.folder),
      workstreams: board.workstreams.map((bw) => describeWorkstream(bw.workstreamId)),
    };
  },

  async create(
    projectId: string,
    creatorUserId: string,
    data: CreateBoardInput
  ) {
    const name = data.name.trim();
    if (!name) throw ApiError.badRequest('Board name is required');

    const folderIds = data.folderIds ?? [];
    const workstreamIds = data.workstreamIds?.length
      ? assertValidWorkstreams(data.workstreamIds)
      : [];

    if (folderIds.length === 0 && workstreamIds.length === 0) {
      throw ApiError.badRequest('Select at least one workstream for this board');
    }

    // Verify every folderId belongs to the project (workstreams are static
    // config, already validated above).
    if (folderIds.length > 0) {
      const folders = await prisma.folder.findMany({
        where: { id: { in: folderIds }, projectId },
        select: { id: true },
      });
      if (folders.length !== folderIds.length) {
        throw ApiError.badRequest('One or more folders are not in this project');
      }
    }

    const existing = await prisma.kanbanBoard.findFirst({
      where: { projectId, name },
    });
    if (existing)
      throw ApiError.conflict('A board with this name already exists');

    return prisma.kanbanBoard.create({
      data: {
        projectId,
        name,
        description: data.description ?? null,
        createdById: creatorUserId,
        folders: { create: folderIds.map((folderId) => ({ folderId })) },
        workstreams: { create: workstreamIds.map((workstreamId) => ({ workstreamId })) },
      },
      include: {
        folders: { include: { folder: { select: { id: true, name: true } } } },
        workstreams: { select: { workstreamId: true } },
      },
    });
  },

  async update(
    boardId: string,
    projectId: string,
    data: UpdateBoardInput
  ) {
    const board = await prisma.kanbanBoard.findFirst({
      where: { id: boardId, projectId },
    });
    if (!board) throw ApiError.notFound('Board not found');

    const patch: {
      name?: string;
      description?: string | null;
    } = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.description !== undefined) patch.description = data.description;

    // A board must keep at least one scope across both axes — check the
    // post-update state, so clearing folders while setting workstreams is fine.
    if (data.folderIds !== undefined || data.workstreamIds !== undefined) {
      const [currentFolders, currentWorkstreams] = await Promise.all([
        prisma.kanbanBoardFolder.count({ where: { boardId } }),
        prisma.kanbanBoardWorkstream.count({ where: { boardId } }),
      ]);
      const nextFolders = data.folderIds?.length ?? currentFolders;
      const nextWorkstreams = data.workstreamIds?.length ?? currentWorkstreams;
      if (nextFolders === 0 && nextWorkstreams === 0) {
        throw ApiError.badRequest('A board must cover at least one workstream');
      }
    }

    if (data.folderIds !== undefined) {
      if (data.folderIds.length > 0) {
        const folders = await prisma.folder.findMany({
          where: { id: { in: data.folderIds }, projectId },
          select: { id: true },
        });
        if (folders.length !== data.folderIds.length) {
          throw ApiError.badRequest(
            'One or more folders are not in this project'
          );
        }
      }
      await prisma.kanbanBoardFolder.deleteMany({ where: { boardId } });
      await prisma.kanbanBoardFolder.createMany({
        data: data.folderIds.map((folderId) => ({ boardId, folderId })),
      });
    }

    if (data.workstreamIds !== undefined) {
      const workstreamIds = assertValidWorkstreams(data.workstreamIds);
      await prisma.kanbanBoardWorkstream.deleteMany({ where: { boardId } });
      await prisma.kanbanBoardWorkstream.createMany({
        data: workstreamIds.map((workstreamId) => ({ boardId, workstreamId })),
      });
    }

    return prisma.kanbanBoard.update({
      where: { id: boardId },
      data: patch,
      include: {
        folders: { include: { folder: { select: { id: true, name: true } } } },
        workstreams: { select: { workstreamId: true } },
      },
    });
  },

  async delete(boardId: string, projectId: string): Promise<void> {
    const board = await prisma.kanbanBoard.findFirst({
      where: { id: boardId, projectId },
    });
    if (!board) throw ApiError.notFound('Board not found');
    if (board.isDefault) {
      throw ApiError.badRequest(
        'The default board cannot be deleted. Move its tasks first.'
      );
    }

    // Move any tasks on this board to the default board.
    const defaultBoard = await prisma.kanbanBoard.findFirst({
      where: { projectId, isDefault: true },
    });
    if (defaultBoard) {
      await prisma.task.updateMany({
        where: { boardId },
        data: { boardId: defaultBoard.id },
      });
    }

    await prisma.kanbanBoard.delete({ where: { id: boardId } });
  },

  /**
   * Does this user have access to the given board? Used by task routes
   * before letting users list/create tasks on a board.
   */
  async canAccess(
    boardId: string,
    projectId: string,
    member: ProjectMember
  ): Promise<boolean> {
    const board = await prisma.kanbanBoard.findFirst({
      where: { id: boardId, projectId },
      include: {
        folders: { select: { folderId: true } },
        workstreams: { select: { workstreamId: true } },
      },
    });
    if (!board) return false;
    const accessibleFolders = await resolveAccessibleFolderIds(projectId, member);
    const accessibleWorkstreams = resolveAccessibleWorkstreamIds(member);
    return (
      boardVisibleTo(board.folders.map((f) => f.folderId), accessibleFolders) &&
      boardVisibleTo(board.workstreams.map((w) => w.workstreamId), accessibleWorkstreams)
    );
  },

  async boardFolderIds(boardId: string): Promise<string[]> {
    const rows = await prisma.kanbanBoardFolder.findMany({
      where: { boardId },
      select: { folderId: true },
    });
    return rows.map((r) => r.folderId);
  },

  async boardWorkstreamIds(boardId: string): Promise<string[]> {
    const rows = await prisma.kanbanBoardWorkstream.findMany({
      where: { boardId },
      select: { workstreamId: true },
    });
    return rows.map((r) => r.workstreamId);
  },

  /**
   * Documents a board covers — those supplying evidence to any of its
   * workstreams. `null` means unscoped (whole project), matching the
   * "All Documents" default board.
   */
  async boardDocumentIds(boardId: string, projectId: string): Promise<string[] | null> {
    const workstreamIds = await this.boardWorkstreamIds(boardId);
    if (workstreamIds.length === 0) return null;
    return documentsService.documentIdsWithEvidence(projectId, { workstreamIds });
  },

  /**
   * Expanded folder scope: raw selected folders + every descendant folder.
   * Used for task-attachment verification so that selecting a parent folder
   * admits documents stored in any of its subfolders.
   */
  async expandedBoardFolderIds(
    boardId: string,
    projectId: string
  ): Promise<string[]> {
    const selected = await this.boardFolderIds(boardId);
    if (selected.length === 0) return [];
    const all = await prisma.folder.findMany({
      where: { projectId },
      select: { id: true, parentId: true },
    });
    const childrenByParent = new Map<string | null, string[]>();
    for (const f of all) {
      const arr = childrenByParent.get(f.parentId) ?? [];
      arr.push(f.id);
      childrenByParent.set(f.parentId, arr);
    }
    const out = new Set<string>();
    const stack = [...selected];
    while (stack.length) {
      const id = stack.pop()!;
      if (out.has(id)) continue;
      out.add(id);
      const kids = childrenByParent.get(id) ?? [];
      stack.push(...kids);
    }
    return Array.from(out);
  },
};
