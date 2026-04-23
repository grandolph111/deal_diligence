import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { prisma } from '../../config/database';
import { dealBriefService } from '../../services/deal-brief.service';
import {
  reconciliationService,
} from '../../services/reconciliation.service';
import { computeScopeKey } from '../../utils/scope-key';

export const briefController = {
  /**
   * GET /projects/:id/brief
   * Returns the current user's scope-filtered brief.
   */
  get: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;
    if (!req.user) throw ApiError.unauthorized('User not found');

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId: req.user.id },
      },
    });
    if (!membership) throw ApiError.forbidden('Not a member of this project');

    const scopeKey = computeScopeKey(membership);
    const markdown = await dealBriefService.loadBrief(projectId, scopeKey);
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { briefManifest: true },
    });
    const manifest = dealBriefService.parseManifest(
      project?.briefManifest ?? null
    );
    const updatedAt = manifest[scopeKey]?.updatedAt ?? null;

    res.json({
      scopeKey,
      scopeLabel: scopeKey === 'full' ? 'Full deal access' : 'Scoped',
      markdown,
      updatedAt,
    });
  }),

  /**
   * PUT /projects/:id/brief/sections/:sectionId
   * Overwrite a human-editable section.
   */
  saveHumanSection: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId, sectionId } = req.params as Record<string, string>;
    if (!req.user) throw ApiError.unauthorized('User not found');
    if (!dealBriefService.isHumanSection(sectionId)) {
      throw ApiError.badRequest(
        `Section "${sectionId}" is not human-editable.`
      );
    }
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: { projectId, userId: req.user.id },
      },
    });
    if (!membership) throw ApiError.forbidden('Not a member of this project');

    const content =
      typeof req.body?.content === 'string' ? req.body.content : '';
    const scopeKey = computeScopeKey(membership);
    const updated = await dealBriefService.updateHumanSection({
      projectId,
      scopeKey,
      sectionId,
      content,
    });
    res.json({ scopeKey, markdown: updated });
  }),

  /**
   * POST /projects/:id/brief/rebuild
   * Force a rebuild bypassing debounce. ADMIN/OWNER only.
   */
  rebuild: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;
    const result = await reconciliationService.rebuildProjectGraph(projectId);
    if (!result.ok) {
      throw ApiError.badRequest(result.reason ?? 'Rebuild produced no brief.');
    }
    res.json({
      success: true,
      scopesGenerated: result.scopesGenerated,
      warnings: result.scopeErrors,
    });
  }),
};
