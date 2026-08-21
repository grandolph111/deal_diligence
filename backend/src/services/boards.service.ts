/**
 * Kanban board service. A board is a view of ONE specialist's slice of the
 * deal: it is created for a subject-matter expert, and its risk category scope is
 * derived from that member's grants rather than chosen separately.
 *
 * Deriving instead of storing is the point. An admin re-grants risk categories in
 * Admin → Team and every board that SME owns re-scopes on the next read —
 * document pickers, task attachments, visibility, all of it. There is no
 * snapshot to drift out of sync with the permission that actually governs.
 *
 * Visibility, in order:
 *   1. Full-access caller (OWNER/ADMIN, or platform admin via synthetic
 *      membership) → every board in the project, assigned or not.
 *   2. Board with an SME → visible only to that SME.
 *   3. Board with no SME (the auto-generated "All Documents" default, or one
 *      whose SME left) → the legacy rule: visible if every stored risk category
 *      on it is inside the caller's grants.
 *
 * Rule 2 is deliberately stricter than rule 3. Two IP lawyers holding the same
 * grant should not see each other's boards; under set-inclusion alone they
 * would.
 *
 * Folder scoping is retained but dormant — see KanbanBoardFolder.
 */

import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import { computeScopeKey, SCOPE_FULL } from '../utils/scope-key';
import { documentsService } from '../modules/documents/documents.service';
import { RISK_CATEGORIES } from '../integrations/library/risk-categories';
import type { ProjectMember } from '@prisma/client';

const DEFAULT_BOARD_NAME = 'All Documents';

export interface CreateBoardInput {
  name: string;
  description?: string | null;
  /** The SME this board belongs to. Their grants become the board's scope. */
  smeUserId?: string;
  /** @deprecated superseded by smeUserId — a board no longer picks risk categories directly. */
  riskCategoryIds?: string[];
  /** @deprecated dormant — folder scoping is retired from the UI. */
  folderIds?: string[];
}

export interface UpdateBoardInput {
  name?: string;
  description?: string | null;
  /** Reassign the board to a different SME. */
  smeUserId?: string | null;
  /** @deprecated superseded by smeUserId. */
  riskCategoryIds?: string[];
  /** @deprecated dormant. */
  folderIds?: string[];
}

const VALID_WORKSTREAM_IDS = new Set(RISK_CATEGORIES.map((w) => w.id));

/** Reject unknown slugs early — the checklist is static config, so there is no FK to catch typos. */
const assertValidRiskCategories = (ids: string[]): string[] => {
  const unique = [...new Set(ids)];
  const unknown = unique.filter((id) => !VALID_WORKSTREAM_IDS.has(id));
  if (unknown.length > 0) {
    throw ApiError.badRequest(`Unknown risk category(s): ${unknown.join(', ')}`);
  }
  return unique;
};

const isFullAccess = (member: ProjectMember): boolean =>
  member.role === 'OWNER' || member.role === 'ADMIN';

/** The risk category slugs a member has been granted on this project. */
const grantedRiskCategoryIds = (member: ProjectMember): string[] => {
  const perms = (member.permissions ?? {}) as Record<string, unknown>;
  const granted = perms.restrictedRiskCategories as string[] | undefined;
  return Array.isArray(granted) ? [...new Set(granted)] : [];
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

/**
 * null = full access (OWNER/ADMIN only). Everyone else gets their grants
 * verbatim, and an empty grant list means empty — not "everything".
 *
 * This used to key off `computeScopeKey`, which reports full access whenever a
 * member holds no *folder* restrictions. Since folders were retired, that was
 * true of every member, so the risk category rule below never actually ran and any
 * scoped board was visible project-wide. Failing closed here matches
 * scope.service, which already returns NO_ACCESS for a member with no grants.
 *
 * A member with no grants still sees unscoped boards — `[].every()` is true —
 * which is what keeps the "All Documents" default board reachable.
 */
const resolveAccessibleRiskCategoryIds = (member: ProjectMember): string[] | null => {
  if (isFullAccess(member)) return null;
  return grantedRiskCategoryIds(member);
};

/**
 * Legacy set-inclusion rule, still used for boards with no SME: every scope on
 * the board must be in the member's allowed set. null accessible set = full
 * access; an unscoped board covers the whole project and is visible to anyone
 * who can reach the project at all.
 */
const boardVisibleTo = (
  boardScopeIds: string[],
  accessibleIds: string[] | null
): boolean => {
  if (accessibleIds == null) return true;
  return boardScopeIds.every((id) => accessibleIds.includes(id));
};

/** Hydrate a stored slug into the {id,title} shape the UI renders. */
const describeRiskCategory = (riskCategoryId: string): { id: string; title: string } => ({
  id: riskCategoryId,
  title: RISK_CATEGORIES.find((w) => w.id === riskCategoryId)?.title ?? riskCategoryId,
});

/** Shape the UI needs to render "whose board is this". */
type SmeSummary = { id: string; name: string | null; email: string } | null;

interface BoardScopeRow {
  smeUserId: string | null;
  riskCategories: { riskCategoryId: string }[];
}

/**
 * The risk categories a board actually covers. Derived from the SME's live grants
 * when the board has one; the stored rows are only a fallback for unassigned
 * boards. An SME whose grants were revoked yields [] — the board goes empty
 * rather than silently widening to the whole deal.
 */
const resolveBoardRiskCategoryIds = async (
  projectId: string,
  board: BoardScopeRow
): Promise<string[]> => {
  if (!board.smeUserId) {
    return board.riskCategories.map((w) => w.riskCategoryId);
  }
  const sme = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: board.smeUserId } },
  });
  if (!sme) return [];
  // An SME promoted to ADMIN holds no explicit grants but sees everything, so
  // their board covers the whole deal — same as the unscoped default board.
  if (isFullAccess(sme)) return [];
  return grantedRiskCategoryIds(sme);
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

  /**
   * Members eligible to be a board's SME: everyone on the project who holds
   * risk category grants. OWNER/ADMIN are excluded — they already see every board,
   * so assigning one as an SME would carve out nothing.
   */
  async listEligibleSmes(projectId: string) {
    const members = await prisma.projectMember.findMany({
      where: { projectId, role: { in: ['MEMBER', 'VIEWER'] } },
      include: {
        user: { select: { id: true, name: true, email: true, avatarUrl: true } },
      },
      orderBy: { invitedAt: 'asc' },
    });

    return members.map((m) => {
      const riskCategoryIds = grantedRiskCategoryIds(m);
      return {
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        avatarUrl: m.user.avatarUrl,
        role: m.role,
        riskCategories: riskCategoryIds.map(describeRiskCategory),
      };
    });
  },

  async listForMember(projectId: string, member: ProjectMember) {
    const fullAccess = isFullAccess(member);
    const [accessibleFolders, accessibleRiskCategories] = [
      await resolveAccessibleFolderIds(projectId, member),
      resolveAccessibleRiskCategoryIds(member),
    ];
    const boards = await prisma.kanbanBoard.findMany({
      where: {
        projectId,
        // A non-admin sees their own boards plus any unassigned ones they
        // qualify for under the legacy rule. Filtering here keeps the
        // per-board scope resolution below off other people's boards.
        ...(fullAccess ? {} : { OR: [{ smeUserId: member.userId }, { smeUserId: null }] }),
      },
      include: {
        folders: {
          include: { folder: { select: { id: true, name: true } } },
        },
        riskCategories: { select: { riskCategoryId: true } },
        sme: { select: { id: true, name: true, email: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    const rows = await Promise.all(
      boards.map(async (b) => ({
        id: b.id,
        name: b.name,
        description: b.description,
        isDefault: b.isDefault,
        createdAt: b.createdAt,
        updatedAt: b.updatedAt,
        sme: b.sme as SmeSummary,
        folders: b.folders.map((bf) => bf.folder),
        riskCategories: (
          await resolveBoardRiskCategoryIds(projectId, b)
        ).map(describeRiskCategory),
        taskCount: b._count.tasks,
        _smeUserId: b.smeUserId,
      }))
    );

    return rows
      .filter((b) => {
        if (fullAccess) return true;
        if (b._smeUserId) return b._smeUserId === member.userId;
        return (
          boardVisibleTo(
            b.folders.map((f) => f.id),
            accessibleFolders
          ) &&
          boardVisibleTo(
            b.riskCategories.map((w) => w.id),
            accessibleRiskCategories
          )
        );
      })
      .map(({ _smeUserId, ...board }) => board);
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
        riskCategories: { select: { riskCategoryId: true } },
        sme: { select: { id: true, name: true, email: true } },
      },
    });
    if (!board) throw ApiError.notFound('Board not found');

    if (!isFullAccess(member)) {
      if (board.smeUserId) {
        if (board.smeUserId !== member.userId) {
          throw ApiError.forbidden('This board belongs to another specialist');
        }
      } else {
        const accessibleFolders = await resolveAccessibleFolderIds(projectId, member);
        if (
          !boardVisibleTo(board.folders.map((bf) => bf.folderId), accessibleFolders)
        ) {
          throw ApiError.forbidden('Board covers folders outside your access scope');
        }
        const accessibleRiskCategories = resolveAccessibleRiskCategoryIds(member);
        if (
          !boardVisibleTo(
            board.riskCategories.map((bw) => bw.riskCategoryId),
            accessibleRiskCategories
          )
        ) {
          throw ApiError.forbidden('Board covers risk categories outside your access scope');
        }
      }
    }

    const riskCategoryIds = await resolveBoardRiskCategoryIds(projectId, board);

    // The exact document set tasks on this board may attach. Sent so the
    // attachment picker offers what the API will actually accept, rather than
    // showing the whole data room and failing on save.
    const documentIds =
      riskCategoryIds.length === 0
        ? null
        : await documentsService.documentIdsWithEvidence(projectId, { riskCategoryIds });

    return {
      id: board.id,
      name: board.name,
      description: board.description,
      isDefault: board.isDefault,
      createdAt: board.createdAt,
      updatedAt: board.updatedAt,
      sme: board.sme as SmeSummary,
      folders: board.folders.map((bf) => bf.folder),
      riskCategories: riskCategoryIds.map(describeRiskCategory),
      documentIds,
    };
  },

  /**
   * Create a board for an SME.
   *
   * `actingMember` decides who may be named: a full-access caller picks any
   * eligible member, while anyone else can only create a board for themselves.
   * That is what lets a specialist carve up their own work without an admin,
   * and it cannot widen their access — the board inherits their grants.
   */
  async create(
    projectId: string,
    creatorUserId: string,
    data: CreateBoardInput,
    actingMember: ProjectMember
  ) {
    const name = data.name.trim();
    if (!name) throw ApiError.badRequest('Board name is required');

    const smeUserId = isFullAccess(actingMember)
      ? data.smeUserId
      : actingMember.userId;

    const folderIds = data.folderIds ?? [];
    const riskCategoryIds = data.riskCategoryIds?.length
      ? assertValidRiskCategories(data.riskCategoryIds)
      : [];

    if (!smeUserId && folderIds.length === 0 && riskCategoryIds.length === 0) {
      throw ApiError.badRequest('Select the specialist this board is for');
    }

    if (smeUserId) {
      const sme = await prisma.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: smeUserId } },
      });
      if (!sme) {
        throw ApiError.badRequest('That specialist is not a member of this project');
      }
      if (isFullAccess(sme)) {
        throw ApiError.badRequest(
          'Owners and admins already see every board — assign this board to a member instead'
        );
      }
      if (grantedRiskCategoryIds(sme).length === 0) {
        throw ApiError.badRequest(
          'That specialist has no risk categories yet. Grant them access in Admin → Team first.'
        );
      }
    }

    // Verify every folderId belongs to the project (risk categories are static
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

    const board = await prisma.kanbanBoard.create({
      data: {
        projectId,
        name,
        description: data.description ?? null,
        smeUserId: smeUserId ?? null,
        createdById: creatorUserId,
        folders: { create: folderIds.map((folderId) => ({ folderId })) },
        riskCategories: { create: riskCategoryIds.map((riskCategoryId) => ({ riskCategoryId })) },
      },
      include: {
        folders: { include: { folder: { select: { id: true, name: true } } } },
        riskCategories: { select: { riskCategoryId: true } },
        sme: { select: { id: true, name: true, email: true } },
      },
    });

    const resolved = await resolveBoardRiskCategoryIds(projectId, board);
    return {
      ...board,
      sme: board.sme as SmeSummary,
      folders: board.folders.map((bf) => bf.folder),
      riskCategories: resolved.map(describeRiskCategory),
    };
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
      smeUserId?: string | null;
    } = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.description !== undefined) patch.description = data.description;

    if (data.smeUserId !== undefined) {
      if (data.smeUserId === null) {
        patch.smeUserId = null;
      } else {
        const sme = await prisma.projectMember.findUnique({
          where: { projectId_userId: { projectId, userId: data.smeUserId } },
        });
        if (!sme) {
          throw ApiError.badRequest('That specialist is not a member of this project');
        }
        if (isFullAccess(sme)) {
          throw ApiError.badRequest(
            'Owners and admins already see every board — assign this board to a member instead'
          );
        }
        if (grantedRiskCategoryIds(sme).length === 0) {
          throw ApiError.badRequest(
            'That specialist has no risk categories yet. Grant them access in Admin → Team first.'
          );
        }
        patch.smeUserId = data.smeUserId;
      }
    }

    // A board must keep a scope: either an SME, or (for legacy unassigned
    // boards) at least one stored row across both axes. Check the post-update
    // state, so clearing folders while naming an SME is fine.
    if (
      data.folderIds !== undefined ||
      data.riskCategoryIds !== undefined ||
      data.smeUserId !== undefined
    ) {
      const [currentFolders, currentRiskCategories] = await Promise.all([
        prisma.kanbanBoardFolder.count({ where: { boardId } }),
        prisma.kanbanBoardRiskCategory.count({ where: { boardId } }),
      ]);
      const nextSme =
        data.smeUserId !== undefined ? data.smeUserId : board.smeUserId;
      const nextFolders = data.folderIds?.length ?? currentFolders;
      const nextRiskCategories = data.riskCategoryIds?.length ?? currentRiskCategories;
      if (!nextSme && nextFolders === 0 && nextRiskCategories === 0 && !board.isDefault) {
        throw ApiError.badRequest('A board must be assigned to a specialist');
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

    if (data.riskCategoryIds !== undefined) {
      const riskCategoryIds = assertValidRiskCategories(data.riskCategoryIds);
      await prisma.kanbanBoardRiskCategory.deleteMany({ where: { boardId } });
      await prisma.kanbanBoardRiskCategory.createMany({
        data: riskCategoryIds.map((riskCategoryId) => ({ boardId, riskCategoryId })),
      });
    }

    const updated = await prisma.kanbanBoard.update({
      where: { id: boardId },
      data: patch,
      include: {
        folders: { include: { folder: { select: { id: true, name: true } } } },
        riskCategories: { select: { riskCategoryId: true } },
        sme: { select: { id: true, name: true, email: true } },
      },
    });

    const resolved = await resolveBoardRiskCategoryIds(projectId, updated);
    return {
      ...updated,
      sme: updated.sme as SmeSummary,
      folders: updated.folders.map((bf) => bf.folder),
      riskCategories: resolved.map(describeRiskCategory),
    };
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
        riskCategories: { select: { riskCategoryId: true } },
      },
    });
    if (!board) return false;
    if (isFullAccess(member)) return true;
    if (board.smeUserId) return board.smeUserId === member.userId;

    const accessibleFolders = await resolveAccessibleFolderIds(projectId, member);
    const accessibleRiskCategories = resolveAccessibleRiskCategoryIds(member);
    return (
      boardVisibleTo(board.folders.map((f) => f.folderId), accessibleFolders) &&
      boardVisibleTo(board.riskCategories.map((w) => w.riskCategoryId), accessibleRiskCategories)
    );
  },

  /**
   * Every board the caller may open. `null` means "all of them" — the answer
   * for a full-access caller, and the signal for query builders to skip the
   * boardId filter entirely rather than materialise the whole project's boards.
   */
  async accessibleBoardIds(
    projectId: string,
    member: ProjectMember
  ): Promise<string[] | null> {
    if (isFullAccess(member)) return null;
    const boards = await this.listForMember(projectId, member);
    return boards.map((b) => b.id);
  },

  /**
   * Who may be assigned a task on this board: its SME, plus every OWNER/ADMIN
   * on the project (who can already see and act on every board).
   */
  async assignableUserIds(boardId: string, projectId: string): Promise<string[]> {
    const [board, admins] = await Promise.all([
      prisma.kanbanBoard.findFirst({
        where: { id: boardId, projectId },
        select: { smeUserId: true },
      }),
      prisma.projectMember.findMany({
        where: { projectId, role: { in: ['OWNER', 'ADMIN'] } },
        select: { userId: true },
      }),
    ]);
    const ids = new Set(admins.map((a) => a.userId));
    if (board?.smeUserId) ids.add(board.smeUserId);
    return [...ids];
  },

  async boardFolderIds(boardId: string): Promise<string[]> {
    const rows = await prisma.kanbanBoardFolder.findMany({
      where: { boardId },
      select: { folderId: true },
    });
    return rows.map((r) => r.folderId);
  },

  async boardRiskCategoryIds(boardId: string, projectId?: string): Promise<string[]> {
    const board = await prisma.kanbanBoard.findUnique({
      where: { id: boardId },
      select: {
        projectId: true,
        smeUserId: true,
        riskCategories: { select: { riskCategoryId: true } },
      },
    });
    if (!board) return [];
    return resolveBoardRiskCategoryIds(projectId ?? board.projectId, board);
  },

  /**
   * Documents a board covers — those supplying evidence to any of its
   * risk categories. `null` means unscoped (whole project), matching the
   * "All Documents" default board.
   */
  async boardDocumentIds(boardId: string, projectId: string): Promise<string[] | null> {
    const riskCategoryIds = await this.boardRiskCategoryIds(boardId, projectId);
    if (riskCategoryIds.length === 0) return null;
    return documentsService.documentIdsWithEvidence(projectId, { riskCategoryIds });
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
