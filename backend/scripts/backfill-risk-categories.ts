/**
 * Backfill after the workstream → risk-category migration.
 *
 * The migration remapped every evidence node onto one of the 26 risk categories
 * and dropped the 51 seeded question nodes (their EVIDENCES edges cascaded with
 * them). This re-seeds the category nodes, redraws those edges, and recomputes
 * coverage — all deterministically, from data already in the database. No
 * document is re-read and no model is called.
 *
 *   npx ts-node --transpile-only scripts/backfill-risk-categories.ts [--dry]
 */

import { randomUUID } from 'crypto';
import { prisma } from '../src/config/database';
import { RISK_CATEGORIES, getRiskCategory } from '../src/integrations/library/risk-categories';
import {
  computeCategoryStatus,
  highPriorityClauseTypesFor,
  libraryWriterService,
} from '../src/services/library-writer.service';
import { playbookService } from '../src/services/playbook.service';

const DRY = process.argv.includes('--dry');
const EVIDENCE_TYPES = ['PROVISION', 'RISK', 'OBLIGATION'] as const;

async function main() {
  const projects = await prisma.project.findMany({ select: { id: true, name: true } });
  console.log(`${projects.length} project(s)${DRY ? ' — DRY RUN' : ''}\n`);

  for (const project of projects) {
    const evidenceCount = await prisma.libraryNode.count({
      where: { projectId: project.id, type: { in: [...EVIDENCE_TYPES] } },
    });
    const existingCategories = await prisma.libraryNode.count({
      where: { projectId: project.id, type: 'RISK_CATEGORY' },
    });
    if (evidenceCount === 0 && existingCategories === 0) {
      console.log(`- ${project.name}: no library — skipped`);
      continue;
    }

    // 1. Re-seed the 26 category nodes (idempotent — slug is unique per project).
    const missing = RISK_CATEGORIES.filter((c) => c.id).map((cat) => ({
      id: randomUUID(),
      projectId: project.id,
      type: 'RISK_CATEGORY' as const,
      riskCategoryId: cat.id,
      slug: `cat-${cat.id}`,
      title: cat.title,
      status: 'OPEN' as const,
      s3Key: `projects/${project.id}/library/categories/${cat.id}/_index.md`,
    }));
    if (!DRY) {
      await prisma.libraryNode.createMany({ data: missing, skipDuplicates: true });
    }

    const categoryNodes = await prisma.libraryNode.findMany({
      where: { projectId: project.id, type: 'RISK_CATEGORY' },
      select: { id: true, riskCategoryId: true },
    });
    const nodeIdFor = new Map(categoryNodes.map((n) => [n.riskCategoryId, n.id]));

    // 2. Redraw EVIDENCES edges (they cascaded away with the old question nodes).
    const evidence = await prisma.libraryNode.findMany({
      where: { projectId: project.id, type: { in: [...EVIDENCE_TYPES] } },
      select: { id: true, riskCategoryId: true, riskLevel: true, confidence: true, clauseType: true },
    });
    const edges = evidence
      .map((e) => {
        const toNodeId = nodeIdFor.get(e.riskCategoryId);
        return toNodeId
          ? { id: randomUUID(), projectId: project.id, fromNodeId: e.id, toNodeId, edgeType: 'EVIDENCES' as const }
          : null;
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    if (!DRY && edges.length) {
      // Chunked: a 100-document deal is ~2k edges, a real VDR far more.
      for (let i = 0; i < edges.length; i += 1000) {
        await prisma.libraryEdge.createMany({ data: edges.slice(i, i + 1000), skipDuplicates: true });
      }
    }

    // 3. Recompute coverage from the evidence now sitting under each category.
    const playbook = await playbookService.get(project.id);
    const highPriority = highPriorityClauseTypesFor(playbook);
    const byCategory = new Map<string, typeof evidence>();
    for (const e of evidence) {
      const arr = byCategory.get(e.riskCategoryId) ?? [];
      arr.push(e);
      byCategory.set(e.riskCategoryId, arr);
    }

    const tally: Record<string, number> = {};
    for (const cat of RISK_CATEGORIES) {
      const ev = byCategory.get(cat.id) ?? [];
      const status = computeCategoryStatus(
        ev.map((e) => ({ riskLevel: e.riskLevel, confidence: e.confidence, clauseType: e.clauseType })),
        highPriority
      );
      tally[status] = (tally[status] ?? 0) + 1;
      if (!DRY) {
        await prisma.libraryNode.updateMany({
          where: { projectId: project.id, type: 'RISK_CATEGORY', riskCategoryId: cat.id },
          data: { status },
        });
      }
    }

    // 4. Rewrite the markdown spine so the durable artifact matches the database.
    if (!DRY) {
      await libraryWriterService
        .reconcileLibrary(project.id, project.name, { full: true })
        .catch((e) => console.warn(`  (markdown refresh failed: ${e instanceof Error ? e.message : e})`));
    }

    const orphans = evidence.filter((e) => !getRiskCategory(e.riskCategoryId)).length;
    console.log(
      `- ${project.name}: ${evidence.length} evidence → ${edges.length} edges, ` +
        `${Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(', ')}` +
        (orphans ? ` ⚠️ ${orphans} on unknown categories` : '')
    );
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
