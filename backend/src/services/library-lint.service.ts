/**
 * Library lint / gap-hunting (Phase 4).
 *
 * Reviews the deal's checklist coverage and surfaces prioritized findings — the
 * material gaps (OPEN items that matter), thin areas, flagged risks to escalate,
 * cross-document inconsistencies, and documents worth requesting. The heavy
 * lifting is a Sonnet pass over a compact coverage + registry summary; a
 * deterministic fallback runs when Claude isn't configured.
 *
 * Folder-scoped like the rest of the library: a restricted reviewer's lint
 * reflects only the documents they can see.
 */

import type { User, Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { config, isClaudeConfigured } from '../config';
import { s3Service } from './s3.service';
import { resolveProjectScope } from './scope.service';
import { playbookService } from './playbook.service';
import { computeCategoryStatus, highPriorityClauseTypesFor } from './library-writer.service';
import { RISK_CATEGORIES, getRiskCategory } from '../integrations/library/risk-categories';
import { analyzeLibraryGaps, type LintResponse } from '../integrations/claude';

type ScopeUser = Pick<User, 'id' | 'platformRole' | 'companyId'>;
type Finding = LintResponse['findings'][number];

export interface LintResult {
  findings: Finding[];
  generatedAt: string;
  source: 'llm' | 'deterministic';
}

const lintKey = (projectId: string) => `projects/${projectId}/library/lint.md`;
const nowIso = () => new Date().toISOString();

const SEVERITY_RANK: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export const libraryLintService = {
  isEnabled(): boolean {
    return config.library.enabled === true;
  },

  async run(projectId: string, user: ScopeUser): Promise<LintResult> {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });
    const dealName = project?.name ?? 'Deal';

    // --- scope: in-scope documents ---
    const scope = await resolveProjectScope(user, projectId);
    const docWhere: Prisma.DocumentWhereInput = { projectId, processingStatus: 'COMPLETE' };
    if (!scope.isFullAccess) docWhere.folderId = { in: scope.allowedFolderIds };
    const docs = await prisma.document.findMany({
      where: docWhere,
      select: { id: true, name: true, documentType: true, riskScore: true },
    });
    const allowedDocIds = scope.isFullAccess ? null : new Set(docs.map((d) => d.id));
    const inScope = (docId: string | null): boolean =>
      allowedDocIds === null || (docId != null && allowedDocIds.has(docId));

    // --- coverage per risk category (scoped) ---
    const [categories, provisions] = await Promise.all([
      prisma.libraryNode.findMany({
        where: { projectId, type: 'RISK_CATEGORY' },
        select: { riskCategoryId: true, title: true },
      }),
      prisma.libraryNode.findMany({
        where: { projectId, type: { in: ['PROVISION', 'RISK', 'OBLIGATION'] } },
        select: { riskCategoryId: true, sourceDocumentId: true, riskLevel: true, confidence: true, clauseType: true },
      }),
    ]);

    if (categories.length === 0) {
      return { findings: [], generatedAt: nowIso(), source: 'deterministic' };
    }

    const playbook = await playbookService.get(projectId);
    const highPriority = highPriorityClauseTypesFor(playbook);

    const evidenceByCategory = new Map<string, typeof provisions>();
    for (const p of provisions) {
      if (!inScope(p.sourceDocumentId)) continue;
      const arr = evidenceByCategory.get(p.riskCategoryId) ?? [];
      arr.push(p);
      evidenceByCategory.set(p.riskCategoryId, arr);
    }
    const statusOf = (categoryId: string): string =>
      computeCategoryStatus(
        (evidenceByCategory.get(categoryId) ?? []).map((e) => ({
          riskLevel: e.riskLevel,
          confidence: e.confidence,
          clauseType: e.clauseType,
        })),
        highPriority
      );

    const titleByCategory = new Map(categories.map((c) => [c.riskCategoryId, c.title]));

    // --- coverage markdown (one line per risk category) ---
    const coverageMarkdown = RISK_CATEGORIES.map((cat) => {
      const count = evidenceByCategory.get(cat.id)?.length ?? 0;
      const factFed = cat.factFed ? ' (fact-fed — no clause type files here)' : '';
      return `- ${cat.id} — ${cat.reportTitle} [${statusOf(cat.id)}] (${count} evidence)${factFed}`;
    }).join('\n');

    const registryMarkdown = docs.length
      ? docs.map((d) => `- ${d.name} (${d.documentType ?? 'unknown'})${d.riskScore != null ? ` — risk ${d.riskScore}/10` : ''}`).join('\n')
      : '(no documents in scope)';

    const companyMarkdown = await playbookService.getCompanyMarkdown(projectId);
    const playbookContext = [
      companyMarkdown ? `## Firm house playbook\n${companyMarkdown}` : '',
      playbook?.dealContext ?? '',
      playbook?.redFlags.length ? `Red flags: ${playbook.redFlags.join('; ')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    // --- findings: LLM when possible, else deterministic ---
    let findings: Finding[];
    let source: 'llm' | 'deterministic';
    if (isClaudeConfigured()) {
      try {
        const res = await analyzeLibraryGaps({ dealName, playbookContext, coverageMarkdown, registryMarkdown });
        findings = res.findings;
        source = 'llm';
      } catch (err) {
        console.warn('[lint] LLM pass failed, using deterministic:', err instanceof Error ? err.message : err);
        findings = this.deterministic(categories, statusOf, evidenceByCategory);
        source = 'deterministic';
      }
    } else {
      findings = this.deterministic(categories, statusOf, evidenceByCategory);
      source = 'deterministic';
    }

    // Validate riskCategoryId references + sort by severity.
    const validCategories = new Set(categories.map((c) => c.riskCategoryId));
    findings = findings
      .map((f) => ({
        ...f,
        riskCategoryId:
          f.riskCategoryId && validCategories.has(f.riskCategoryId) ? f.riskCategoryId : null,
      }))
      .sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));

    const generatedAt = nowIso();
    await this.persist(projectId, dealName, findings, generatedAt, titleByCategory);

    return { findings, generatedAt, source };
  },

  /** Deterministic fallback: flagged → RISK, thin → THIN, + an open-gap summary. */
  deterministic(
    categories: { riskCategoryId: string; title: string }[],
    statusOf: (categoryId: string) => string,
    evidenceByCategory: Map<string, unknown[]>
  ): Finding[] {
    const findings: Finding[] = [];
    const open: string[] = [];
    for (const cat of categories) {
      const st = statusOf(cat.riskCategoryId);
      const count = evidenceByCategory.get(cat.riskCategoryId)?.length ?? 0;
      if (st === 'FLAGGED') {
        findings.push({ type: 'RISK', severity: 'HIGH', riskCategoryId: cat.riskCategoryId, title: `Escalate: ${cat.title}`, detail: `Flagged coverage with ${count} piece(s) of evidence.`, suggestedAction: 'Have a specialist review this category.' });
      } else if (st === 'THIN') {
        findings.push({ type: 'THIN', severity: 'MEDIUM', riskCategoryId: cat.riskCategoryId, title: `Thin: ${cat.title}`, detail: 'Only low-confidence evidence found.', suggestedAction: 'Request clearer documentation.' });
      } else if (st === 'OPEN') {
        open.push(cat.title);
      }
    }
    if (open.length) {
      // An open category is a supplemental diligence request in the issues
      // report, so name them rather than only counting them.
      findings.push({ type: 'GAP', severity: open.length > 12 ? 'HIGH' : 'MEDIUM', riskCategoryId: null, title: `${open.length} risk categories with no evidence`, detail: `Nothing in the data room speaks to: ${open.slice(0, 12).join(', ')}${open.length > 12 ? '…' : ''}.`, suggestedAction: 'Request documents covering these categories.' });
    }
    return findings;
  },

  async getLatest(projectId: string): Promise<string | null> {
    try {
      return await s3Service.getObjectText(lintKey(projectId));
    } catch {
      return null;
    }
  },

  async persist(
    projectId: string,
    dealName: string,
    findings: Finding[],
    generatedAt: string,
    titleByCategory: Map<string, string>
  ): Promise<void> {
    const md = [
      `# Lint report — ${dealName}`,
      `_Generated ${generatedAt} · ${findings.length} finding(s)_`,
      '',
      ...findings.map((f) => {
        const cat = f.riskCategoryId ? ` (${titleByCategory.get(f.riskCategoryId) ?? f.riskCategoryId})` : '';
        const action = f.suggestedAction ? `\n  - **Action:** ${f.suggestedAction}` : '';
        return `- **[${f.type} · ${f.severity}]** ${f.title}${cat}\n  - ${f.detail}${action}`;
      }),
      '',
    ].join('\n');
    await s3Service.putObjectText(lintKey(projectId), md);

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { libraryManifest: true } });
    const current =
      project?.libraryManifest && typeof project.libraryManifest === 'object'
        ? (project.libraryManifest as Record<string, unknown>)
        : {};
    await prisma.project.update({
      where: { id: projectId },
      data: {
        libraryManifest: {
          ...current,
          lint: { s3Key: lintKey(projectId), updatedAt: generatedAt, count: findings.length },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  },
};
