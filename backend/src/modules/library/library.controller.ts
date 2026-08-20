import { Request, Response } from 'express';
import { z } from 'zod';
import { libraryService } from './library.service';
import { libraryLintService } from '../../services/library-lint.service';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';

// Checklist item slugs, not UUIDs; the service validates them against the
// static checklist and against the caller's workstream grants.
const createNoteSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(50_000),
  itemIds: z.array(z.string().min(1).max(64)).max(20).optional(),
  documentIds: z.array(z.string().min(1).max(500)).max(50).optional(),
});

const suggestNoteSchema = z.object({
  documentIds: z.array(z.string().min(1).max(500)).max(50),
});

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

  /** GET /projects/:id/library/documents/:documentId/backlinks — what else touches this doc. */
  getDocumentBacklinks: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized('User not found');
    const projectId = req.params.id as string;
    const documentId = req.params.documentId as string;
    res.json(await libraryService.getDocumentBacklinks(projectId, documentId, req.user));
  }),

  /** GET /projects/:id/library/clauses/:clauseType/compare — every peer instance. */
  compareClause: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized('User not found');
    const projectId = req.params.id as string;
    const clauseType = req.params.clauseType as string;
    res.json(await libraryService.compareClause(projectId, clauseType, req.user));
  }),

  /** POST /projects/:id/library/notes/suggest — where an answer would file. */
  suggestNoteItems: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized('User not found');
    const projectId = req.params.id as string;
    const { documentIds } = suggestNoteSchema.parse(req.body);
    res.json({ items: await libraryService.suggestNoteItems(projectId, documentIds, req.user) });
  }),

  /** POST /projects/:id/library/notes — file an answer back into the library. */
  createNote: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized('User not found');
    const projectId = req.params.id as string;
    const data = createNoteSchema.parse(req.body);
    res.status(201).json(await libraryService.createNote(projectId, req.user, data));
  }),

  /** POST /projects/:id/library/lint — run the gap-hunting pass, return findings. */
  runLint: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized('User not found');
    const projectId = req.params.id as string;
    const result = await libraryLintService.run(projectId, req.user);
    res.json(result);
  }),
};
