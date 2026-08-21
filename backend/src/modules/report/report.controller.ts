import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { reportService } from './report.service';
import {
  createEntrySchema,
  updateEntrySchema,
  reportQuerySchema,
} from './report.validators';

const requireUser = (req: Request) => {
  if (!req.user) throw ApiError.unauthorized('Not authenticated');
  return req.user;
};

export const reportController = {
  /** GET /projects/:id/report — the issues report, scoped to the caller. */
  getReport: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;
    const { flaggedOnly } = reportQuerySchema.parse(req.query);
    const report = await reportService.getReport(projectId as string, requireUser(req), {
      flaggedOnly,
    });
    res.json(report);
  }),

  /** POST /projects/:id/report/entries — add a finding by hand. */
  createEntry: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;
    const input = createEntrySchema.parse(req.body);
    const entry = await reportService.createEntry(projectId as string, requireUser(req), input);
    res.status(201).json(entry);
  }),

  /** PATCH /projects/:id/report/entries/:entryId — edit or sign off a finding. */
  updateEntry: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, entryId } = req.params as Record<string, string>;
    const input = updateEntrySchema.parse(req.body);
    const entry = await reportService.updateEntry(
      projectId as string,
      entryId as string,
      requireUser(req),
      input
    );
    res.json(entry);
  }),

  /** DELETE /projects/:id/report/entries/:entryId */
  deleteEntry: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, entryId } = req.params as Record<string, string>;
    await reportService.deleteEntry(projectId as string, entryId as string, requireUser(req));
    res.status(204).send();
  }),
};
