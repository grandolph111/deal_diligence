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
import { computeItemStatus, highPriorityClauseTypesFor } from './library-writer.service';
import {
  WORKSTREAMS,
  itemsForWorkstream,
  getItem,
} from '../integrations/library/checklist';
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

    // --- coverage per checklist item (scoped) ---
    const [items, provisions] = await Promise.all([
      prisma.libraryNode.findMany({
        where: { projectId, type: 'CHECKLIST_ITEM' },
        select: { itemId: true, workstreamId: true, title: true },
      }),
      prisma.libraryNode.findMany({
        where: { projectId, type: { in: ['PROVISION', 'RISK', 'OBLIGATION'] } },
        select: { itemId: true, sourceDocumentId: true, riskLevel: true, confidence: true, clauseType: true },
      }),
    ]);

    if (items.length === 0) {
      return { findings: [], generatedAt: nowIso(), source: 'deterministic' };
    }

    const playbook = await playbookService.get(projectId);
    const highPriority = highPriorityClauseTypesFor(playbook);

    const evidenceByItem = new Map<string, typeof provisions>();
    for (const p of provisions) {
      if (!inScope(p.sourceDocumentId)) continue;
      const arr = evidenceByItem.get(p.itemId) ?? [];
      arr.push(p);
      evidenceByItem.set(p.itemId, arr);
    }
    const statusOf = (itemId: string): string =>
      computeItemStatus(
        (evidenceByItem.get(itemId) ?? []).map((e) => ({
          riskLevel: e.riskLevel,
          confidence: e.confidence,
          clauseType: e.clauseType,
        })),
        highPriority
      );

    const titleByItem = new Map(items.map((i) => [i.itemId, i.title]));

    // --- coverage markdown (workstream → items) ---
    const covLines: string[] = [];
    for (const ws of WORKSTREAMS) {
      if (ws.id === '99-to-triage') continue;
      covLines.push(`### ${ws.title}`);
      for (const item of itemsForWorkstream(ws.id)) {
        const count = evidenceByItem.get(item.id)?.length ?? 0;
        covLines.push(`- ${item.id} — ${item.title} [${statusOf(item.id)}] (${count} evidence)`);
      }
    }
    const coverageMarkdown = covLines.join('\n');

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
        findings = this.deterministic(items, statusOf, evidenceByItem);
        source = 'deterministic';
      }
    } else {
      findings = this.deterministic(items, statusOf, evidenceByItem);
      source = 'deterministic';
    }

    // Validate itemId references + sort by severity.
    const validItems = new Set(items.map((i) => i.itemId));
    findings = findings
      .map((f) => ({ ...f, itemId: f.itemId && validItems.has(f.itemId) ? f.itemId : null }))
      .sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));

    const generatedAt = nowIso();
    await this.persist(projectId, dealName, findings, generatedAt, titleByItem);

    return { findings, generatedAt, source };
  },

  /** Deterministic fallback: flagged → RISK, thin → THIN, + an open-gap summary. */
  deterministic(
    items: { itemId: string; title: string }[],
    statusOf: (itemId: string) => string,
    evidenceByItem: Map<string, unknown[]>
  ): Finding[] {
    const findings: Finding[] = [];
    const open: string[] = [];
    for (const item of items) {
      const st = statusOf(item.itemId);
      const count = evidenceByItem.get(item.itemId)?.length ?? 0;
      if (st === 'FLAGGED') {
        findings.push({ type: 'RISK', severity: 'HIGH', itemId: item.itemId, title: `Escalate: ${item.title}`, detail: `Flagged coverage with ${count} piece(s) of evidence.`, suggestedAction: 'Have a specialist review this item.' });
      } else if (st === 'THIN') {
        findings.push({ type: 'THIN', severity: 'MEDIUM', itemId: item.itemId, title: `Thin: ${item.title}`, detail: `Only low-confidence evidence found.`, suggestedAction: 'Request clearer documentation.' });
      } else if (st === 'OPEN') {
        open.push(item.title);
      }
    }
    if (open.length) {
      findings.push({ type: 'GAP', severity: open.length > 20 ? 'HIGH' : 'MEDIUM', itemId: null, title: `${open.length} open diligence questions`, detail: `No evidence yet for: ${open.slice(0, 12).join(', ')}${open.length > 12 ? '…' : ''}.`, suggestedAction: 'Upload documents covering these areas.' });
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
    titleByItem: Map<string, string>
  ): Promise<void> {
    const md = [
      `# Lint report — ${dealName}`,
      `_Generated ${generatedAt} · ${findings.length} finding(s)_`,
      '',
      ...findings.map((f) => {
        const item = f.itemId ? ` (${titleByItem.get(f.itemId) ?? f.itemId})` : '';
        const action = f.suggestedAction ? `\n  - **Action:** ${f.suggestedAction}` : '';
        return `- **[${f.type} · ${f.severity}]** ${f.title}${item}\n  - ${f.detail}${action}`;
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
