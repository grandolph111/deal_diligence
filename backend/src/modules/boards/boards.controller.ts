import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { boardsService } from '../../services/boards.service';

// A board is created FOR a specialist — `smeUserId` is the scope, and the
// workstreams follow from that member's grants. `workstreamIds` is kept only so
// pre-SME clients keep working; new callers should not send it.
const createBoardSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).nullable().optional(),
  smeUserId: z.string().uuid().optional(),
  /** @deprecated superseded by smeUserId. */
  workstreamIds: z.array(z.string().min(1).max(64)).optional(),
  /** @deprecated dormant — folder scoping is retired from the UI. */
  folderIds: z.array(z.string().uuid()).optional(),
});

const updateBoardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).nullable().optional(),
  smeUserId: z.string().uuid().nullable().optional(),
  /** @deprecated superseded by smeUserId. */
  workstreamIds: z.array(z.string().min(1).max(64)).optional(),
  /** @deprecated dormant. */
  folderIds: z.array(z.string().uuid()).optional(),
});

export const boardsController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;
    if (!req.projectMember) throw ApiError.forbidden('Not a member');
    const boards = await boardsService.listForMember(projectId, req.projectMember);
    res.json({ boards });
  }),

  /** Members who can be named as a board's SME, with the scope each would bring. */
  listSmes: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;
    const smes = await boardsService.listEligibleSmes(projectId);
    res.json({ smes });
  }),

  get: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, boardId } = req.params as Record<string, string>;
    if (!req.projectMember) throw ApiError.forbidden('Not a member');
    const board = await boardsService.getForMember(
      boardId,
      projectId,
      req.projectMember
    );
    res.json(board);
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;
    if (!req.user) throw ApiError.unauthorized('User not found');
    if (!req.projectMember) throw ApiError.forbidden('Not a member');
    const data = createBoardSchema.parse(req.body);
    const board = await boardsService.create(
      projectId,
      req.user.id,
      data,
      req.projectMember
    );
    res.status(201).json(board);
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, boardId } = req.params as Record<string, string>;
    const data = updateBoardSchema.parse(req.body);
    const board = await boardsService.update(boardId, projectId, data);
    res.json(board);
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, boardId } = req.params as Record<string, string>;
    await boardsService.delete(boardId, projectId);
    res.status(204).send();
  }),
};
