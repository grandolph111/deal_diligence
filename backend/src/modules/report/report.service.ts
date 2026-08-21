/**
 * The deal report — a due-diligence issues report assembled from what the deal
 * already knows.
 *
 * One section per risk category, in the order the template lays them out, each
 * carrying the three working columns:
 *
 *   Legal issues / discussion items   flagged provisions, live from the library,
 *                                     plus any entries a reviewer has signed off
 *   Next steps / action items         the Kanban tasks working that category
 *   Supplemental diligence requests   what to ask the other side for
 *
 * Flagged provisions are read live rather than copied into a table: they are
 * already extracted, quoted and page-cited, and a copy would go stale the moment
 * a document is re-extracted. Only the written analysis is stored, because that
 * is the part a person has to stand behind.
 *
 * Everything is scoped. A specialist granted two categories gets a report of
 * those two categories, and the coverage they see is computed from documents
 * they can actually open.
 */

import { Prisma, type User } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { resolveProjectScope } from '../../services/scope.service';
import {
  RISK_CATEGORIES,
  getRiskCategory,
  isRiskCategoryId,
} from '../../integrations/library/risk-categories';
import { isAbsentMarkerNode } from '../../utils/absent-marker';

type ScopeUser = Pick<User, 'id' | 'platformRole' | 'companyId'>;

/** A flagged clause, as it appears in the issues column. */
export interface ReportIssue {
  id: string;
  title: string;
  clauseType: string | null;
  riskLevel: string | null;
  confidence: number | null;
  quote: string | null;
  pageNumber: number | null;
  documentId: string | null;
  documentName: string | null;
}

export interface ReportEntryView {
  id: string;
  title: string;
  aiDraft: string;
  humanText: string | null;
  nextSteps: string | null;
  supplementalRequest: string | null;
  severity: string | null;
  status: 'AI_DRAFT' | 'IN_REVIEW' | 'VERIFIED';
  taskId: string | null;
  taskTitle: string | null;
  verifiedBy: { id: string; name: string | null; email: string } | null;
  verifiedAt: string | null;
  updatedAt: string;
}

export interface ReportSection {
  riskCategoryId: string;
  title: string;
  reportTitle: string;
  order: number;
  description: string;
  status: string;
  factFed: boolean;
  /** Flagged clause evidence, worst-first. */
  issues: ReportIssue[];
  /** Written findings — AI drafts and verified write-ups. */
  entries: ReportEntryView[];
  /** Open tasks touching this category. */
  actions: Array<{ id: string; title: string; status: string; assignees: string[] }>;
  /** Documents supplying any evidence here. */
  documentCount: number;
  evidenceCount: number;
}

export interface DealReport {
  project: { id: string; name: string; description: string | null };
  generatedAt: string;
  scope: { isFullAccess: boolean; categoryCount: number };
  sections: ReportSection[];
  totals: {
    categories: number;
    flagged: number;
    open: number;
    issues: number;
    entries: number;
    verified: number;
  };
}

const RISK_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

/** Documents the caller may see; null = everything. */
async function visibleDocIds(
  user: ScopeUser,
  projectId: string
): Promise<{ docIds: Set<string> | null; categories: string[] | null }> {
  const scope = await resolveProjectScope(user, projectId);
  if (scope.isFullAccess) return { docIds: null, categories: null };
  if (scope.allowedRiskCategoryIds.length === 0) {
    return { docIds: new Set(), categories: [] };
  }
  const rows = await prisma.libraryNode.findMany({
    where: {
      projectId,
      riskCategoryId: { in: scope.allowedRiskCategoryIds },
      sourceDocumentId: { not: null },
    },
    select: { sourceDocumentId: true },
  });
  return {
    docIds: new Set(rows.map((r) => r.sourceDocumentId as string)),
    categories: scope.allowedRiskCategoryIds,
  };
}

export const reportService = {
  /**
   * Build the report. `flaggedOnly` (the default) keeps it an *issues* report —
   * the exceptions, which is what the deliverable is for. Turning it off shows
   * every provision, which is the data room's job and is offered only because a
   * reviewer sometimes wants to see what sits behind a clean category.
   */
  async getReport(
    projectId: string,
    user: ScopeUser,
    opts: { flaggedOnly?: boolean } = {}
  ): Promise<DealReport> {
    const flaggedOnly = opts.flaggedOnly !== false;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, name: true, description: true },
    });
    if (!project) throw ApiError.notFound('Project not found');

    const { docIds, categories } = await visibleDocIds(user, projectId);
    const inScope = (docId: string | null): boolean =>
      docIds === null || (docId != null && docIds.has(docId));
    const visibleCategories = RISK_CATEGORIES.filter(
      (c) => categories === null || categories.includes(c.id)
    );
    const visibleIds = visibleCategories.map((c) => c.id);

    const [categoryNodes, evidence, entries, tasks] = await Promise.all([
      prisma.libraryNode.findMany({
        where: { projectId, type: 'RISK_CATEGORY', riskCategoryId: { in: visibleIds } },
        select: { riskCategoryId: true, status: true },
      }),
      prisma.libraryNode.findMany({
        where: {
          projectId,
          type: { in: ['PROVISION', 'RISK', 'OBLIGATION'] },
          riskCategoryId: { in: visibleIds },
          ...(flaggedOnly ? { riskLevel: { in: ['HIGH', 'MEDIUM'] } } : {}),
        },
        select: {
          id: true,
          riskCategoryId: true,
          title: true,
          content: true,
          clauseType: true,
          riskLevel: true,
          confidence: true,
          pageNumber: true,
          sourceDocumentId: true,
        },
      }),
      prisma.reportEntry.findMany({
        where: { projectId, riskCategoryId: { in: visibleIds } },
        include: {
          task: { select: { id: true, title: true } },
          verifiedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      }),
      prisma.task.findMany({
        where: { projectId, riskCategory: { in: visibleIds } },
        select: {
          id: true,
          title: true,
          status: true,
          riskCategory: true,
          assignees: { select: { user: { select: { name: true, email: true } } } },
        },
      }),
    ]);

    // Every count in the report is computed from evidence the caller can open,
    // so a restricted reviewer never sees a number driven by a document behind
    // their wall. Absence markers are dropped here as well as at persist: a
    // clause that says "not present in this document" is a finding that the
    // provision does NOT exist, and printing it as a flagged issue in a client
    // document would assert the opposite of what was found.
    const scopedEvidence = evidence.filter(
      (e) => inScope(e.sourceDocumentId) && !isAbsentMarkerNode(e)
    );
    const docIdsInPlay = [
      ...new Set(scopedEvidence.map((e) => e.sourceDocumentId).filter(Boolean)),
    ] as string[];
    const docNames = new Map(
      (
        await prisma.document.findMany({
          where: { id: { in: docIdsInPlay } },
          select: { id: true, name: true },
        })
      ).map((d) => [d.id, d.name])
    );

    const statusOf = new Map(categoryNodes.map((n) => [n.riskCategoryId, n.status ?? 'OPEN']));
    const byCategory = new Map<string, typeof scopedEvidence>();
    for (const e of scopedEvidence) {
      const arr = byCategory.get(e.riskCategoryId) ?? [];
      arr.push(e);
      byCategory.set(e.riskCategoryId, arr);
    }
    const entriesByCategory = new Map<string, typeof entries>();
    for (const e of entries) {
      const arr = entriesByCategory.get(e.riskCategoryId) ?? [];
      arr.push(e);
      entriesByCategory.set(e.riskCategoryId, arr);
    }
    const tasksByCategory = new Map<string, typeof tasks>();
    for (const t of tasks) {
      if (!t.riskCategory) continue;
      const arr = tasksByCategory.get(t.riskCategory) ?? [];
      arr.push(t);
      tasksByCategory.set(t.riskCategory, arr);
    }

    const sections: ReportSection[] = visibleCategories.map((cat) => {
      const ev = byCategory.get(cat.id) ?? [];
      const issues: ReportIssue[] = [...ev]
        .sort(
          (a, b) =>
            (RISK_RANK[b.riskLevel ?? ''] ?? 0) - (RISK_RANK[a.riskLevel ?? ''] ?? 0) ||
            (b.confidence ?? 0) - (a.confidence ?? 0)
        )
        .map((e) => ({
          id: e.id,
          title: e.title,
          clauseType: e.clauseType,
          riskLevel: e.riskLevel,
          confidence: e.confidence,
          quote: e.content,
          pageNumber: e.pageNumber,
          documentId: e.sourceDocumentId,
          documentName: e.sourceDocumentId ? (docNames.get(e.sourceDocumentId) ?? null) : null,
        }));

      return {
        riskCategoryId: cat.id,
        title: cat.title,
        reportTitle: cat.reportTitle,
        order: cat.order,
        description: cat.description,
        status: statusOf.get(cat.id) ?? 'OPEN',
        factFed: cat.factFed,
        issues,
        entries: (entriesByCategory.get(cat.id) ?? []).map(toEntryView),
        actions: (tasksByCategory.get(cat.id) ?? []).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          assignees: t.assignees.map((a) => a.user.name ?? a.user.email),
        })),
        documentCount: new Set(ev.map((e) => e.sourceDocumentId).filter(Boolean)).size,
        evidenceCount: ev.length,
      };
    });

    return {
      project,
      generatedAt: new Date().toISOString(),
      scope: { isFullAccess: docIds === null, categoryCount: visibleCategories.length },
      sections,
      totals: {
        categories: sections.length,
        flagged: sections.filter((s) => s.status === 'FLAGGED').length,
        open: sections.filter((s) => s.status === 'OPEN').length,
        issues: sections.reduce((n, s) => n + s.issues.length, 0),
        entries: sections.reduce((n, s) => n + s.entries.length, 0),
        verified: sections.reduce(
          (n, s) => n + s.entries.filter((e) => e.status === 'VERIFIED').length,
          0
        ),
      },
    };
  },

  /**
   * File an approved AI task report into the deal report.
   *
   * Called when a reviewer approves the task, so the entry lands VERIFIED with
   * their name on it — approval is the act that puts a finding in a document a
   * client may read, and it should carry an author.
   */
  async fileFromTask(
    taskId: string,
    approver: { id: string },
    opts: { verified: boolean } = { verified: true }
  ): Promise<void> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        projectId: true,
        title: true,
        riskCategory: true,
        aiReportSummary: true,
        aiPrompt: true,
        priority: true,
      },
    });
    if (!task) return;

    // A task with no category has nowhere to file. Rather than guess, fall back
    // to the report's own catch-all so the work is still visible.
    const riskCategoryId =
      task.riskCategory && isRiskCategoryId(task.riskCategory)
        ? task.riskCategory
        : '26-other-red-flags';

    const draft = (task.aiReportSummary ?? '').trim();
    if (!draft) return; // nothing written — nothing to file

    const existing = await prisma.reportEntry.findFirst({ where: { taskId: task.id } });
    const data = {
      projectId: task.projectId,
      riskCategoryId,
      taskId: task.id,
      title: task.title,
      aiDraft: draft,
      severity: task.priority === 'HIGH' || task.priority === 'URGENT' ? 'HIGH' : 'MEDIUM',
      status: opts.verified ? ('VERIFIED' as const) : ('AI_DRAFT' as const),
      verifiedById: opts.verified ? approver.id : null,
      verifiedAt: opts.verified ? new Date() : null,
    };

    if (existing) {
      await prisma.reportEntry.update({ where: { id: existing.id }, data });
    } else {
      await prisma.reportEntry.create({ data });
    }
  },

  /**
   * Retract a task's entries. Requesting changes clears the AI draft on the
   * task, so leaving its finding in a client-facing report would leave text
   * standing that its own author has withdrawn.
   */
  async retractFromTask(taskId: string): Promise<void> {
    await prisma.reportEntry.deleteMany({ where: { taskId } });
  },

  /** Edit the reviewer's version, or sign it off. */
  async updateEntry(
    projectId: string,
    entryId: string,
    user: ScopeUser,
    input: {
      humanText?: string | null;
      nextSteps?: string | null;
      supplementalRequest?: string | null;
      severity?: string | null;
      status?: 'AI_DRAFT' | 'IN_REVIEW' | 'VERIFIED';
    }
  ): Promise<ReportEntryView> {
    const entry = await prisma.reportEntry.findFirst({ where: { id: entryId, projectId } });
    if (!entry) throw ApiError.notFound('Report entry not found');

    const scope = await resolveProjectScope(user, projectId);
    if (!scope.isFullAccess && !scope.allowedRiskCategoryIds.includes(entry.riskCategoryId)) {
      throw ApiError.forbidden('You do not have access to that risk category');
    }

    const data: Prisma.ReportEntryUpdateInput = {};
    if (input.humanText !== undefined) data.humanText = input.humanText;
    if (input.nextSteps !== undefined) data.nextSteps = input.nextSteps;
    if (input.supplementalRequest !== undefined) {
      data.supplementalRequest = input.supplementalRequest;
    }
    if (input.severity !== undefined) data.severity = input.severity;

    if (input.status) {
      data.status = input.status;
      // Signing off records who did it. Un-verifying clears that, so the report
      // never shows a name against text that is no longer signed.
      if (input.status === 'VERIFIED') {
        data.verifiedBy = { connect: { id: user.id } };
        data.verifiedAt = new Date();
      } else {
        data.verifiedBy = { disconnect: true };
        data.verifiedAt = null;
      }
    } else if (input.humanText !== undefined && entry.status === 'AI_DRAFT') {
      // Editing a draft means someone is working on it.
      data.status = 'IN_REVIEW';
    }

    const updated = await prisma.reportEntry.update({
      where: { id: entryId },
      data,
      include: {
        task: { select: { id: true, title: true } },
        verifiedBy: { select: { id: true, name: true, email: true } },
      },
    });
    return toEntryView(updated);
  },

  /** Add a finding by hand — not everything comes from a task. */
  async createEntry(
    projectId: string,
    user: ScopeUser,
    input: {
      riskCategoryId: string;
      title: string;
      humanText: string;
      nextSteps?: string | null;
      supplementalRequest?: string | null;
      severity?: string | null;
    }
  ): Promise<ReportEntryView> {
    if (!isRiskCategoryId(input.riskCategoryId)) {
      throw ApiError.badRequest(`Unknown risk category: ${input.riskCategoryId}`);
    }
    const scope = await resolveProjectScope(user, projectId);
    if (!scope.isFullAccess && !scope.allowedRiskCategoryIds.includes(input.riskCategoryId)) {
      throw ApiError.forbidden('You do not have access to that risk category');
    }
    const title = input.title.trim();
    if (!title) throw ApiError.badRequest('A finding needs a title');
    const body = input.humanText.trim();
    if (!body) throw ApiError.badRequest('A finding needs a write-up');

    const created = await prisma.reportEntry.create({
      data: {
        projectId,
        riskCategoryId: input.riskCategoryId,
        title,
        // Authored by a person, so there is no AI draft to preserve — the draft
        // column holds their text and the entry is verified on arrival.
        aiDraft: body,
        humanText: body,
        nextSteps: input.nextSteps ?? null,
        supplementalRequest: input.supplementalRequest ?? null,
        severity: input.severity ?? 'MEDIUM',
        status: 'VERIFIED',
        verifiedById: user.id,
        verifiedAt: new Date(),
      },
      include: {
        task: { select: { id: true, title: true } },
        verifiedBy: { select: { id: true, name: true, email: true } },
      },
    });
    return toEntryView(created);
  },

  async deleteEntry(projectId: string, entryId: string, user: ScopeUser): Promise<void> {
    const entry = await prisma.reportEntry.findFirst({ where: { id: entryId, projectId } });
    if (!entry) throw ApiError.notFound('Report entry not found');
    const scope = await resolveProjectScope(user, projectId);
    if (!scope.isFullAccess && !scope.allowedRiskCategoryIds.includes(entry.riskCategoryId)) {
      throw ApiError.forbidden('You do not have access to that risk category');
    }
    await prisma.reportEntry.delete({ where: { id: entryId } });
  },
};

type EntryRow = Prisma.ReportEntryGetPayload<{
  include: {
    task: { select: { id: true; title: true } };
    verifiedBy: { select: { id: true; name: true; email: true } };
  };
}>;

function toEntryView(e: EntryRow): ReportEntryView {
  return {
    id: e.id,
    title: e.title,
    aiDraft: e.aiDraft,
    humanText: e.humanText,
    nextSteps: e.nextSteps,
    supplementalRequest: e.supplementalRequest,
    severity: e.severity,
    status: e.status,
    taskId: e.taskId,
    taskTitle: e.task?.title ?? null,
    verifiedBy: e.verifiedBy
      ? { id: e.verifiedBy.id, name: e.verifiedBy.name, email: e.verifiedBy.email }
      : null,
    verifiedAt: e.verifiedAt?.toISOString() ?? null,
    updatedAt: e.updatedAt.toISOString(),
  };
}

export { getRiskCategory };
