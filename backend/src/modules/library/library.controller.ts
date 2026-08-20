import { Request, Response } from 'express';
import { libraryService } from './library.service';
import { libraryLintService } from '../../services/library-lint.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';

export const libraryController = {
  /** GET /projects/:id/library/toc — workstream → checklist item tree with counts. */
  getToc: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized('User not found');
    const projectId = req.params.id as string;
    const toc = await libraryService.getToc(projectId, req.user);
    res.json(toc);
  }),

  /**
   * GET /projects/:id/library/graph — the base graph.
   * `?include=sources,entities` opts the heavier tiers back in.
   */
  getGraph: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized('User not found');
    const projectId = req.params.id as string;
    const include = String(req.query.include ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const graph = await libraryService.getGraph(projectId, req.user, {
      includeSources: include.includes('sources'),
      includeEntities: include.includes('entities'),
    });
    res.json(graph);
  }),

  /** GET /projects/:id/library/items/:itemId/evidence — provisions under one item. */
  getItemEvidence: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized('User not found');
    const projectId = req.params.id as string;
    const itemId = req.params.itemId as string;
    const graph = await libraryService.getItemEvidence(projectId, itemId, req.user);
    res.json(graph);
  }),

  /** POST /projects/:id/library/lint — run the gap-hunting pass, return findings. */
  runLint: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized('User not found');
    const projectId = req.params.id as string;
    const result = await libraryLintService.run(projectId, req.user);
    res.json(result);
  }),
};
