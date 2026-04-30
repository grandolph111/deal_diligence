/**
 * Project dashboard aggregations.
 * Every query respects the caller's folder scope for field specialists.
 */

import { prisma } from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { resolveProjectScope, type FolderScope } from '../../services/scope.service';

const DEAL_TYPES = ['SPA', 'APA', 'LOI'];

const scopeClause = (projectId: string, scope: FolderScope) =>
  scope.isFullAccess
    ? { projectId }
    : {
        projectId,
        folderId: { in: scope.allowedFolderIds },
      };

export const dashboardService = {
  async getProjectDashboard(projectId: string, userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, platformRole: true, companyId: true },
    });
    if (!user) throw ApiError.unauthorized('User not found');

    const scope = await resolveProjectScope(user, projectId);

    // Zero-scope SME: return an empty but well-formed dashboard so the
    // frontend can render "awaiting folder access" instead of blowing up.
    if (!scope.isFullAccess && scope.allowedFolderIds.length === 0) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, description: true, createdAt: true },
      });
      if (!project) throw ApiError.notFound('Project not found');
      return {
        project,
        scope: { isFullAccess: false, allowedFolderCount: 0 },
        header: {
          portfolioRiskScore: null,
          dealValue: null,
          dealCurrency: null,
          effectiveDate: null,
          governingLaw: null,
        },
        riskStrip: {
          highRiskDocuments: 0,
          openAiTasks: 0,
          pendingSpecialistReviews: 0,
          flaggedClauses: 0,
        },
        documentsByRisk: [],
        entitySummary: [],
        masterEntities: [],
        recentReports: [],
      };
    }

    const [project, documents, highRiskCount, openAiTasks, pendingReview, flaggedClauses, recentReports] =
      await Promise.all([
        prisma.project.findUnique({
          where: { id: projectId },
          select: { id: true, name: true, description: true, createdAt: true },
        }),
        prisma.document.findMany({
          where: {
            ...scopeClause(projectId, scope),
            processingStatus: 'COMPLETE',
          },
          select: {
            id: true,
            name: true,
            documentType: true,
            riskScore: true,
            riskLevel: true,
            riskSummary: true,
            extractionSummary: true,
            pageCount: true,
            dealValue: true,
            effectiveDate: true,
            governingLaw: true,
            currency: true,
            folderId: true,
            createdAt: true,
            confidenceScore: true,
            confidenceReason: true,
            verificationStatus: true,
          },
          orderBy: [{ riskScore: 'desc' }, { createdAt: 'desc' }],
          take: 50,
        }),
        prisma.document.count({
          where: {
            ...scopeClause(projectId, scope),
            riskLevel: 'HIGH',
          },
        }),
        prisma.task.count({
          where: {
            projectId,
            // "Open" = anything the user is still waiting on output for.
            // IDLE = task has an aiPrompt but hasn't been run yet.
            // QUEUED/RUNNING = in flight. Excludes SUCCEEDED + FAILED.
            aiStatus: { in: ['IDLE', 'QUEUED', 'RUNNING'] },
          },
        }),
        prisma.task.count({
          where: {
            projectId,
            status: 'IN_REVIEW',
            aiReportS3Key: { not: null },
          },
        }),
        prisma.documentAnnotation.count({
          where: {
            document: scopeClause(projectId, scope),
            annotationType: 'CLAUSE',
            riskLevel: { in: ['HIGH', 'MEDIUM'] },
          },
        }),
        prisma.task.findMany({
          where: {
            projectId,
            aiStatus: 'SUCCEEDED',
          },
          select: {
            id: true,
            title: true,
            aiReportSummary: true,
            aiCompletedAt: true,
            aiConfidenceScore: true,
            aiConfidenceReason: true,
            status: true,
          },
          orderBy: { aiCompletedAt: 'desc' },
          take: 8,
        }),
      ]);

    if (!project) throw ApiError.notFound('Project not found');

    // Portfolio risk score: weighted average by page count (falls back to 1 per doc).
    const scored = documents.filter((d) => d.riskScore != null);
    const portfolioRiskScore = scored.length
      ? Math.round(
          scored.reduce(
            (acc, d) => acc + (d.riskScore ?? 0) * Math.max(d.pageCount ?? 1, 1),
            0
          ) /
            scored.reduce((acc, d) => acc + Math.max(d.pageCount ?? 1, 1), 0)
        )
      : null;

    // Deal value: largest from any SPA/APA/LOI document.
    const dealDoc = documents
      .filter((d) => d.documentType && DEAL_TYPES.includes(d.documentType))
      .sort(
        (a, b) => Number(b.dealValue ?? 0) - Number(a.dealValue ?? 0)
      )[0];

    // Entity rollups, also scoped.
    const entities = await prisma.documentEntity.groupBy({
      by: ['entityType'],
      where: {
        document: scopeClause(projectId, scope),
      },
      _count: { _all: true },
    });

    const masterEntities = await prisma.masterEntity.findMany({
      where: { projectId },
      select: {
        id: true,
        entityType: true,
        canonicalName: true,
        aliases: true,
      },
      take: 40,
    });

    return {
      project,
      scope: {
        isFullAccess: scope.isFullAccess,
        allowedFolderCount: scope.isFullAccess ? null : scope.allowedFolderIds.length,
      },
      header: {
        portfolioRiskScore,
        dealValue: dealDoc?.dealValue ? Number(dealDoc.dealValue) : null,
        dealCurrency: dealDoc?.currency ?? null,
        effectiveDate: dealDoc?.effectiveDate ?? null,
        governingLaw: dealDoc?.governingLaw ?? null,
      },
      riskStrip: {
        highRiskDocuments: highRiskCount,
        openAiTasks,
        pendingSpecialistReviews: pendingReview,
        flaggedClauses,
      },
      documentsByRisk: documents,
      entitySummary: entities.map((e) => ({
        entityType: e.entityType,
        count: e._count._all,
      })),
      masterEntities,
      recentReports,
    };
  },
};
