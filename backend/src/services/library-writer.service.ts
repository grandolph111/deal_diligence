/**
 * Library writer — Phase 1.
 *
 * Two entry points:
 *   seedProjectLibrary(projectId, name)  → pre-seeds the risk-category spine:
 *       one RISK_CATEGORY node per canonical category (status OPEN) + the static
 *       CLAUDE.md / categories.md / index.md / log.md and per-category
 *       `_index.md` files. Called on project create so every category is visible
 *       as an open gap before any document exists.
 *   fileDocument({...})                  → Stage 7 of ingestion: decomposes an
 *       extraction into evidence nodes (PROVISION + SOURCE + light ENTITY),
 *       files each under the risk category its clause type belongs to, links
 *       them, flips touched categories OPEN→COVERED/FLAGGED, and refreshes the
 *       affected index files + log.
 *
 * Markdown files in S3 are the durable artifact; LibraryNode/LibraryEdge rows
 * mirror them for fast queries. Everything here is best-effort at the call site
 * (wrapped by the caller) so it can never fail extraction or project creation.
 */

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { config } from '../config';
import { s3Service } from './s3.service';
import type { ExtractionResponse } from '../integrations/claude';
import { embedTexts, embeddingModelId, isEmbeddingsConfigured } from '../integrations/embeddings';
import {
  RISK_CATEGORIES,
  categoryForClauseType,
  getRiskCategory,
  type RiskCategory,
} from '../integrations/library/risk-categories';
import { LIBRARY_CLAUDE_MD, renderCategoriesMarkdown } from '../integrations/library/templates';
import type { CoverageStatus } from '../integrations/library/types';
import { playbookService } from './playbook.service';
import type { Playbook } from '../integrations/claude';

/* ---------- S3 path helpers ---------- */

const base = (projectId: string) => `projects/${projectId}/library`;
const keys = {
  claudeMd: (p: string) => `${base(p)}/CLAUDE.md`,
  categoriesMd: (p: string) => `${base(p)}/categories.md`,
  indexMd: (p: string) => `${base(p)}/index.md`,
  logMd: (p: string) => `${base(p)}/log.md`,
  categoryIndex: (p: string, catId: string) => `${base(p)}/categories/${catId}/_index.md`,
  provision: (p: string, catId: string, slug: string) =>
    `${base(p)}/categories/${catId}/${slug}.md`,
  source: (p: string, slug: string) => `${base(p)}/sources/${slug}.md`,
  entity: (p: string, folder: string, slug: string) =>
    `${base(p)}/entities/${folder}/${slug}.md`,
};

/* ---------- misc helpers ---------- */

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'x';

// Normalize an organization name for dedup: strip common legal suffixes and
// articles so "Acme Corporation" and "Acme Corp." collapse to one entity node.
// (Mirrors master-entities.service normalizeEntityText.)
const normalizeOrgName = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\s*(inc\.?|llc\.?|ltd\.?|corp\.?|plc\.?|co\.?|limited|incorporated|corporation)\.?\s*$/i, '')
    .replace(/^(the|a|an)\s+/i, '')
    .replace(/[,'"()]/g, '')
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\s+/g, ' ')
    .trim();

// Entities and sources are cross-cutting — they belong to no single risk
// category. Use an explicit sentinel rather than a misleading real id.
const CROSS_CUTTING = '_cross-cutting';

const ENTITY_FOLDER: Record<string, string> = {
  ORGANIZATION: 'organizations',
  PERSON: 'people',
  JURISDICTION: 'jurisdictions',
};

// Claude emits synonyms (COMPANY vs ORGANIZATION, JURIS vs JURISDICTION). The
// extraction service normalizes these at persist time, but fileDocument sees the
// raw extraction — so apply the same canonicalization here or companies (typed
// COMPANY) would be dropped. Keep in sync with extraction.service ENTITY_TYPE_ALIASES.
const ENTITY_TYPE_ALIASES: Record<string, string> = {
  COMPANY: 'ORGANIZATION',
  CORPORATION: 'ORGANIZATION',
  ORG: 'ORGANIZATION',
  JURIS: 'JURISDICTION',
};

const normalizeEntityType = (raw: string): string => {
  const upper = (raw || '').toUpperCase();
  return ENTITY_TYPE_ALIASES[upper] ?? upper;
};

// Which extracted entity types earn a graph node in Phase 1. Money/dates/
// percentages are extraction detail, not library nodes — reconciliation (Phase
// 2) owns cross-doc entity dedup; this is the light, single-doc version.
const ENTITY_TYPES_AS_NODES = new Set(Object.keys(ENTITY_FOLDER));

const nowIso = () => new Date().toISOString();

/** Provision shape used by the authoritative status computation. */
interface EvidenceForStatus {
  riskLevel: string | null;
  confidence: number | null; // 0-100
  clauseType: string | null;
}

const THIN_CONFIDENCE = 75;

/**
 * Authoritative, playbook-aware coverage status for a checklist item.
 * Provision riskLevel is already playbook-conditioned upstream (extraction scores
 * risk as deviation from the playbook), so HIGH → FLAGGED captures deviations.
 * The playbook additionally escalates MEDIUM→FLAGGED for clause types the firm
 * marks riskIfDeviates=HIGH. THIN = has evidence but all of it is low-confidence.
 */
export const computeCategoryStatus = (
  evidence: EvidenceForStatus[],
  highPriorityClauseTypes: Set<string>
): CoverageStatus => {
  if (evidence.length === 0) return 'OPEN';
  const flagged = evidence.some(
    (e) =>
      e.riskLevel === 'HIGH' ||
      (e.riskLevel === 'MEDIUM' &&
        e.clauseType != null &&
        highPriorityClauseTypes.has(e.clauseType.toUpperCase()))
  );
  if (flagged) return 'FLAGGED';
  const allLowConfidence = evidence.every((e) => (e.confidence ?? 100) < THIN_CONFIDENCE);
  if (allLowConfidence) return 'THIN';
  return 'COVERED';
};

/** Clause types the playbook marks as high-stakes (riskIfDeviates = HIGH). */
export const highPriorityClauseTypesFor = (playbook: Playbook | null): Set<string> => {
  const set = new Set<string>();
  if (!playbook) return set;
  for (const p of playbook.standardPositions) {
    if (p.riskIfDeviates === 'HIGH') set.add(p.clauseType.toUpperCase());
  }
  return set;
};

const STATUS_LABEL: Record<CoverageStatus, string> = {
  OPEN: '🔲 OPEN — no evidence found',
  COVERED: '✅ COVERED',
  FLAGGED: '🚩 FLAGGED',
  THIN: '◻️ THIN — likely incomplete',
  NA: '➖ N/A',
};

/* ---------- markdown renderers ---------- */

const renderCategoryIndex = (
  category: RiskCategory,
  status: CoverageStatus,
  evidence: { title: string; slug: string; page: number | null; risk: string | null }[]
): string => {
  const lines = [
    '---',
    `risk_category: ${category.id}`,
    `report_topic: ${category.reportTitle}`,
    `status: ${status}`,
    `evidence_count: ${evidence.length}`,
    `updated: ${nowIso()}`,
    '---',
    '',
    `# ${category.title}`,
    '',
    `**Issues report topic:** ${category.reportTitle}`,
    `**Status:** ${STATUS_LABEL[status]}`,
    '',
    `> ${category.description}`,
    '',
    '## Evidence',
    '',
  ];
  if (evidence.length === 0) {
    lines.push(
      category.factFed
        ? '_No evidence yet. Nothing in the data room speaks to this category — it belongs in the supplemental diligence requests._'
        : '_No evidence yet. This category is an open gap._'
    );
  } else {
    for (const e of evidence) {
      const pg = e.page != null ? ` (p.${e.page})` : '';
      const rk = e.risk ? ` — risk: ${e.risk}` : '';
      lines.push(`- [${e.title}](./${e.slug}.md)${pg}${rk}`);
    }
  }
  lines.push('');
  return lines.join('\n');
};

const renderMasterIndex = (
  projectName: string,
  statuses: Map<string, CoverageStatus>
): string => {
  const lines = [
    '---',
    `project: ${projectName}`,
    `updated: ${nowIso()}`,
    '---',
    '',
    `# ${projectName} — Deal Library`,
    '',
    'Risk categories from the due-diligence issues report. Each carries a coverage',
    'status; a category with no evidence is an open gap. See',
    '[categories.md](./categories.md) and [CLAUDE.md](./CLAUDE.md).',
    '',
    '| # | Risk category | Status |',
    '| --- | --- | --- |',
  ];
  for (const cat of RISK_CATEGORIES) {
    const st = statuses.get(cat.id) ?? 'OPEN';
    const mark = st === 'OPEN' ? '🔲' : st === 'FLAGGED' ? '🚩' : st === 'THIN' ? '◻️' : '✅';
    lines.push(
      `| ${cat.order} | ${mark} [${cat.title}](./categories/${cat.id}/_index.md) | ${st} |`
    );
  }
  lines.push('');
  return lines.join('\n');
};

const renderProvisionNode = (args: {
  id: string;
  category: RiskCategory;
  clauseType: string;
  title: string;
  summary: string;
  quote: string;
  page: number | null;
  risk: string | null;
  confidence: number | null;
  sourceSlug: string;
  sourceName: string;
  entityLinks: { name: string; folder: string; slug: string }[];
}): string => {
  const links = [
    `sources/${args.sourceSlug}`,
    ...args.entityLinks.map((e) => `entities/${e.folder}/${e.slug}`),
  ];
  return [
    '---',
    `id: ${args.id}`,
    'type: provision',
    `risk_category: ${args.category.id}`,
    `clause_type: ${args.clauseType}`,
    `source_doc: ${args.sourceSlug}`,
    `page: ${args.page ?? 'null'}`,
    `risk_level: ${args.risk ?? 'null'}`,
    `confidence: ${args.confidence ?? 'null'}`,
    `links: [${links.join(', ')}]`,
    `first_seen: ${nowIso()}`,
    '---',
    '',
    `# ${args.title}`,
    '',
    `**Risk category:** ${args.category.title}`,
    `**Source:** [${args.sourceName}](../../sources/${args.sourceSlug}.md)${args.page != null ? ` (p.${args.page})` : ''}`,
    '',
    `**Summary:** ${args.summary || '_none_'}`,
    '',
    args.quote ? `**Quote (p.${args.page ?? '?'}):**\n> ${args.quote.replace(/\n/g, ' ')}` : '',
    '',
    args.entityLinks.length
      ? `**Mentions:** ${args.entityLinks.map((e) => `[${e.name}](../../entities/${e.folder}/${e.slug}.md)`).join(', ')}`
      : '',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n');
};

const renderSourceNode = (args: {
  slug: string;
  name: string;
  documentType: string | null;
  riskScore: number | null;
  provisionCount: number;
  factSheet: string;
}): string =>
  [
    '---',
    'type: source',
    `document: ${args.name}`,
    `document_type: ${args.documentType ?? 'null'}`,
    `risk_score: ${args.riskScore ?? 'null'}`,
    `provision_count: ${args.provisionCount}`,
    `ingested: ${nowIso()}`,
    '---',
    '',
    `# Source — ${args.name}`,
    '',
    `Provenance hub for this document. ${args.provisionCount} provision node(s) reference it.`,
    '',
    '## Fact sheet',
    '',
    args.factSheet,
    '',
  ].join('\n');

const renderEntityNode = (name: string, type: string): string =>
  ['---', 'type: entity', `entity_type: ${type}`, `updated: ${nowIso()}`, '---', '', `# ${name}`, '', `Canonical ${type.toLowerCase()} referenced in this deal.`, ''].join('\n');

/* ---------- manifest ---------- */

const updateManifest = async (projectId: string, patch: Record<string, unknown>) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { libraryManifest: true },
  });
  const current =
    project?.libraryManifest && typeof project.libraryManifest === 'object'
      ? (project.libraryManifest as Record<string, unknown>)
      : {};
  await prisma.project.update({
    where: { id: projectId },
    data: {
      libraryManifest: { ...current, ...patch } as unknown as Prisma.InputJsonValue,
    },
  });
};

const appendLog = async (projectId: string, line: string) => {
  const key = keys.logMd(projectId);
  let existing = '';
  try {
    existing = await s3Service.getObjectText(key);
  } catch {
    existing = `# Ingestion log\n\n`;
  }
  await s3Service.putObjectText(key, `${existing}- ${nowIso()} — ${line}\n`);
};

/* ---------- service ---------- */

export const libraryWriterService = {
  isEnabled(): boolean {
    return config.library.enabled === true;
  },

  async isSeeded(projectId: string): Promise<boolean> {
    const count = await prisma.libraryNode.count({
      where: { projectId, type: 'RISK_CATEGORY' },
    });
    return count > 0;
  },

  /** Pre-seed the 26 risk categories (all OPEN) + static + index files. Idempotent. */
  async seedProjectLibrary(projectId: string, projectName: string): Promise<void> {
    if (await this.isSeeded(projectId)) return;

    // 1. RISK_CATEGORY nodes (one insert).
    await prisma.libraryNode.createMany({
      data: RISK_CATEGORIES.map((cat) => ({
        id: randomUUID(),
        projectId,
        type: 'RISK_CATEGORY' as const,
        riskCategoryId: cat.id,
        slug: `cat-${cat.id}`,
        title: cat.title,
        status: 'OPEN' as const,
        s3Key: keys.categoryIndex(projectId, cat.id),
      })),
      skipDuplicates: true,
    });

    // 2. Markdown spine (all OPEN).
    const statuses = new Map<string, CoverageStatus>();
    const writes: Promise<void>[] = [
      s3Service.putObjectText(keys.claudeMd(projectId), LIBRARY_CLAUDE_MD),
      s3Service.putObjectText(keys.categoriesMd(projectId), renderCategoriesMarkdown()),
      s3Service.putObjectText(keys.logMd(projectId), `# Ingestion log\n\n- ${nowIso()} — library seeded (${RISK_CATEGORIES.length} risk categories)\n`),
      s3Service.putObjectText(keys.indexMd(projectId), renderMasterIndex(projectName, statuses)),
    ];
    for (const cat of RISK_CATEGORIES) {
      writes.push(s3Service.putObjectText(keys.categoryIndex(projectId, cat.id), renderCategoryIndex(cat, 'OPEN', [])));
    }
    await Promise.all(writes);

    await updateManifest(projectId, {
      index: { s3Key: keys.indexMd(projectId), updatedAt: nowIso() },
      seededAt: nowIso(),
    });

    // eslint-disable-next-line no-console
    console.log(`[library] seeded ${RISK_CATEGORIES.length} risk categories for project ${projectId}`);
  },

  /** Stage 7: file one document's extraction into the library. */
  async fileDocument(args: {
    projectId: string;
    projectName: string;
    documentId: string;
    documentName: string;
    extraction: ExtractionResponse;
  }): Promise<void> {
    const { projectId, documentId, documentName, extraction } = args;

    await this.seedProjectLibrary(projectId, args.projectName); // ensure ToC exists

    // Idempotency: drop this document's prior evidence/source nodes (edges cascade).
    await prisma.libraryNode.deleteMany({
      where: {
        projectId,
        sourceDocumentId: documentId,
        type: { in: ['PROVISION', 'RISK', 'OBLIGATION', 'SOURCE'] },
      },
    });

    const sourceSlug = `${slugify(documentName)}-${documentId.slice(0, 8)}`;
    const sourceId = randomUUID();

    // --- Entities (light, single-doc) ---
    const entityLinks = new Map<string, { name: string; folder: string; slug: string; id: string }>();
    for (const e of extraction.entities ?? []) {
      const type = normalizeEntityType(e.type);
      if (!ENTITY_TYPES_AS_NODES.has(type) || !e.text) continue;
      const folder = ENTITY_FOLDER[type];
      // Dedup organizations by normalized (suffix-stripped) name; keep people /
      // jurisdictions as-is.
      const nameKey = type === 'ORGANIZATION' ? normalizeOrgName(e.text) : e.text;
      const slug = `ent-${slugify(type)}-${slugify(nameKey)}`;
      if (entityLinks.has(slug)) continue;
      const item: { name: string; folder: string; slug: string; id: string } = {
        name: e.text,
        folder,
        slug,
        id: randomUUID(),
      };
      entityLinks.set(slug, item);
      // Upsert (not findUnique-then-create): concurrent extractions in the same
      // project both mentioning an entity would otherwise race to create the same
      // slug and hit the unique constraint (P2002), silently losing a doc's filing.
      const upserted = await prisma.libraryNode.upsert({
        where: { projectId_slug: { projectId, slug } },
        create: {
          id: item.id,
          projectId,
          type: 'ENTITY',
          riskCategoryId: CROSS_CUTTING,
          slug,
          title: e.text,
          s3Key: keys.entity(projectId, folder, slug),
        },
        update: {}, // exists already — keep it
        select: { id: true },
      });
      item.id = upserted.id;
      await s3Service.putObjectText(keys.entity(projectId, folder, slug), renderEntityNode(e.text, type));
    }

    // --- Provision nodes (one per extracted clause) ---
    const nodeRows: Prisma.LibraryNodeCreateManyInput[] = [];
    const embedInputs: Array<{ nodeId: string; text: string }> = [];
    const edgeRows: Prisma.LibraryEdgeCreateManyInput[] = [];
    const provisionWrites: Promise<void>[] = [];
    const touchedCategories = new Set<string>();

    (extraction.clauses ?? []).forEach((clause, i) => {
      const category = categoryForClauseType(clause.clauseType);
      touchedCategories.add(category.id);
      const provId = randomUUID();
      const slug = `prov-${documentId.slice(0, 8)}-${i}-${slugify(clause.clauseType)}`;
      const title = clause.title || `${clause.clauseType} — ${documentName}`;
      const risk = clause.riskLevel ?? null;
      const conf = clause.confidence != null ? Math.round(clause.confidence * 100) : null;

      nodeRows.push({
        id: provId,
        projectId,
        type: 'PROVISION',
        riskCategoryId: category.id,
        slug,
        title,
        s3Key: keys.provision(projectId, category.id, slug),
        clauseType: clause.clauseType.toUpperCase(),
        riskLevel: risk,
        confidence: conf,
        pageNumber: clause.pageNumber ?? null,
        sourceDocumentId: documentId,
        content: (clause.content || '').slice(0, 600), // for query-time Haiku reranking
      });

      // text for semantic embedding (Phase B) — clause type + title + quote
      embedInputs.push({
        nodeId: provId,
        text: `${clause.clauseType} ${title} ${clause.content || ''}`.slice(0, 2000),
      });

      // provision → category, provision → source, provision → entities
      edgeRows.push({ id: randomUUID(), projectId, fromNodeId: provId, toNodeId: `cat::${category.id}`, edgeType: 'EVIDENCES' });
      edgeRows.push({ id: randomUUID(), projectId, fromNodeId: provId, toNodeId: sourceId, edgeType: 'SOURCED_FROM' });
      for (const ent of entityLinks.values()) {
        edgeRows.push({ id: randomUUID(), projectId, fromNodeId: provId, toNodeId: ent.id, edgeType: 'MENTIONS' });
      }

      provisionWrites.push(
        s3Service.putObjectText(
          keys.provision(projectId, category.id, slug),
          renderProvisionNode({
            id: provId,
            category,
            clauseType: clause.clauseType.toUpperCase(),
            title,
            summary: (clause.content || '').slice(0, 280),
            quote: clause.content || '',
            page: clause.pageNumber ?? null,
            risk,
            confidence: conf,
            sourceSlug,
            sourceName: documentName,
            entityLinks: [...entityLinks.values()],
          })
        )
      );
    });

    // --- Source node ---
    nodeRows.push({
      id: sourceId,
      projectId,
      type: 'SOURCE',
      riskCategoryId: CROSS_CUTTING,
      slug: `src-${sourceSlug}`,
      title: documentName,
      s3Key: keys.source(projectId, sourceSlug),
      sourceDocumentId: documentId,
      riskLevel: extraction.riskLevel ?? null,
    });

    // Resolve `cat::<id>` placeholders to the real RISK_CATEGORY node ids.
    const categoryNodes = await prisma.libraryNode.findMany({
      where: { projectId, type: 'RISK_CATEGORY', riskCategoryId: { in: [...touchedCategories] } },
      select: { id: true, riskCategoryId: true },
    });
    const categoryNodeId = new Map(categoryNodes.map((n) => [n.riskCategoryId, n.id]));
    const resolvedEdges = edgeRows
      .map((e) =>
        typeof e.toNodeId === 'string' && e.toNodeId.startsWith('cat::')
          ? { ...e, toNodeId: categoryNodeId.get(e.toNodeId.slice(5)) }
          : e
      )
      .filter((e): e is Prisma.LibraryEdgeCreateManyInput => Boolean(e.toNodeId));

    // Persist nodes + edges.
    await prisma.libraryNode.createMany({ data: nodeRows, skipDuplicates: true });

    // Provision embeddings are DORMANT by default — retrieval ranks via a Haiku
    // reranker over the provision text (no embeddings vendor needed). Only embed
    // when a real provider is configured (for a future hybrid recall path).
    if (embedInputs.length > 0 && isEmbeddingsConfigured()) {
      try {
        const vectors = await embedTexts(embedInputs.map((e) => e.text));
        if (vectors.length === embedInputs.length) {
          await prisma.provisionEmbedding.createMany({
            data: embedInputs.map((e, i) => ({
              id: randomUUID(),
              projectId,
              nodeId: e.nodeId,
              model: embeddingModelId(),
              vector: vectors[i] as unknown as Prisma.InputJsonValue,
            })),
            skipDuplicates: true,
          });
        }
      } catch (err) {
        console.warn('[library] provision embedding failed:', err instanceof Error ? err.message : err);
      }
    }
    if (resolvedEdges.length) {
      await prisma.libraryEdge.createMany({ data: resolvedEdges, skipDuplicates: true });
    }

    // Source markdown.
    provisionWrites.push(
      s3Service.putObjectText(
        keys.source(projectId, sourceSlug),
        renderSourceNode({
          slug: sourceSlug,
          name: documentName,
          documentType: extraction.documentType ?? null,
          riskScore: extraction.riskScore ?? null,
          provisionCount: extraction.clauses?.length ?? 0,
          factSheet: extraction.factSheet,
        })
      )
    );
    await Promise.all(provisionWrites);

    // --- Recompute status + refresh touched category indexes ---
    const statuses = await this.refreshCategoryIndexes(projectId, [...touchedCategories]);

    // --- Refresh the master index ---
    const allStatuses = await this.loadAllCategoryStatuses(projectId);
    for (const [k, v] of statuses) allStatuses.set(k, v);
    await s3Service.putObjectText(keys.indexMd(projectId), renderMasterIndex(args.projectName, allStatuses));
    await updateManifest(projectId, { index: { s3Key: keys.indexMd(projectId), updatedAt: nowIso() } });
    await appendLog(projectId, `ingested "${documentName}" — ${extraction.clauses?.length ?? 0} provisions across ${touchedCategories.size} risk categories`);

    // eslint-disable-next-line no-console
    console.log(`[library] filed "${documentName}" → ${extraction.clauses?.length ?? 0} provisions, ${touchedCategories.size} categories touched`);
  },

  /** Recompute + rewrite `_index.md` for the given categories from their evidence. */
  async refreshCategoryIndexes(
    projectId: string,
    categoryIds: string[]
  ): Promise<Map<string, CoverageStatus>> {
    // Same authoritative, playbook-aware status as reconcileLibrary — one source
    // of truth, so the file-time (provisional) status matches the reconciled one.
    const playbook = await playbookService.get(projectId);
    const highPriority = highPriorityClauseTypesFor(playbook);
    const result = new Map<string, CoverageStatus>();
    for (const categoryId of categoryIds) {
      const category = getRiskCategory(categoryId);
      if (!category) continue;
      const evidence = await prisma.libraryNode.findMany({
        where: { projectId, riskCategoryId: categoryId, type: { in: ['PROVISION', 'RISK', 'OBLIGATION'] } },
        select: { title: true, slug: true, pageNumber: true, riskLevel: true, confidence: true, clauseType: true },
        orderBy: { createdAt: 'asc' },
      });
      const status = computeCategoryStatus(
        evidence.map((e) => ({ riskLevel: e.riskLevel, confidence: e.confidence, clauseType: e.clauseType })),
        highPriority
      );
      result.set(categoryId, status);
      await prisma.libraryNode.updateMany({
        where: { projectId, type: 'RISK_CATEGORY', riskCategoryId: categoryId },
        data: { status },
      });
      await s3Service.putObjectText(
        keys.categoryIndex(projectId, categoryId),
        renderCategoryIndex(
          category,
          status,
          evidence.map((e) => ({ title: e.title, slug: e.slug, page: e.pageNumber, risk: e.riskLevel }))
        )
      );
    }
    return result;
  },

  async loadAllCategoryStatuses(projectId: string): Promise<Map<string, CoverageStatus>> {
    const rows = await prisma.libraryNode.findMany({
      where: { projectId, type: 'RISK_CATEGORY' },
      select: { riskCategoryId: true, status: true },
    });
    return new Map(rows.map((r) => [r.riskCategoryId, (r.status ?? 'OPEN') as CoverageStatus]));
  },

  /**
   * Bounded library digest for the deal brief (Phase C map-reduce). The library
   * is the deterministic "map" of the corpus; this produces a compact, size-
   * bounded synthesis input (coverage + top evidence per category + entities +
   * anomalies) so the brief "reduce" is independent of document count — instead of
   * stuffing every fact sheet. Folder-scoped via allowedDocIds (null = full).
   */
  async buildDigest(projectId: string, allowedDocIds: Set<string> | null = null): Promise<string> {
    const inScopeDoc = (docId: string | null): boolean =>
      allowedDocIds === null || (docId != null && allowedDocIds.has(docId));
    const RANK: Record<string, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };

    const [categoryNodes, provisions, entities, anomalyDocs] = await Promise.all([
      prisma.libraryNode.findMany({
        where: { projectId, type: 'RISK_CATEGORY' },
        select: { riskCategoryId: true, status: true, title: true },
      }),
      prisma.libraryNode.findMany({
        where: { projectId, type: 'PROVISION' },
        select: { riskCategoryId: true, title: true, clauseType: true, riskLevel: true, confidence: true, pageNumber: true, sourceDocumentId: true },
      }),
      prisma.masterEntity.findMany({ where: { projectId }, select: { entityType: true, canonicalName: true }, take: 40 }),
      prisma.document.findMany({ where: { projectId, NOT: { anomalyFlags: { equals: Prisma.JsonNull } } }, select: { name: true, anomalyFlags: true }, take: 40 }),
    ]);

    const provInScope = provisions.filter((p) => inScopeDoc(p.sourceDocumentId));
    const docIds = [...new Set(provInScope.map((p) => p.sourceDocumentId).filter(Boolean))] as string[];
    const docName = new Map(
      (await prisma.document.findMany({ where: { id: { in: docIds } }, select: { id: true, name: true } })).map((d) => [d.id, d.name])
    );

    const statusByCategory = new Map(categoryNodes.map((c) => [c.riskCategoryId, c.status ?? 'OPEN']));
    const provByCategory = new Map<string, typeof provInScope>();
    for (const p of provInScope) {
      const arr = provByCategory.get(p.riskCategoryId) ?? [];
      arr.push(p);
      provByCategory.set(p.riskCategoryId, arr);
    }

    const lines: string[] = ['# Deal library digest', ''];
    for (const cat of RISK_CATEGORIES) {
      const status = statusByCategory.get(cat.id) ?? 'OPEN';
      const inCat = provByCategory.get(cat.id) ?? [];
      // A fact-fed category with nothing in it is a supplemental request, not a
      // finding — say so once rather than printing an empty section per category.
      if (status === 'OPEN' && inCat.length === 0) {
        lines.push(`## ${cat.title} — OPEN (no evidence in the data room)`, '');
        continue;
      }
      lines.push(`## ${cat.title} — ${status}`);
      const top = inCat
        .sort((a, b) => (RANK[b.riskLevel ?? 'LOW'] ?? 0) - (RANK[a.riskLevel ?? 'LOW'] ?? 0) || (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 6);
      for (const p of top) {
        const src = p.sourceDocumentId ? docName.get(p.sourceDocumentId) ?? '?' : '?';
        lines.push(`- ${p.title} [${p.clauseType ?? ''}${p.riskLevel ? ` · ${p.riskLevel}` : ''}] ([${src}${p.pageNumber ? ` p.${p.pageNumber}` : ''}])`);
      }
      lines.push('');
    }

    if (entities.length) {
      lines.push('## Parties & entities', entities.map((e) => `- ${e.canonicalName} (${e.entityType})`).join('\n'), '');
    }
    if (anomalyDocs.length) {
      lines.push('## Cross-document anomalies');
      for (const d of anomalyDocs) {
        const flags = Array.isArray(d.anomalyFlags) ? (d.anomalyFlags as Array<{ reason?: string }>) : [];
        for (const f of flags.slice(0, 3)) if (f.reason) lines.push(`- [${d.name}] ${f.reason}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  },

  /**
   * Phase 2 — cross-document reconciliation of the library. Deterministic, no
   * LLM. Runs in the debounced reconciliation pass once a batch settles:
   *   1. Recompute every risk category's coverage status authoritatively
   *      (playbook-aware + THIN), from all evidence across all documents.
   *   2. Rebuild PEER_OF edges linking same-clause-type provisions across docs.
   *   3. Rebuild the index/log spine so counts are globally consistent.
   * Idempotent; safe to run repeatedly. No-op if the library isn't seeded.
   */
  async reconcileLibrary(projectId: string, projectName: string, opts?: { full?: boolean }): Promise<boolean> {
    if (!(await this.isSeeded(projectId))) return false;
    const full = opts?.full === true;

    // Incremental watermark: only recompute what changed since the last reconcile.
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { libraryManifest: true } });
    const manifest =
      project?.libraryManifest && typeof project.libraryManifest === 'object'
        ? (project.libraryManifest as Record<string, unknown>)
        : {};
    const lastAt = !full && manifest.lastReconcileAt ? new Date(manifest.lastReconcileAt as string) : null;

    let dirtyCategoryIds: Set<string> | null = null; // null = recompute all
    let dirtyClauseTypes: Set<string> | undefined; // undefined = rebuild all peer links
    if (lastAt) {
      const newProvs = await prisma.libraryNode.findMany({
        where: { projectId, type: { in: ['PROVISION', 'RISK', 'OBLIGATION'] }, createdAt: { gt: lastAt } },
        select: { riskCategoryId: true, clauseType: true },
      });
      if (newProvs.length === 0) return false; // nothing new since last reconcile — skip the O(corpus) work
      dirtyCategoryIds = new Set(newProvs.map((p) => p.riskCategoryId));
      dirtyClauseTypes = new Set(newProvs.map((p) => (p.clauseType ?? '').toUpperCase()).filter(Boolean));
    }

    const playbook = await playbookService.get(projectId);
    const highPriority = highPriorityClauseTypesFor(playbook);

    const categoryNodes = await prisma.libraryNode.findMany({
      where: { projectId, type: 'RISK_CATEGORY' },
      select: { riskCategoryId: true, status: true },
    });
    const toRecompute = dirtyCategoryIds
      ? categoryNodes.filter((c) => dirtyCategoryIds!.has(c.riskCategoryId))
      : categoryNodes;
    const recomputeIds = toRecompute.map((c) => c.riskCategoryId);

    // Load evidence only for the categories being recomputed (incremental → O(dirty)).
    const evidence = recomputeIds.length
      ? await prisma.libraryNode.findMany({
          where: { projectId, type: { in: ['PROVISION', 'RISK', 'OBLIGATION'] }, riskCategoryId: { in: recomputeIds } },
          select: { riskCategoryId: true, title: true, slug: true, pageNumber: true, riskLevel: true, confidence: true, clauseType: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const evidenceByCategory = new Map<string, typeof evidence>();
    for (const e of evidence) {
      const arr = evidenceByCategory.get(e.riskCategoryId) ?? [];
      arr.push(e);
      evidenceByCategory.set(e.riskCategoryId, arr);
    }

    // statuses map: stored for all categories, overridden for the recomputed ones.
    const statuses = new Map<string, CoverageStatus>();
    for (const c of categoryNodes) statuses.set(c.riskCategoryId, (c.status ?? 'OPEN') as CoverageStatus);

    const indexWrites: Promise<void>[] = [];
    for (const node of toRecompute) {
      const category = getRiskCategory(node.riskCategoryId);
      if (!category) continue;
      const ev = evidenceByCategory.get(node.riskCategoryId) ?? [];
      const status = computeCategoryStatus(
        ev.map((e) => ({ riskLevel: e.riskLevel, confidence: e.confidence, clauseType: e.clauseType })),
        highPriority
      );
      statuses.set(node.riskCategoryId, status);
      if (status !== (node.status ?? 'OPEN')) {
        await prisma.libraryNode.updateMany({
          where: { projectId, type: 'RISK_CATEGORY', riskCategoryId: node.riskCategoryId },
          data: { status },
        });
      }
      if (status !== 'OPEN' || (node.status ?? 'OPEN') !== 'OPEN') {
        indexWrites.push(
          s3Service.putObjectText(
            keys.categoryIndex(projectId, category.id),
            renderCategoryIndex(category, status, ev.map((e) => ({ title: e.title, slug: e.slug, page: e.pageNumber, risk: e.riskLevel })))
          )
        );
      }
    }

    // Peer links (dirty clause types only when incremental) + orphan prune.
    await this.rebuildPeerLinks(projectId, dirtyClauseTypes);
    await this.pruneOrphanEntities(projectId);

    // Master index (bounded — always rebuilt from the full statuses map).
    indexWrites.push(s3Service.putObjectText(keys.indexMd(projectId), renderMasterIndex(projectName, statuses)));
    await Promise.all(indexWrites);
    await updateManifest(projectId, { index: { s3Key: keys.indexMd(projectId), updatedAt: nowIso() }, lastReconcileAt: nowIso() });

    const flaggedCount = [...statuses.values()].filter((s) => s === 'FLAGGED').length;
    const openCount = [...statuses.values()].filter((s) => s === 'OPEN').length;
    await appendLog(projectId, `reconciled (${full ? 'full' : dirtyCategoryIds ? `incremental: ${recomputeIds.length} categories` : 'first'}) — ${openCount} open, ${flaggedCount} flagged`);
    // eslint-disable-next-line no-console
    console.log(`[library] reconciled project ${projectId} (${full ? 'full' : dirtyCategoryIds ? 'incremental' : 'first'}): ${openCount} open, ${flaggedCount} flagged`);
    return true;
  },

  /**
   * Rebuild PEER_OF edges: same-clause-type provisions form a peer group. Peer
   * groups are independent per clause type, so passing `clauseTypes` rebuilds only
   * those groups (incremental) — O(dirty) instead of O(corpus). Omit for a full rebuild.
   */
  async rebuildPeerLinks(projectId: string, clauseTypes?: Set<string>): Promise<void> {
    const provisions = await prisma.libraryNode.findMany({
      where: {
        projectId,
        type: 'PROVISION',
        clauseType: clauseTypes ? { in: [...clauseTypes] } : { not: null },
      },
      select: { id: true, clauseType: true, sourceDocumentId: true },
      orderBy: { id: 'asc' },
    });

    // Delete existing PEER_OF only for the (dirty) clause types being rebuilt.
    if (clauseTypes) {
      const ids = provisions.map((p) => p.id);
      if (ids.length) {
        await prisma.libraryEdge.deleteMany({
          where: { projectId, edgeType: 'PEER_OF', OR: [{ fromNodeId: { in: ids } }, { toNodeId: { in: ids } }] },
        });
      }
    } else {
      await prisma.libraryEdge.deleteMany({ where: { projectId, edgeType: 'PEER_OF' } });
    }

    const byClause = new Map<string, typeof provisions>();
    for (const p of provisions) {
      const key = (p.clauseType ?? '').toUpperCase();
      const arr = byClause.get(key) ?? [];
      arr.push(p);
      byClause.set(key, arr);
    }

    const edges: Prisma.LibraryEdgeCreateManyInput[] = [];
    for (const group of byClause.values()) {
      // Only a peer group if the clause type appears in ≥2 distinct documents.
      const distinctDocs = new Set(group.map((p) => p.sourceDocumentId));
      if (group.length < 2 || distinctDocs.size < 2) continue;
      const [rep, ...rest] = group; // stable representative (lowest id)
      for (const peer of rest) {
        edges.push({
          id: randomUUID(),
          projectId,
          fromNodeId: rep.id,
          toNodeId: peer.id,
          edgeType: 'PEER_OF',
        });
      }
    }
    if (edges.length > 0) {
      await prisma.libraryEdge.createMany({ data: edges, skipDuplicates: true });
    }
  },

  /** Delete ENTITY nodes that no longer have any incoming edge. */
  async pruneOrphanEntities(projectId: string): Promise<void> {
    const entities = await prisma.libraryNode.findMany({
      where: { projectId, type: 'ENTITY' },
      select: { id: true },
    });
    if (entities.length === 0) return;
    const referenced = new Set(
      (
        await prisma.libraryEdge.findMany({
          where: { projectId, toNodeId: { in: entities.map((e) => e.id) } },
          select: { toNodeId: true },
        })
      ).map((e) => e.toNodeId)
    );
    const orphans = entities.filter((e) => !referenced.has(e.id)).map((e) => e.id);
    if (orphans.length > 0) {
      await prisma.libraryNode.deleteMany({ where: { id: { in: orphans } } });
    }
  },

  /**
   * Remove a document's evidence from the library (called on document delete).
   * Deletes its SOURCE + evidence nodes (edges cascade), then reconciles so
   * category coverage, peer links, indexes, and orphaned entities are current.
   * Best-effort and self-contained (no reconciliation.service import → no cycle).
   */
  async removeDocument(projectId: string, documentId: string): Promise<void> {
    const deleted = await prisma.libraryNode.deleteMany({
      where: {
        projectId,
        sourceDocumentId: documentId,
        type: { in: ['PROVISION', 'RISK', 'OBLIGATION', 'SOURCE'] },
      },
    });
    if (deleted.count === 0) return;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true },
    });
    // Deletion removes evidence — force a FULL reconcile (the incremental
    // watermark only sees additions, not removals).
    await this.reconcileLibrary(projectId, project?.name ?? 'Deal', { full: true });
  },
};
