/**
 * Kanban board service. Boards are project-scoped, and each board is
 * attached to one or more data-room folders. A member sees a board only
 * if ALL of the board's folders are in their allowed-folder set
 * (intersection rule). Members with full-deal access (OWNER/ADMIN or
 * empty restrictedFolders) see every board.
 */

import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { computeScopeKey, SCOPE_FULL } from '../utils/scope-key';
import { documentsService } from '../modules/documents/documents.service';
import type { ProjectMember } from '@prisma/client';

const DEFAULT_BOARD_NAME = 'All Documents';

export interface CreateBoardInput {
  name: string;
  description?: string | null;
  folderIds: string[]; // must be non-empty
}

export interface UpdateBoardInput {
  name?: string;
  description?: string | null;
  folderIds?: string[];
}

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

/**
 * Board is visible to a member if every folder on the board is in the
 * member's allowed-folder set (intersection rule). null accessible set = full.
 */
const boardVisibleTo = (
  boardFolderIds: string[],
  accessibleFolderIds: string[] | null
): boolean => {
  if (accessibleFolderIds == null) return true;
  return boardFolderIds.every((f) => accessibleFolderIds.includes(f));
};

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
      const folders = await prisma.folder.findMany({
        where: { projectId: project.id },
        select: { id: true },
      });
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
            'Auto-generated board covering all folders in this project.',
          isDefault: true,
          createdById: creator.userId,
          folders: {
            create: folders.map((f) => ({ folderId: f.id })),
          },
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

    const folders = await prisma.folder.findMany({
      where: { projectId },
      select: { id: true },
    });
    const board = await prisma.kanbanBoard.create({
      data: {
        projectId,
        name: DEFAULT_BOARD_NAME,
        description: 'Auto-generated board covering all folders.',
        isDefault: true,
        createdById: creatorUserId,
        folders: { create: folders.map((f) => ({ folderId: f.id })) },
      },
    });
    await prisma.task.updateMany({
      where: { projectId, boardId: null },
      data: { boardId: board.id },
    });
    return board.id;
  },

  async listForMember(projectId: string, member: ProjectMember) {
    const accessible = await resolveAccessibleFolderIds(projectId, member);
    const boards = await prisma.kanbanBoard.findMany({
      where: { projectId },
      include: {
        folders: {
          include: { folder: { select: { id: true, name: true } } },
        },
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
        taskCount: b._count.tasks,
      }))
      .filter((b) =>
        boardVisibleTo(
          b.folders.map((f) => f.id),
          accessible
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
      },
    });
    if (!board) throw ApiError.notFound('Board not found');

    const accessible = await resolveAccessibleFolderIds(projectId, member);
    const folderIds = board.folders.map((bf) => bf.folderId);
    if (!boardVisibleTo(folderIds, accessible)) {
      throw ApiError.forbidden(
        'Board covers folders outside your access scope'
      );
    }

    return {
      id: board.id,
      name: board.name,
      description: board.description,
      isDefault: board.isDefault,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
      folders: board.folders.map((bf) => bf.folder),
    };
  },

  async create(
    projectId: string,
    creatorUserId: string,
    data: CreateBoardInput
  ) {
    const name = data.name.trim();
    if (!name) throw ApiError.badRequest('Board name is required');
    if (!data.folderIds || data.folderIds.length === 0) {
      throw ApiError.badRequest('Select at least one folder for this board');
    }
    // Verify every folderId belongs to the project
    const folders = await prisma.folder.findMany({
      where: { id: { in: data.folderIds }, projectId },
      select: { id: true },
    });
    if (folders.length !== data.folderIds.length) {
      throw ApiError.badRequest('One or more folders are not in this project');
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
        folders: { create: data.folderIds.map((folderId) => ({ folderId })) },
      },
      include: {
        folders: { include: { folder: { select: { id: true, name: true } } } },
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

    if (data.folderIds !== undefined) {
      if (data.folderIds.length === 0) {
        throw ApiError.badRequest('A board must have at least one folder');
      }
      const folders = await prisma.folder.findMany({
        where: { id: { in: data.folderIds }, projectId },
        select: { id: true },
      });
      if (folders.length !== data.folderIds.length) {
        throw ApiError.badRequest(
          'One or more folders are not in this project'
        );
      }
      await prisma.kanbanBoardFolder.deleteMany({ where: { boardId } });
      await prisma.kanbanBoardFolder.createMany({
        data: data.folderIds.map((folderId) => ({ boardId, folderId })),
      });
    }

    return prisma.kanbanBoard.update({
      where: { id: boardId },
      data: patch,
      include: {
        folders: { include: { folder: { select: { id: true, name: true } } } },
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
      include: { folders: { select: { folderId: true } } },
    });
    if (!board) return false;
    const accessible = await resolveAccessibleFolderIds(projectId, member);
    return boardVisibleTo(
      board.folders.map((f) => f.folderId),
      accessible
    );
  },

  async boardFolderIds(boardId: string): Promise<string[]> {
    const rows = await prisma.kanbanBoardFolder.findMany({
      where: { boardId },
      select: { folderId: true },
    });
    return rows.map((r) => r.folderId);
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
