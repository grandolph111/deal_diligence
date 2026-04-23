import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { playbookService } from '../../services/playbook.service';
import { playbookSchema } from '../../integrations/claude';

export const playbookController = {
  get: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;
    const playbook = await playbookService.get(projectId);
    res.json({ playbook });
  }),

  save: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;
    const parsed = playbookSchema.safeParse(req.body);
    if (!parsed.success) {
      throw ApiError.badRequest(
        'Invalid playbook: ' + parsed.error.errors.map((e) => e.message).join('; ')
      );
    }
    const saved = await playbookService.save(projectId, parsed.data);
    res.json({ playbook: saved });
  }),

  clear: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;
    await playbookService.clear(projectId);
    res.status(204).send();
  }),

  template: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ playbook: playbookService.template() });
  }),
};
