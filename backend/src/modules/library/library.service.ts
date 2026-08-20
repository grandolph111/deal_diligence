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
import { playbookService } from '../../services/playbook.service';
import {
  computeItemStatus,
  highPriorityClauseTypesFor,
} from '../../services/library-writer.service';
import { WORKSTREAMS, getWorkstream } from '../../integrations/library/checklist';

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
        where: { projectId, itemId, type: { in: ['PROVISION', 'RISK', 'OBLIGATION'] } },
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
