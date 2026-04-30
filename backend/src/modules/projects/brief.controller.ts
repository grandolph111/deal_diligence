import { Request, Response } from 'express';
import { ProjectRole } from '@prisma/client';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { prisma } from '../../config/database';
import { dealBriefService } from '../../services/deal-brief.service';
import {
  reconciliationService,
} from '../../services/reconciliation.service';
import { computeScopeKey } from '../../utils/scope-key';

/**
 * Resolve the scope-key for the caller on a project. Uses the real
 * ProjectMember row if present; falls back to a synthetic OWNER for
 * Super Admin and same-company Customer Admin (who have no DB row).
 * Returns `null` when the caller shouldn't see the brief at all.
 */
async function resolveScopeKeyForUser(
  userId: string,
  projectId: string
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true, companyId: true },
  });
  if (!user) return null;

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (membership) return computeScopeKey(membership);

  if (user.platformRole === 'SUPER_ADMIN') {
    return computeScopeKey({ role: ProjectRole.OWNER, permissions: null } as never);
  }

  if (user.platformRole === 'CUSTOMER_ADMIN' && user.companyId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { companyId: true },
    });
    if (project && project.companyId === user.companyId) {
      return computeScopeKey({ role: ProjectRole.OWNER, permissions: null } as never);
    }
  }
  return null;
}

export const briefController = {
  /**
   * GET /projects/:id/brief
   * Returns the current user's scope-filtered brief.
   */
  get: asyncHandler(async (req: Request, res: Response) => {
    const { id: projectId } = req.params as Record<string, string>;
    if (!req.user) throw ApiError.unauthorized('User not found');

    const scopeKey = await resolveScopeKeyForUser(req.user.id, projectId);
    if (!scopeKey) throw ApiError.forbidden('Not a member of this project');

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
    const scopeKey = await resolveScopeKeyForUser(req.user.id, projectId);
    if (!scopeKey) throw ApiError.forbidden('Not a member of this project');

    const content =
      typeof req.body?.content === 'string' ? req.body.content : '';
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
