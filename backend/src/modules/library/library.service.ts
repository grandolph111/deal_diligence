/**
 * Library read layer — serves the Data Room navigation and the Deal Map.
 *
 * Three shapes:
 *   getToc(projectId, user)                → workstream → checklist item tree
 *       with per-node document counts. The Data Room tree and the board scope
 *       picker both render this.
 *   getGraph(projectId, user, options)     → the BASE graph: workstream hubs →
 *       checklist items. Sources and entities are opt-in (see GraphOptions);
 *       provisions are always fetched on expand, never in the base tier.
 *   getItemEvidence(projectId, itemId, u)  → the PROVISION nodes under one item
 *       plus their edges, spliced into the base graph client-side on click.
 *
 * Everything is workstream-scoped via scope.service: checklist items always
 * show (they are the ToC skeleton, and an unanswered question is itself the
 * finding), but sources / provisions / entities are limited to documents the
 * caller can reach through their granted workstreams.
 */

import type { User } from '@prisma/client';
import { prisma } from '../../config/database';
import { resolveProjectScope } from '../../services/scope.service';
import { ApiError } from '../../utils/ApiError';
import { playbookService } from '../../services/playbook.service';
import {
  computeItemStatus,
  highPriorityClauseTypesFor,
} from '../../services/library-writer.service';
import { WORKSTREAMS, getWorkstream, getItem } from '../../integrations/library/checklist';

export interface GraphNode {
  id: string;
  type: 'WORKSTREAM' | 'CHECKLIST_ITEM' | 'PROVISION' | 'RISK' | 'OBLIGATION' | 'ENTITY' | 'SOURCE';
  label: string;
  status?: string | null;
  workstreamId?: string;
  itemId?: string;
  clauseType?: string | null;
  riskLevel?: string | null;
  page?: number | null;
  evidenceCount?: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  weight?: number;
}

export interface LibraryGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** How many source/entity nodes were omitted from the base view (drill in to see). */
  truncated?: { sources: number; entities: number };
}

// The base graph is the checklist skeleton only: workstream hubs + their items
// (~64 nodes). Sources and entities are opt-in via `include`, because showing
// them by default produced a hairball — 180 nodes whose item↔source and
// source↔entity edges are dense enough to bury the checklist structure that is
// the actual point of the view. Everything hidden here is reachable by
// expanding an item.
//
// When `include` does ask for them they stay capped, so a 10K-document deal
// still renders: sources ranked by risk, entities by mention degree.
const MAX_GRAPH_SOURCES = Math.max(10, parseInt(process.env.GRAPH_MAX_SOURCES || '60', 10));
const MAX_GRAPH_ENTITIES = Math.max(10, parseInt(process.env.GRAPH_MAX_ENTITIES || '60', 10));

const RISK_ORDER: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

export interface GraphOptions {
  includeSources?: boolean;
  includeEntities?: boolean;
}

type ScopeUser = Pick<User, 'id' | 'platformRole' | 'companyId'>;

/** LibraryNode types that constitute evidence — i.e. carry a source document. */
export const EVIDENCE_TYPES = ['PROVISION', 'RISK', 'OBLIGATION'] as const;

/** Resolve the set of document ids the caller may see, or null for full access. */
async function allowedDocIds(user: ScopeUser, projectId: string): Promise<Set<string> | null> {
  const scope = await resolveProjectScope(user, projectId);
  if (scope.isFullAccess) return null;
  // Restricted: a document is visible when it supplies evidence to a granted
  // workstream. Documents with no evidence yet belong to no workstream and so
  // are visible only to full-access callers.
  if (scope.allowedWorkstreamIds.length === 0) return new Set();
  const rows = await prisma.libraryNode.findMany({
    where: {
      projectId,
      type: { in: [...EVIDENCE_TYPES] },
      workstreamId: { in: scope.allowedWorkstreamIds },
      sourceDocumentId: { not: null },
    },
    select: { sourceDocumentId: true },
    distinct: ['sourceDocumentId'],
  });
  return new Set(rows.map((r) => r.sourceDocumentId as string));
}

const inScope = (allowed: Set<string> | null, docId: string | null): boolean =>
  allowed === null || (docId != null && allowed.has(docId));

export interface TocItem {
  itemId: string;
  title: string;
  status: string;
  /** Distinct in-scope documents supplying evidence to this item. */
  documentCount: number;
  evidenceCount: number;
}

export interface TocWorkstream {
  id: string;
  title: string;
  order: number;
  /** Distinct in-scope documents with evidence anywhere in this workstream. */
  documentCount: number;
  evidenceCount: number;
  items: TocItem[];
}

export interface LibraryToc {
  workstreams: TocWorkstream[];
  /** Documents with no evidence at all — never extracted, or extraction failed. */
  unfiled: { documentCount: number };
  totals: { documents: number; evidence: number };
}

export interface DocumentBacklinks {
  document: { id: string; name: string };
  /** Checklist questions this document answers, worst-risk first. */
  checklistItems: Array<{
    itemId: string;
    title: string;
    status: string;
    workstreamId: string;
    workstreamTitle: string;
    evidenceCount: number;
    highRiskCount: number;
  }>;
  /** Clause types present here, and how many OTHER documents to compare against. */
  clauseTypes: Array<{ clauseType: string; peerDocumentCount: number }>;
  relatedDocuments: Array<{
    id: string;
    name: string;
    riskScore: number | null;
    riskLevel: string | null;
    sharedClauseTypes: string[];
  }>;
  entities: Array<{ id: string; title: string; mentionCount: number }>;
  notes: Array<{ id: string; title: string; itemId: string; createdAt: string }>;
}

export interface ClauseComparison {
  clauseType: string;
  itemId: string | null;
  provisions: Array<{
    id: string;
    documentId: string | null;
    documentName: string;
    title: string;
    content: string | null;
    riskLevel: string | null;
    confidence: number | null;
    pageNumber: number | null;
    itemId: string;
  }>;
  stats: {
    total: number;
    documents: number;
    byRisk: { HIGH: number; MEDIUM: number; LOW: number; UNSCORED: number };
  };
}

// Backlink fan-out is unbounded in principle (a common clause type touches
// ~90 documents). Cap the "related" lists so the panel stays a summary; the
// comparison view is where the full set lives.
const MAX_RELATED_DOCUMENTS = 12;
const MAX_RELATED_ENTITIES = 15;
const MAX_SUGGESTED_ITEMS = 8;

const TRIAGE_ITEM_ID = 'unmapped-provisions';
const TRIAGE_WORKSTREAM_ID = '99-to-triage';

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve loose document references to real document ids.
 *
 * Chat citations carry whatever identifier the model echoed from the prompt,
 * which is the document NAME rather than its id (see chat.service — the
 * `documentId` it stores is the model's string, not a row id). Rather than let
 * that break filing, accept either form and resolve names within the project.
 */
async function resolveDocumentRefs(projectId: string, refs: string[]): Promise<string[]> {
  if (refs.length === 0) return [];
  const ids = refs.filter((r) => UUID_RE.test(r));
  const names = refs.filter((r) => !UUID_RE.test(r));

  const found = await prisma.document.findMany({
    where: {
      projectId,
      OR: [
        ...(ids.length ? [{ id: { in: ids } }] : []),
        ...names.map((name) => ({ name: { equals: name, mode: 'insensitive' as const } })),
      ],
    },
    select: { id: true },
  });
  return [...new Set(found.map((d) => d.id))];
}

/** SOURCE node ids for the given documents — the join target for SOURCED_FROM edges. */
async function sourceNodeIds(projectId: string, documentIds: string[]): Promise<string[]> {
  if (documentIds.length === 0) return [];
  const rows = await prisma.libraryNode.findMany({
    where: { projectId, type: 'SOURCE', sourceDocumentId: { in: documentIds } },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export const libraryService = {
  /**
   * The checklist tree the Data Room navigates and the board picker scopes to.
   *
   * A document is counted under every workstream it supplies evidence to — the
   * relationship is many-to-many (~8 workstreams per document in practice), so
   * these counts deliberately sum to more than the document total. `unfiled`
   * holds the remainder: documents with no evidence, which would otherwise be
   * invisible in a tree keyed entirely on evidence.
   */
  async getToc(projectId: string, user: ScopeUser): Promise<LibraryToc> {
    const scope = await resolveProjectScope(user, projectId);
    const allowed = await allowedDocIds(user, projectId);
    // A restricted caller navigates only their granted workstreams. Listing the
    // others — even with counts drawn from documents they can reach — would
    // advertise branches the documents API then refuses with 403.
    const grantedWorkstreams = scope.isFullAccess
      ? null
      : new Set(scope.allowedWorkstreamIds);

    const [items, evidence, projectDocs] = await Promise.all([
      prisma.libraryNode.findMany({
        where: { projectId, type: 'CHECKLIST_ITEM' },
        select: { itemId: true, workstreamId: true, title: true, status: true },
      }),
      prisma.libraryNode.findMany({
        where: { projectId, type: { in: [...EVIDENCE_TYPES] } },
        select: { itemId: true, workstreamId: true, sourceDocumentId: true },
      }),
      prisma.document.findMany({ where: { projectId }, select: { id: true } }),
    ]);

    const inScopeEvidence = evidence.filter((e) => inScope(allowed, e.sourceDocumentId));

    // Distinct documents per item and per workstream. Sets, not counters — one
    // document routinely contributes many provisions to the same item.
    const docsByItem = new Map<string, Set<string>>();
    const docsByWorkstream = new Map<string, Set<string>>();
    const evidenceByItem = new Map<string, number>();
    const evidenceByWorkstream = new Map<string, number>();
    const documentsWithEvidence = new Set<string>();

    for (const e of inScopeEvidence) {
      evidenceByItem.set(e.itemId, (evidenceByItem.get(e.itemId) ?? 0) + 1);
      evidenceByWorkstream.set(e.workstreamId, (evidenceByWorkstream.get(e.workstreamId) ?? 0) + 1);
      if (!e.sourceDocumentId) continue;
      documentsWithEvidence.add(e.sourceDocumentId);
      const byItem = docsByItem.get(e.itemId) ?? new Set<string>();
      byItem.add(e.sourceDocumentId);
      docsByItem.set(e.itemId, byItem);
      const byWs = docsByWorkstream.get(e.workstreamId) ?? new Set<string>();
      byWs.add(e.sourceDocumentId);
      docsByWorkstream.set(e.workstreamId, byWs);
    }

    const itemsByWorkstream = new Map<string, TocItem[]>();
    for (const item of items) {
      const bucket = itemsByWorkstream.get(item.workstreamId) ?? [];
      bucket.push({
        itemId: item.itemId,
        title: item.title,
        status: item.status ?? 'OPEN',
        documentCount: docsByItem.get(item.itemId)?.size ?? 0,
        evidenceCount: evidenceByItem.get(item.itemId) ?? 0,
      });
      itemsByWorkstream.set(item.workstreamId, bucket);
    }

    const workstreams: TocWorkstream[] = WORKSTREAMS.filter((ws) => {
      if (grantedWorkstreams && !grantedWorkstreams.has(ws.id)) return false;
      // The catch-all triage workstream is internal — surface it only once
      // something has actually landed there.
      if (ws.id !== '99-to-triage') return itemsByWorkstream.has(ws.id);
      return (docsByWorkstream.get(ws.id)?.size ?? 0) > 0;
    }).map((ws) => ({
      id: ws.id,
      title: ws.title,
      order: ws.order,
      documentCount: docsByWorkstream.get(ws.id)?.size ?? 0,
      evidenceCount: evidenceByWorkstream.get(ws.id) ?? 0,
      items: itemsByWorkstream.get(ws.id) ?? [],
    }));

    // Unfiled is a full-access notion: a document with no evidence belongs to no
    // workstream, so a restricted caller has no grant that could reach it.
    const visibleDocs = projectDocs.filter((d) => allowed === null || allowed.has(d.id));
    const unfiledCount =
      allowed === null ? visibleDocs.filter((d) => !documentsWithEvidence.has(d.id)).length : 0;

    return {
      workstreams,
      unfiled: { documentCount: unfiledCount },
      totals: { documents: visibleDocs.length, evidence: inScopeEvidence.length },
    };
  },

  async getGraph(
    projectId: string,
    user: ScopeUser,
    options: GraphOptions = {}
  ): Promise<LibraryGraph> {
    const { includeSources = false, includeEntities = false } = options;
    const allowed = await allowedDocIds(user, projectId);

    const [items, sources, provisions, entities, mentions] = await Promise.all([
      prisma.libraryNode.findMany({
        where: { projectId, type: 'CHECKLIST_ITEM' },
        select: { id: true, itemId: true, workstreamId: true, title: true, status: true },
      }),
      prisma.libraryNode.findMany({
        where: { projectId, type: 'SOURCE' },
        select: { id: true, title: true, sourceDocumentId: true, riskLevel: true },
      }),
      prisma.libraryNode.findMany({
        where: { projectId, type: { in: ['PROVISION', 'RISK', 'OBLIGATION'] } },
        select: {
          id: true,
          itemId: true,
          sourceDocumentId: true,
          riskLevel: true,
          confidence: true,
          clauseType: true,
        },
      }),
      prisma.libraryNode.findMany({
        where: { projectId, type: 'ENTITY' },
        select: { id: true, title: true, workstreamId: true },
      }),
      prisma.libraryEdge.findMany({
        where: { projectId, edgeType: 'MENTIONS' },
        select: { fromNodeId: true, toNodeId: true },
      }),
    ]);

    // Not seeded yet → empty graph (frontend shows an empty state).
    if (items.length === 0) return { nodes: [], edges: [] };

    // Deliberately unbounded — a diligence graph must not silently truncate. At
    // per-deal scale (dozens of docs) this is small; warn if a deal grows large
    // enough to warrant server-side aggregation rather than hide data.
    if (provisions.length > 2000) {
      // eslint-disable-next-line no-console
      console.warn(
        `[library] getGraph: ${provisions.length} provisions for project ${projectId} — consider server-side aggregation at this scale`
      );
    }

    // In-scope sources + lookup by document id.
    const sourcesInScope = sources.filter((s) => inScope(allowed, s.sourceDocumentId));
    const sourceNodeByDoc = new Map<string, string>();
    for (const s of sourcesInScope) {
      if (s.sourceDocumentId) sourceNodeByDoc.set(s.sourceDocumentId, s.id);
    }

    // In-scope provisions (hidden nodes; drive the aggregate edges + entity set).
    const provInScope = provisions.filter((p) => inScope(allowed, p.sourceDocumentId));
    const provDoc = new Map(provInScope.map((p) => [p.id, p.sourceDocumentId]));
    const provIds = new Set(provInScope.map((p) => p.id));

    // Item coverage status is recomputed from IN-SCOPE evidence, not read from the
    // stored (global) status — a folder-restricted reviewer must not see coverage
    // driven by documents outside their scope. Full-access users get scoped==global.
    const playbook = await playbookService.get(projectId);
    const highPriority = highPriorityClauseTypesFor(playbook);
    const evidenceByItem = new Map<string, typeof provInScope>();
    for (const p of provInScope) {
      const arr = evidenceByItem.get(p.itemId) ?? [];
      arr.push(p);
      evidenceByItem.set(p.itemId, arr);
    }
    const scopedStatus = (itemId: string): string =>
      computeItemStatus(
        (evidenceByItem.get(itemId) ?? []).map((e) => ({
          riskLevel: e.riskLevel,
          confidence: e.confidence,
          clauseType: e.clauseType,
        })),
        highPriority
      );

    const itemNodeByItemId = new Map(items.map((i) => [i.itemId, i.id]));

    // Entities mentioned by in-scope provisions.
    const entityIdsInScope = new Set<string>();
    for (const m of mentions) {
      if (provIds.has(m.fromNodeId)) entityIdsInScope.add(m.toNodeId);
    }
    const entitiesInScope = entities.filter((e) => entityIdsInScope.has(e.id));

    // ---- edges ----
    const edges: GraphEdge[] = [];
    const seen = new Set<string>();
    const push = (source: string, target: string, type: string) => {
      const id = `${type}:${source}->${target}`;
      if (seen.has(id)) {
        const e = edges.find((x) => x.id === id);
        if (e) e.weight = (e.weight ?? 1) + 1;
        return;
      }
      seen.add(id);
      edges.push({ id, source, target, type, weight: 1 });
    };

    // The catch-all "to triage" workstream is internal — only surface it (and its
    // item) once something actually lands there.
    const itemVisible = (it: { workstreamId: string; itemId: string }): boolean =>
      it.workstreamId !== '99-to-triage' || (evidenceByItem.get(it.itemId)?.length ?? 0) > 0;

    // workstream hub → checklist item
    const usedWorkstreams = new Set<string>();
    for (const item of items) {
      if (!itemVisible(item)) continue;
      usedWorkstreams.add(item.workstreamId);
      push(`ws:${item.workstreamId}`, item.id, 'CONTAINS');
    }

    // item ↔ source (aggregated from hidden provisions)
    const evidenceCount = new Map<string, number>();
    for (const p of provInScope) {
      evidenceCount.set(p.itemId, (evidenceCount.get(p.itemId) ?? 0) + 1);
      const itemNode = itemNodeByItemId.get(p.itemId);
      const srcNode = p.sourceDocumentId ? sourceNodeByDoc.get(p.sourceDocumentId) : undefined;
      if (itemNode && srcNode) push(itemNode, srcNode, 'EVIDENCES');
    }

    // source ↔ entity (aggregated from provision mentions)
    for (const m of mentions) {
      if (!provIds.has(m.fromNodeId)) continue;
      const docId = provDoc.get(m.fromNodeId) ?? null;
      const srcNode = docId ? sourceNodeByDoc.get(docId) : undefined;
      if (srcNode) push(srcNode, m.toNodeId, 'MENTIONS');
    }

    // ---- nodes ----
    const nodes: GraphNode[] = [];
    for (const ws of WORKSTREAMS) {
      if (!usedWorkstreams.has(ws.id)) continue;
      nodes.push({ id: `ws:${ws.id}`, type: 'WORKSTREAM', label: ws.title, workstreamId: ws.id });
    }
    for (const item of items) {
      if (!itemVisible(item)) continue;
      nodes.push({
        id: item.id,
        type: 'CHECKLIST_ITEM',
        label: item.title,
        status: scopedStatus(item.itemId),
        workstreamId: item.workstreamId,
        itemId: item.itemId,
        evidenceCount: evidenceCount.get(item.itemId) ?? 0,
      });
    }
    // Cap cross-cutting nodes so the base graph stays renderable at scale.
    // Sources by risk; entities by mention degree (most-connected first).
    const sourcesRanked = [...sourcesInScope].sort(
      (a, b) => (RISK_ORDER[b.riskLevel ?? ''] ?? 0) - (RISK_ORDER[a.riskLevel ?? ''] ?? 0)
    );
    const entityDegree = new Map<string, number>();
    for (const m of mentions) {
      if (provIds.has(m.fromNodeId)) entityDegree.set(m.toNodeId, (entityDegree.get(m.toNodeId) ?? 0) + 1);
    }
    const entitiesRanked = [...entitiesInScope].sort(
      (a, b) => (entityDegree.get(b.id) ?? 0) - (entityDegree.get(a.id) ?? 0)
    );
    const sourcesShown = includeSources ? sourcesRanked.slice(0, MAX_GRAPH_SOURCES) : [];
    const entitiesShown = includeEntities ? entitiesRanked.slice(0, MAX_GRAPH_ENTITIES) : [];

    for (const s of sourcesShown) {
      nodes.push({ id: s.id, type: 'SOURCE', label: s.title, riskLevel: s.riskLevel });
    }
    for (const e of entitiesShown) {
      nodes.push({ id: e.id, type: 'ENTITY', label: e.title, workstreamId: e.workstreamId });
    }

    // Drop edges whose endpoints were capped out.
    const present = new Set(nodes.map((n) => n.id));
    const finalEdges = edges.filter((e) => present.has(e.source) && present.has(e.target));

    return {
      nodes,
      edges: finalEdges,
      truncated: {
        sources: sourcesInScope.length - sourcesShown.length,
        entities: entitiesInScope.length - entitiesShown.length,
      },
    };
  },

  /**
   * Everything the deal already knows that touches one document.
   *
   * The library stores ~17k edges per deal and, until now, surfaced none of
   * them as backlinks — which is where most of the value sits. A document is
   * not an island: it answers ~14 checklist questions, shares clause types with
   * dozens of peers, and names entities that recur across the deal. This is a
   * pure read over edges already computed at ingest.
   */
  async getDocumentBacklinks(
    projectId: string,
    documentId: string,
    user: ScopeUser
  ): Promise<DocumentBacklinks> {
    const allowed = await allowedDocIds(user, projectId);
    if (!inScope(allowed, documentId)) {
      throw ApiError.forbidden('You do not have access to this document');
    }

    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
      select: { id: true, name: true },
    });
    if (!document) throw ApiError.notFound('Document not found');

    const provisions = await prisma.libraryNode.findMany({
      where: {
        projectId,
        type: { in: [...EVIDENCE_TYPES] },
        sourceDocumentId: documentId,
      },
      select: { id: true, itemId: true, workstreamId: true, clauseType: true, riskLevel: true },
    });

    // --- checklist items this document answers ---
    const byItem = new Map<string, { count: number; workstreamId: string; highRisk: number }>();
    for (const p of provisions) {
      const e = byItem.get(p.itemId) ?? { count: 0, workstreamId: p.workstreamId, highRisk: 0 };
      e.count += 1;
      if (p.riskLevel === 'HIGH') e.highRisk += 1;
      byItem.set(p.itemId, e);
    }
    const itemNodes = await prisma.libraryNode.findMany({
      where: { projectId, type: 'CHECKLIST_ITEM', itemId: { in: [...byItem.keys()] } },
      select: { itemId: true, title: true, status: true },
    });
    const itemMeta = new Map(itemNodes.map((n) => [n.itemId, n]));

    const checklistItems = [...byItem.entries()]
      .map(([itemId, e]) => ({
        itemId,
        title: itemMeta.get(itemId)?.title ?? getItem(itemId)?.title ?? itemId,
        status: itemMeta.get(itemId)?.status ?? 'OPEN',
        workstreamId: e.workstreamId,
        workstreamTitle: getWorkstream(e.workstreamId)?.title ?? e.workstreamId,
        evidenceCount: e.count,
        highRiskCount: e.highRisk,
      }))
      .sort((a, b) => b.highRiskCount - a.highRiskCount || b.evidenceCount - a.evidenceCount);

    // --- clause types present, with how many peers each has elsewhere ---
    const ownClauseTypes = [...new Set(provisions.map((p) => p.clauseType).filter(Boolean))] as string[];
    const peerRows = ownClauseTypes.length
      ? await prisma.libraryNode.findMany({
          where: { projectId, type: 'PROVISION', clauseType: { in: ownClauseTypes } },
          select: { clauseType: true, sourceDocumentId: true },
        })
      : [];

    const peerDocsByClause = new Map<string, Set<string>>();
    for (const r of peerRows) {
      if (!r.clauseType || !r.sourceDocumentId) continue;
      if (!inScope(allowed, r.sourceDocumentId)) continue;
      const set = peerDocsByClause.get(r.clauseType) ?? new Set<string>();
      set.add(r.sourceDocumentId);
      peerDocsByClause.set(r.clauseType, set);
    }

    const clauseTypes = ownClauseTypes
      .map((clauseType) => ({
        clauseType,
        // Peers are the OTHER documents carrying this clause — the comparison set.
        peerDocumentCount: Math.max(0, (peerDocsByClause.get(clauseType)?.size ?? 1) - 1),
      }))
      .sort((a, b) => b.peerDocumentCount - a.peerDocumentCount);

    // --- documents sharing the most clause types with this one ---
    const sharedByDoc = new Map<string, Set<string>>();
    for (const r of peerRows) {
      if (!r.clauseType || !r.sourceDocumentId || r.sourceDocumentId === documentId) continue;
      if (!inScope(allowed, r.sourceDocumentId)) continue;
      const set = sharedByDoc.get(r.sourceDocumentId) ?? new Set<string>();
      set.add(r.clauseType);
      sharedByDoc.set(r.sourceDocumentId, set);
    }
    const topPeerIds = [...sharedByDoc.entries()]
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, MAX_RELATED_DOCUMENTS)
      .map(([id]) => id);
    const peerDocs = topPeerIds.length
      ? await prisma.document.findMany({
          where: { id: { in: topPeerIds } },
          select: { id: true, name: true, riskScore: true, riskLevel: true },
        })
      : [];
    const peerDocById = new Map(peerDocs.map((d) => [d.id, d]));
    const relatedDocuments = topPeerIds.flatMap((id) => {
      const d = peerDocById.get(id);
      if (!d) return [];
      return [
        {
          id: d.id,
          name: d.name,
          riskScore: d.riskScore,
          riskLevel: d.riskLevel,
          sharedClauseTypes: [...(sharedByDoc.get(id) ?? [])].sort(),
        },
      ];
    });

    // --- entities named by this document's provisions ---
    const provIds = provisions.map((p) => p.id);
    const mentions = provIds.length
      ? await prisma.libraryEdge.findMany({
          where: { projectId, edgeType: 'MENTIONS', fromNodeId: { in: provIds } },
          select: { toNodeId: true },
        })
      : [];
    const mentionCount = new Map<string, number>();
    for (const m of mentions) mentionCount.set(m.toNodeId, (mentionCount.get(m.toNodeId) ?? 0) + 1);
    const entityNodes = mentionCount.size
      ? await prisma.libraryNode.findMany({
          where: { projectId, id: { in: [...mentionCount.keys()] } },
          select: { id: true, title: true },
        })
      : [];
    const entities = entityNodes
      .map((e) => ({ id: e.id, title: e.title, mentionCount: mentionCount.get(e.id) ?? 0 }))
      .sort((a, b) => b.mentionCount - a.mentionCount)
      .slice(0, MAX_RELATED_ENTITIES);

    // --- notes filed against this document ---
    const noteEdges = await prisma.libraryEdge.findMany({
      where: { projectId, edgeType: 'SOURCED_FROM', toNodeId: { in: await sourceNodeIds(projectId, [documentId]) } },
      select: { fromNodeId: true },
    });
    const notes = noteEdges.length
      ? await prisma.libraryNode.findMany({
          where: { projectId, type: 'NOTE', id: { in: noteEdges.map((e) => e.fromNodeId) } },
          select: { id: true, title: true, itemId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    return {
      document,
      checklistItems,
      clauseTypes,
      relatedDocuments,
      entities,
      notes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        itemId: n.itemId,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  },

  /**
   * Every instance of one clause type across the deal, side by side.
   *
   * This is the question a reviewer actually asks — "show me all 101
   * indemnification clauses and tell me which are outliers" — and the peer
   * groups that answer it were already built at ingest (PEER_OF edges) but had
   * no way to be read. Ordered worst-first, because the outlier is the point.
   */
  async compareClause(
    projectId: string,
    clauseType: string,
    user: ScopeUser
  ): Promise<ClauseComparison> {
    const allowed = await allowedDocIds(user, projectId);

    const rows = (
      await prisma.libraryNode.findMany({
        where: { projectId, type: 'PROVISION', clauseType },
        select: {
          id: true,
          title: true,
          content: true,
          riskLevel: true,
          confidence: true,
          pageNumber: true,
          itemId: true,
          sourceDocumentId: true,
        },
      })
    ).filter((r) => inScope(allowed, r.sourceDocumentId));

    const docIds = [...new Set(rows.map((r) => r.sourceDocumentId).filter(Boolean))] as string[];
    const docs = docIds.length
      ? await prisma.document.findMany({
          where: { id: { in: docIds } },
          select: { id: true, name: true },
        })
      : [];
    const docName = new Map(docs.map((d) => [d.id, d.name]));

    const provisions = rows
      .map((r) => ({
        id: r.id,
        documentId: r.sourceDocumentId,
        documentName: r.sourceDocumentId ? (docName.get(r.sourceDocumentId) ?? 'Unknown') : 'Unknown',
        title: r.title,
        content: r.content,
        riskLevel: r.riskLevel,
        confidence: r.confidence,
        pageNumber: r.pageNumber,
        itemId: r.itemId,
      }))
      .sort(
        (a, b) =>
          (RISK_ORDER[b.riskLevel ?? ''] ?? 0) - (RISK_ORDER[a.riskLevel ?? ''] ?? 0) ||
          a.documentName.localeCompare(b.documentName)
      );

    const byRisk = { HIGH: 0, MEDIUM: 0, LOW: 0, UNSCORED: 0 };
    for (const p of provisions) {
      const key = (p.riskLevel ?? 'UNSCORED') as keyof typeof byRisk;
      if (key in byRisk) byRisk[key] += 1;
      else byRisk.UNSCORED += 1;
    }

    return {
      clauseType,
      itemId: provisions[0]?.itemId ?? null,
      provisions,
      stats: { total: provisions.length, documents: docIds.length, byRisk },
    };
  },

  /**
   * Which checklist questions a set of cited documents actually speak to.
   *
   * Used to pre-fill the filing target when saving an answer. Ranked by how many
   * of the cited documents share the item, so the suggestion reflects what the
   * answer drew on rather than everything those documents happen to mention.
   * Suggestions only — the user confirms, because a mis-filed conclusion in a
   * diligence record is worse than an unfiled one.
   */
  async suggestNoteItems(
    projectId: string,
    documentIds: string[],
    user: ScopeUser
  ): Promise<Array<{ itemId: string; title: string; workstreamTitle: string; documentCount: number }>> {
    const allowed = await allowedDocIds(user, projectId);
    const resolved = await resolveDocumentRefs(projectId, documentIds);
    const inScopeDocs = resolved.filter((id) => inScope(allowed, id));
    if (inScopeDocs.length === 0) return [];

    const rows = await prisma.libraryNode.findMany({
      where: {
        projectId,
        type: { in: [...EVIDENCE_TYPES] },
        sourceDocumentId: { in: inScopeDocs },
      },
      select: { itemId: true, workstreamId: true, sourceDocumentId: true },
    });

    const docsByItem = new Map<string, { docs: Set<string>; workstreamId: string }>();
    for (const r of rows) {
      if (!r.sourceDocumentId) continue;
      const e = docsByItem.get(r.itemId) ?? { docs: new Set<string>(), workstreamId: r.workstreamId };
      e.docs.add(r.sourceDocumentId);
      docsByItem.set(r.itemId, e);
    }

    const itemNodes = await prisma.libraryNode.findMany({
      where: { projectId, type: 'CHECKLIST_ITEM', itemId: { in: [...docsByItem.keys()] } },
      select: { itemId: true, title: true },
    });
    const titleByItem = new Map(itemNodes.map((n) => [n.itemId, n.title]));

    return [...docsByItem.entries()]
      .map(([itemId, e]) => ({
        itemId,
        title: titleByItem.get(itemId) ?? getItem(itemId)?.title ?? itemId,
        workstreamTitle: getWorkstream(e.workstreamId)?.title ?? e.workstreamId,
        documentCount: e.docs.size,
      }))
      .sort((a, b) => b.documentCount - a.documentCount || a.title.localeCompare(b.title))
      .slice(0, MAX_SUGGESTED_ITEMS);
  },

  /**
   * File an answer back into the library as a durable note.
   *
   * Without this, a good answer lives in chat scrollback and the next person to
   * ask re-derives it from scratch. A filed note becomes a first-class library
   * node: it appears under its checklist items, links back to the documents it
   * cited, and shows up in the deal map. It is explicitly not evidence — a
   * conclusion the team wrote must never quietly satisfy a diligence question
   * that no document actually answers.
   */
  async createNote(
    projectId: string,
    user: ScopeUser,
    input: { title: string; content: string; itemIds?: string[]; documentIds?: string[] }
  ): Promise<{ id: string; itemId: string; workstreamId: string; slug: string }> {
    const title = input.title.trim();
    if (!title) throw ApiError.badRequest('A note needs a title');
    if (!input.content.trim()) throw ApiError.badRequest('A note needs content');

    const scope = await resolveProjectScope(user, projectId);
    const allowed = await allowedDocIds(user, projectId);

    // Reject unknown item slugs up front — the checklist is static config, so
    // nothing downstream would catch a typo.
    const requestedItems = [...new Set(input.itemIds ?? [])];
    const unknown = requestedItems.filter((id) => !getItem(id));
    if (unknown.length > 0) {
      throw ApiError.badRequest(`Unknown checklist item(s): ${unknown.join(', ')}`);
    }
    const itemIds = requestedItems.filter(
      (id) => scope.isFullAccess || scope.allowedWorkstreamIds.includes(getItem(id)!.workstreamId)
    );
    if (requestedItems.length > 0 && itemIds.length === 0) {
      throw ApiError.forbidden('You do not have access to those checklist items');
    }

    // Unfiled notes land in triage rather than being rejected — a useful answer
    // that doesn't map cleanly to a question is still worth keeping.
    const primaryItemId = itemIds[0] ?? TRIAGE_ITEM_ID;
    const workstreamId = getItem(primaryItemId)?.workstreamId ?? TRIAGE_WORKSTREAM_ID;

    const documentIds = (await resolveDocumentRefs(projectId, input.documentIds ?? [])).filter(
      (id) => inScope(allowed, id)
    );

    const slug = `note-${slugify(title)}-${Date.now().toString(36)}`;
    const note = await prisma.libraryNode.create({
      data: {
        projectId,
        type: 'NOTE',
        workstreamId,
        itemId: primaryItemId,
        slug,
        title,
        content: input.content,
      },
      select: { id: true, itemId: true, workstreamId: true, slug: true },
    });

    const edges: {
      projectId: string;
      fromNodeId: string;
      toNodeId: string;
      edgeType: 'EVIDENCES' | 'SOURCED_FROM';
    }[] = [];

    // note → checklist item, for every item it answers (not just the primary).
    const itemNodes = itemIds.length
      ? await prisma.libraryNode.findMany({
          where: { projectId, type: 'CHECKLIST_ITEM', itemId: { in: itemIds } },
          select: { id: true },
        })
      : [];
    for (const n of itemNodes) {
      edges.push({ projectId, fromNodeId: note.id, toNodeId: n.id, edgeType: 'EVIDENCES' });
    }

    // note → source, so the note is reachable from the documents it cited.
    for (const sourceNodeId of await sourceNodeIds(projectId, documentIds)) {
      edges.push({ projectId, fromNodeId: note.id, toNodeId: sourceNodeId, edgeType: 'SOURCED_FROM' });
    }

    if (edges.length > 0) {
      await prisma.libraryEdge.createMany({ data: edges, skipDuplicates: true });
    }

    return note;
  },

  async getItemEvidence(
    projectId: string,
    itemId: string,
    user: ScopeUser
  ): Promise<LibraryGraph> {
    const allowed = await allowedDocIds(user, projectId);

    const itemNode = await prisma.libraryNode.findFirst({
      where: { projectId, type: 'CHECKLIST_ITEM', itemId },
      select: { id: true },
    });
    if (!itemNode) return { nodes: [], edges: [] };

    const provisions = (
      await prisma.libraryNode.findMany({
        // NOTE included so a filed answer is visible on the map alongside the
        // evidence it was drawn from.
        where: { projectId, itemId, type: { in: ['PROVISION', 'RISK', 'OBLIGATION', 'NOTE'] } },
        select: {
          id: true,
          title: true,
          type: true,
          clauseType: true,
          riskLevel: true,
          pageNumber: true,
          sourceDocumentId: true,
        },
      })
    ).filter((p) => inScope(allowed, p.sourceDocumentId));

    if (provisions.length === 0) return { nodes: [], edges: [] };

    const provIds = provisions.map((p) => p.id);
    const docIds = [...new Set(provisions.map((p) => p.sourceDocumentId).filter(Boolean))] as string[];

    const provIdSet = new Set(provIds);
    const [sourceNodes, mentions, peers] = await Promise.all([
      prisma.libraryNode.findMany({
        where: { projectId, type: 'SOURCE', sourceDocumentId: { in: docIds } },
        select: { id: true, sourceDocumentId: true },
      }),
      prisma.libraryEdge.findMany({
        where: { projectId, edgeType: 'MENTIONS', fromNodeId: { in: provIds } },
        select: { fromNodeId: true, toNodeId: true },
      }),
      // Peer links across same-clause-type provisions in other documents.
      prisma.libraryEdge.findMany({
        where: { projectId, edgeType: 'PEER_OF', fromNodeId: { in: provIds } },
        select: { fromNodeId: true, toNodeId: true },
      }),
    ]);
    const sourceNodeByDoc = new Map<string, string>();
    for (const s of sourceNodes) if (s.sourceDocumentId) sourceNodeByDoc.set(s.sourceDocumentId, s.id);

    const nodes: GraphNode[] = provisions.map((p) => ({
      id: p.id,
      type: p.type as GraphNode['type'],
      label: p.title,
      clauseType: p.clauseType,
      riskLevel: p.riskLevel,
      page: p.pageNumber,
      itemId,
    }));

    const edges: GraphEdge[] = [];
    for (const p of provisions) {
      edges.push({ id: `EVIDENCES:${p.id}->${itemNode.id}`, source: p.id, target: itemNode.id, type: 'EVIDENCES' });
      const srcNode = p.sourceDocumentId ? sourceNodeByDoc.get(p.sourceDocumentId) : undefined;
      if (srcNode) edges.push({ id: `SOURCED_FROM:${p.id}->${srcNode}`, source: p.id, target: srcNode, type: 'SOURCED_FROM' });
    }
    for (const m of mentions) {
      edges.push({ id: `MENTIONS:${m.fromNodeId}->${m.toNodeId}`, source: m.fromNodeId, target: m.toNodeId, type: 'MENTIONS' });
    }
    // Peer edges only when both endpoints are in the expanded provision set.
    for (const p of peers) {
      if (provIdSet.has(p.toNodeId)) {
        edges.push({ id: `PEER_OF:${p.fromNodeId}->${p.toNodeId}`, source: p.fromNodeId, target: p.toNodeId, type: 'PEER_OF' });
      }
    }

    return { nodes, edges };
  },
};
