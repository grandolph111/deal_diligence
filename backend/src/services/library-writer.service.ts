/**
 * Library writer — Phase 1.
 *
 * Two entry points:
 *   seedProjectLibrary(projectId, name)  → pre-seeds the checklist ToC: one
 *       CHECKLIST_ITEM node per canonical item (status OPEN) + the static
 *       CLAUDE.md / checklist.md / index.md / log.md and per-item `_index.md`
 *       files. Called on project create so open diligence questions are visible
 *       before any document exists.
 *   fileDocument({...})                  → Stage 7 of ingestion: decomposes an
 *       extraction into evidence nodes (PROVISION + SOURCE + light ENTITY),
 *       files each under the checklist item its CUAD type answers, links them,
 *       flips touched items OPEN→COVERED/FLAGGED, and refreshes the affected
 *       index files + log.
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
  WORKSTREAMS,
  CHECKLIST_ITEMS,
  itemsForWorkstream,
  itemForClauseType,
  getWorkstream,
  type ChecklistItem,
} from '../integrations/library/checklist';
import { LIBRARY_CLAUDE_MD, renderChecklistMarkdown } from '../integrations/library/templates';
import type { CoverageStatus } from '../integrations/library/types';
import { playbookService } from './playbook.service';
import type { Playbook } from '../integrations/claude';

/* ---------- S3 path helpers ---------- */

const base = (projectId: string) => `projects/${projectId}/library`;
const keys = {
  claudeMd: (p: string) => `${base(p)}/CLAUDE.md`,
  checklistMd: (p: string) => `${base(p)}/checklist.md`,
  indexMd: (p: string) => `${base(p)}/index.md`,
  logMd: (p: string) => `${base(p)}/log.md`,
  workstreamIndex: (p: string, wsId: string) => `${base(p)}/workstreams/${wsId}/_index.md`,
  itemIndex: (p: string, wsId: string, itemId: string) =>
    `${base(p)}/workstreams/${wsId}/${itemId}/_index.md`,
  provision: (p: string, wsId: string, itemId: string, slug: string) =>
    `${base(p)}/workstreams/${wsId}/${itemId}/${slug}.md`,
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

// Entities and sources are cross-cutting — they aren't filed under a workstream
// or checklist item. Use explicit sentinels rather than a misleading real id.
const CROSS_CUTTING_WS = '_cross-cutting';
const ENTITY_ITEM = '_entity';
const SOURCE_ITEM = '_source';

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
export const computeItemStatus = (
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

const renderItemIndex = (
  item: ChecklistItem,
  status: CoverageStatus,
  evidence: { title: string; slug: string; page: number | null; risk: string | null }[]
): string => {
  const ws = getWorkstream(item.workstreamId);
  const lines = [
    '---',
    `item: ${item.id}`,
    `workstream: ${item.workstreamId}`,
    `status: ${status}`,
    `evidence_count: ${evidence.length}`,
    `updated: ${nowIso()}`,
    '---',
    '',
    `# ${item.title}`,
    '',
    `**Workstream:** ${ws?.title ?? item.workstreamId}`,
    `**Status:** ${STATUS_LABEL[status]}`,
    '',
    `> ${item.description}`,
    '',
    '## Evidence',
    '',
  ];
  if (evidence.length === 0) {
    lines.push('_No evidence found yet. This is an open diligence question._');
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

const renderWorkstreamIndex = (
  wsId: string,
  itemStatuses: Map<string, CoverageStatus>
): string => {
  const ws = getWorkstream(wsId);
  const lines = ['---', `workstream: ${wsId}`, `updated: ${nowIso()}`, '---', '', `# ${ws?.title ?? wsId}`, '', '| Item | Status |', '| --- | --- |'];
  for (const item of itemsForWorkstream(wsId)) {
    const st = itemStatuses.get(item.id) ?? 'OPEN';
    lines.push(`| [${item.title}](./${item.id}/_index.md) | ${st} |`);
  }
  lines.push('');
  return lines.join('\n');
};

const renderMasterIndex = (
  projectName: string,
  itemStatuses: Map<string, CoverageStatus>
): string => {
  const lines = [
    '---',
    `project: ${projectName}`,
    `updated: ${nowIso()}`,
    '---',
    '',
    `# ${projectName} — Deal Library`,
    '',
    'Diligence checklist ToC. Each item is a question with a coverage status;',
    'open items are unanswered questions. See [checklist.md](./checklist.md) and',
    '[CLAUDE.md](./CLAUDE.md).',
    '',
  ];
  for (const ws of WORKSTREAMS) {
    const items = itemsForWorkstream(ws.id);
    const open = items.filter((i) => (itemStatuses.get(i.id) ?? 'OPEN') === 'OPEN').length;
    const flagged = items.filter((i) => itemStatuses.get(i.id) === 'FLAGGED').length;
    const tag = flagged ? ` — 🚩 ${flagged} flagged` : '';
    lines.push(`## ${ws.order}. [${ws.title}](./workstreams/${ws.id}/_index.md) — ${open}/${items.length} open${tag}`);
    for (const item of items) {
      const st = itemStatuses.get(item.id) ?? 'OPEN';
      lines.push(`- ${st === 'OPEN' ? '🔲' : st === 'FLAGGED' ? '🚩' : '✅'} [${item.title}](./workstreams/${ws.id}/${item.id}/_index.md)`);
    }
    lines.push('');
  }
  return lines.join('\n');
};

const renderProvisionNode = (args: {
  id: string;
  item: ChecklistItem;
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
  const ws = getWorkstream(args.item.workstreamId);
  const links = [
    `sources/${args.sourceSlug}`,
    ...args.entityLinks.map((e) => `entities/${e.folder}/${e.slug}`),
  ];
  return [
    '---',
    `id: ${args.id}`,
    'type: provision',
    `workstream: ${args.item.workstreamId}`,
    `item: ${args.item.id}`,
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
    `**Workstream / item:** ${ws?.title ?? args.item.workstreamId} → ${args.item.title}`,
    `**Source:** [${args.sourceName}](../../../sources/${args.sourceSlug}.md)${args.page != null ? ` (p.${args.page})` : ''}`,
    '',
    `**Summary:** ${args.summary || '_none_'}`,
    '',
    args.quote ? `**Quote (p.${args.page ?? '?'}):**\n> ${args.quote.replace(/\n/g, ' ')}` : '',
    '',
    args.entityLinks.length
      ? `**Mentions:** ${args.entityLinks.map((e) => `[${e.name}](../../../entities/${e.folder}/${e.slug}.md)`).join(', ')}`
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
      where: { projectId, type: 'CHECKLIST_ITEM' },
    });
    return count > 0;
  },

  /** Pre-seed the checklist ToC (all items OPEN) + static + index files. Idempotent. */
  async seedProjectLibrary(projectId: string, projectName: string): Promise<void> {
    if (await this.isSeeded(projectId)) return;

    // 1. CHECKLIST_ITEM nodes (one insert).
    await prisma.libraryNode.createMany({
      data: CHECKLIST_ITEMS.map((item) => ({
        id: randomUUID(),
        projectId,
        type: 'CHECKLIST_ITEM' as const,
        workstreamId: item.workstreamId,
        itemId: item.id,
        slug: `item-${item.id}`,
        title: item.title,
        status: 'OPEN' as const,
        s3Key: keys.itemIndex(projectId, item.workstreamId, item.id),
      })),
      skipDuplicates: true,
    });

    // 2. Markdown spine (all OPEN).
    const statuses = new Map<string, CoverageStatus>();
    const writes: Promise<void>[] = [
      s3Service.putObjectText(keys.claudeMd(projectId), LIBRARY_CLAUDE_MD),
      s3Service.putObjectText(keys.checklistMd(projectId), renderChecklistMarkdown()),
      s3Service.putObjectText(keys.logMd(projectId), `# Ingestion log\n\n- ${nowIso()} — library seeded (${CHECKLIST_ITEMS.length} items)\n`),
      s3Service.putObjectText(keys.indexMd(projectId), renderMasterIndex(projectName, statuses)),
    ];
    for (const ws of WORKSTREAMS) {
      writes.push(s3Service.putObjectText(keys.workstreamIndex(projectId, ws.id), renderWorkstreamIndex(ws.id, statuses)));
    }
    for (const item of CHECKLIST_ITEMS) {
      writes.push(s3Service.putObjectText(keys.itemIndex(projectId, item.workstreamId, item.id), renderItemIndex(item, 'OPEN', [])));
    }
    await Promise.all(writes);

    await updateManifest(projectId, {
      index: { s3Key: keys.indexMd(projectId), updatedAt: nowIso() },
      seededAt: nowIso(),
    });

    // eslint-disable-next-line no-console
    console.log(`[library] seeded ${CHECKLIST_ITEMS.length} checklist items for project ${projectId}`);
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
          workstreamId: CROSS_CUTTING_WS,
          itemId: ENTITY_ITEM,
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
    const touchedItems = new Set<string>();

    (extraction.clauses ?? []).forEach((clause, i) => {
      const item = itemForClauseType(clause.clauseType);
      touchedItems.add(item.id);
      const provId = randomUUID();
      const slug = `prov-${documentId.slice(0, 8)}-${i}-${slugify(clause.clauseType)}`;
      const title = clause.title || `${clause.clauseType} — ${documentName}`;
      const risk = clause.riskLevel ?? null;
      const conf = clause.confidence != null ? Math.round(clause.confidence * 100) : null;

      nodeRows.push({
        id: provId,
        projectId,
        type: 'PROVISION',
        workstreamId: item.workstreamId,
        itemId: item.id,
        slug,
        title,
        s3Key: keys.provision(projectId, item.workstreamId, item.id, slug),
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

      // provision → item, provision → source, provision → entities
      edgeRows.push({ id: randomUUID(), projectId, fromNodeId: provId, toNodeId: `item::${item.id}`, edgeType: 'EVIDENCES' });
      edgeRows.push({ id: randomUUID(), projectId, fromNodeId: provId, toNodeId: sourceId, edgeType: 'SOURCED_FROM' });
      for (const ent of entityLinks.values()) {
        edgeRows.push({ id: randomUUID(), projectId, fromNodeId: provId, toNodeId: ent.id, edgeType: 'MENTIONS' });
      }

      provisionWrites.push(
        s3Service.putObjectText(
          keys.provision(projectId, item.workstreamId, item.id, slug),
          renderProvisionNode({
            id: provId,
            item,
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
      workstreamId: CROSS_CUTTING_WS,
      itemId: SOURCE_ITEM,
      slug: `src-${sourceSlug}`,
      title: documentName,
      s3Key: keys.source(projectId, sourceSlug),
      sourceDocumentId: documentId,
      riskLevel: extraction.riskLevel ?? null,
    });

    // Resolve `item::<id>` placeholders to the real CHECKLIST_ITEM node ids.
    const itemNodes = await prisma.libraryNode.findMany({
      where: { projectId, type: 'CHECKLIST_ITEM', itemId: { in: [...touchedItems] } },
      select: { id: true, itemId: true },
    });
    const itemNodeId = new Map(itemNodes.map((n) => [n.itemId, n.id]));
    const resolvedEdges = edgeRows
      .map((e) =>
        typeof e.toNodeId === 'string' && e.toNodeId.startsWith('item::')
          ? { ...e, toNodeId: itemNodeId.get(e.toNodeId.slice(6)) }
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

    // --- Recompute status + refresh touched item indexes ---
    const statuses = await this.refreshItemIndexes(projectId, [...touchedItems]);

    // --- Refresh touched workstream indexes + master index ---
    const allStatuses = await this.loadAllItemStatuses(projectId);
    for (const [k, v] of statuses) allStatuses.set(k, v);
    const touchedWs = new Set([...touchedItems].map((id) => itemForClauseTypeWorkstream(id)));
    await Promise.all(
      [...touchedWs].map((wsId) =>
        s3Service.putObjectText(keys.workstreamIndex(projectId, wsId), renderWorkstreamIndex(wsId, allStatuses))
      )
    );
    await s3Service.putObjectText(keys.indexMd(projectId), renderMasterIndex(args.projectName, allStatuses));
    await updateManifest(projectId, { index: { s3Key: keys.indexMd(projectId), updatedAt: nowIso() } });
    await appendLog(projectId, `ingested "${documentName}" — ${extraction.clauses?.length ?? 0} provisions across ${touchedItems.size} items`);

    // eslint-disable-next-line no-console
    console.log(`[library] filed "${documentName}" → ${extraction.clauses?.length ?? 0} provisions, ${touchedItems.size} items touched`);
  },

  /** Recompute + rewrite `_index.md` for the given items from their evidence. */
  async refreshItemIndexes(
    projectId: string,
    itemIds: string[]
  ): Promise<Map<string, CoverageStatus>> {
    // Same authoritative, playbook-aware status as reconcileLibrary — one source
    // of truth, so the file-time (provisional) status matches the reconciled one.
    const playbook = await playbookService.get(projectId);
    const highPriority = highPriorityClauseTypesFor(playbook);
    const result = new Map<string, CoverageStatus>();
    for (const itemId of itemIds) {
      const item = CHECKLIST_ITEMS.find((i) => i.id === itemId);
      if (!item) continue;
      const evidence = await prisma.libraryNode.findMany({
        where: { projectId, itemId, type: { in: ['PROVISION', 'RISK', 'OBLIGATION'] } },
        select: { title: true, slug: true, pageNumber: true, riskLevel: true, confidence: true, clauseType: true },
        orderBy: { createdAt: 'asc' },
      });
      const status = computeItemStatus(
        evidence.map((e) => ({ riskLevel: e.riskLevel, confidence: e.confidence, clauseType: e.clauseType })),
        highPriority
      );
      result.set(itemId, status);
      await prisma.libraryNode.updateMany({
        where: { projectId, type: 'CHECKLIST_ITEM', itemId },
        data: { status },
      });
      await s3Service.putObjectText(
        keys.itemIndex(projectId, item.workstreamId, itemId),
        renderItemIndex(
          item,
          status,
          evidence.map((e) => ({ title: e.title, slug: e.slug, page: e.pageNumber, risk: e.riskLevel }))
        )
      );
    }
    return result;
  },

  async loadAllItemStatuses(projectId: string): Promise<Map<string, CoverageStatus>> {
    const rows = await prisma.libraryNode.findMany({
      where: { projectId, type: 'CHECKLIST_ITEM' },
      select: { itemId: true, status: true },
    });
    return new Map(rows.map((r) => [r.itemId, (r.status ?? 'OPEN') as CoverageStatus]));
  },

  /**
   * Bounded library digest for the deal brief (Phase C map-reduce). The library
   * is the deterministic "map" of the corpus; this produces a compact, size-
   * bounded synthesis input (coverage + top evidence per workstream + entities +
   * anomalies) so the brief "reduce" is independent of document count — instead of
   * stuffing every fact sheet. Folder-scoped via allowedDocIds (null = full).
   */
  async buildDigest(projectId: string, allowedDocIds: Set<string> | null = null): Promise<string> {
    const inScopeDoc = (docId: string | null): boolean =>
      allowedDocIds === null || (docId != null && allowedDocIds.has(docId));
    const RANK: Record<string, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };

    const [items, provisions, entities, anomalyDocs] = await Promise.all([
      prisma.libraryNode.findMany({
        where: { projectId, type: 'CHECKLIST_ITEM' },
        select: { itemId: true, workstreamId: true, status: true, title: true },
      }),
      prisma.libraryNode.findMany({
        where: { projectId, type: 'PROVISION' },
        select: { workstreamId: true, title: true, clauseType: true, riskLevel: true, confidence: true, pageNumber: true, sourceDocumentId: true },
      }),
      prisma.masterEntity.findMany({ where: { projectId }, select: { entityType: true, canonicalName: true }, take: 40 }),
      prisma.document.findMany({ where: { projectId, NOT: { anomalyFlags: { equals: Prisma.JsonNull } } }, select: { name: true, anomalyFlags: true }, take: 40 }),
    ]);

    const provInScope = provisions.filter((p) => inScopeDoc(p.sourceDocumentId));
    const docIds = [...new Set(provInScope.map((p) => p.sourceDocumentId).filter(Boolean))] as string[];
    const docName = new Map(
      (await prisma.document.findMany({ where: { id: { in: docIds } }, select: { id: true, name: true } })).map((d) => [d.id, d.name])
    );

    const statusByItem = new Map(items.map((i) => [i.itemId, i.status ?? 'OPEN']));
    const provByWs = new Map<string, typeof provInScope>();
    for (const p of provInScope) {
      const arr = provByWs.get(p.workstreamId) ?? [];
      arr.push(p);
      provByWs.set(p.workstreamId, arr);
    }

    const lines: string[] = ['# Deal library digest', ''];
    for (const ws of WORKSTREAMS) {
      if (ws.id === '99-to-triage') continue;
      const wsItems = itemsForWorkstream(ws.id);
      const open = wsItems.filter((i) => (statusByItem.get(i.id) ?? 'OPEN') === 'OPEN').length;
      const flagged = wsItems.filter((i) => statusByItem.get(i.id) === 'FLAGGED');
      lines.push(`## ${ws.title} — ${open}/${wsItems.length} open${flagged.length ? `, ${flagged.length} flagged` : ''}`);
      if (flagged.length) lines.push(`Flagged: ${flagged.map((i) => i.title).join(', ')}`);
      const top = (provByWs.get(ws.id) ?? [])
        .sort((a, b) => (RANK[b.riskLevel ?? 'LOW'] ?? 0) - (RANK[a.riskLevel ?? 'LOW'] ?? 0) || (b.confidence ?? 0) - (a.confidence ?? 0))
        .slice(0, 5);
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
   *   1. Recompute every checklist item's coverage status authoritatively
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

    let dirtyItemIds: Set<string> | null = null; // null = recompute all
    let dirtyClauseTypes: Set<string> | undefined; // undefined = rebuild all peer links
    if (lastAt) {
      const newProvs = await prisma.libraryNode.findMany({
        where: { projectId, type: { in: ['PROVISION', 'RISK', 'OBLIGATION'] }, createdAt: { gt: lastAt } },
        select: { itemId: true, clauseType: true },
      });
      if (newProvs.length === 0) return false; // nothing new since last reconcile — skip the O(corpus) work
      dirtyItemIds = new Set(newProvs.map((p) => p.itemId));
      dirtyClauseTypes = new Set(newProvs.map((p) => (p.clauseType ?? '').toUpperCase()).filter(Boolean));
    }

    const playbook = await playbookService.get(projectId);
    const highPriority = highPriorityClauseTypesFor(playbook);

    const items = await prisma.libraryNode.findMany({
      where: { projectId, type: 'CHECKLIST_ITEM' },
      select: { itemId: true, workstreamId: true, status: true },
    });
    const itemsToRecompute = dirtyItemIds ? items.filter((i) => dirtyItemIds!.has(i.itemId)) : items;
    const recomputeIds = itemsToRecompute.map((i) => i.itemId);

    // Load evidence only for the items being recomputed (incremental → O(dirty)).
    const evidence = recomputeIds.length
      ? await prisma.libraryNode.findMany({
          where: { projectId, type: { in: ['PROVISION', 'RISK', 'OBLIGATION'] }, itemId: { in: recomputeIds } },
          select: { itemId: true, title: true, slug: true, pageNumber: true, riskLevel: true, confidence: true, clauseType: true },
          orderBy: { createdAt: 'asc' },
        })
      : [];
    const evidenceByItem = new Map<string, typeof evidence>();
    for (const e of evidence) {
      const arr = evidenceByItem.get(e.itemId) ?? [];
      arr.push(e);
      evidenceByItem.set(e.itemId, arr);
    }

    // statuses map: stored for all items, overridden for the recomputed ones.
    const statuses = new Map<string, CoverageStatus>();
    for (const i of items) statuses.set(i.itemId, (i.status ?? 'OPEN') as CoverageStatus);

    const indexWrites: Promise<void>[] = [];
    for (const itemNode of itemsToRecompute) {
      const item = CHECKLIST_ITEMS.find((i) => i.id === itemNode.itemId);
      if (!item) continue;
      const ev = evidenceByItem.get(itemNode.itemId) ?? [];
      const status = computeItemStatus(
        ev.map((e) => ({ riskLevel: e.riskLevel, confidence: e.confidence, clauseType: e.clauseType })),
        highPriority
      );
      statuses.set(itemNode.itemId, status);
      if (status !== (itemNode.status ?? 'OPEN')) {
        await prisma.libraryNode.updateMany({
          where: { projectId, type: 'CHECKLIST_ITEM', itemId: itemNode.itemId },
          data: { status },
        });
      }
      if (status !== 'OPEN' || (itemNode.status ?? 'OPEN') !== 'OPEN') {
        indexWrites.push(
          s3Service.putObjectText(
            keys.itemIndex(projectId, item.workstreamId, item.id),
            renderItemIndex(item, status, ev.map((e) => ({ title: e.title, slug: e.slug, page: e.pageNumber, risk: e.riskLevel })))
          )
        );
      }
    }

    // Peer links (dirty clause types only when incremental) + orphan prune.
    await this.rebuildPeerLinks(projectId, dirtyClauseTypes);
    await this.pruneOrphanEntities(projectId);

    // Workstream + master indexes (bounded — always rebuilt from the full statuses map).
    for (const ws of WORKSTREAMS) {
      indexWrites.push(s3Service.putObjectText(keys.workstreamIndex(projectId, ws.id), renderWorkstreamIndex(ws.id, statuses)));
    }
    indexWrites.push(s3Service.putObjectText(keys.indexMd(projectId), renderMasterIndex(projectName, statuses)));
    await Promise.all(indexWrites);
    await updateManifest(projectId, { index: { s3Key: keys.indexMd(projectId), updatedAt: nowIso() }, lastReconcileAt: nowIso() });

    const flaggedCount = [...statuses.values()].filter((s) => s === 'FLAGGED').length;
    const openCount = [...statuses.values()].filter((s) => s === 'OPEN').length;
    await appendLog(projectId, `reconciled (${full ? 'full' : dirtyItemIds ? `incremental: ${recomputeIds.length} items` : 'first'}) — ${openCount} open, ${flaggedCount} flagged`);
    // eslint-disable-next-line no-console
    console.log(`[library] reconciled project ${projectId} (${full ? 'full' : dirtyItemIds ? 'incremental' : 'first'}): ${openCount} open, ${flaggedCount} flagged`);
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
   * Deletes its SOURCE + evidence nodes (edges cascade), then reconciles so item
   * coverage, peer links, indexes, and orphaned entities are brought current.
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

/** Workstream id for a checklist item id (helper for index refresh). */
function itemForClauseTypeWorkstream(itemId: string): string {
  return CHECKLIST_ITEMS.find((i) => i.id === itemId)?.workstreamId ?? '99-to-triage';
}
