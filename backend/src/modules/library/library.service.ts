/**
 * Library read layer — serves the knowledge-graph tab.
 *
 * Two shapes:
 *   getGraph(projectId, user)              → the tiered BASE graph (workstream
 *       hubs → checklist items → sources + entities). Provisions are collapsed
 *       into aggregate item↔source and source↔entity edges, not returned as
 *       nodes — they are fetched on expand.
 *   getItemEvidence(projectId, itemId, u)  → the PROVISION nodes under one item
 *       plus their edges, spliced into the base graph client-side on click.
 *
 * Everything is folder-scoped via scope.service: checklist items always show
 * (they are the ToC skeleton), but sources / provisions / entities are limited
 * to documents the caller can access.
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

// The base graph must stay bounded so it renders at 10K+ documents. Workstreams +
// items are always shown (~63); sources + entities are capped to the most material
// (sources by risk, entities by mention degree). The rest are reachable by
// expanding items. Env-overridable.
const MAX_GRAPH_SOURCES = Math.max(10, parseInt(process.env.GRAPH_MAX_SOURCES || '60', 10));
const MAX_GRAPH_ENTITIES = Math.max(10, parseInt(process.env.GRAPH_MAX_ENTITIES || '60', 10));
const RISK_ORDER: Record<string, number> = { HIGH: 3, MEDIUM: 2, LOW: 1 };

type ScopeUser = Pick<User, 'id' | 'platformRole' | 'companyId'>;

/** Resolve the set of document ids the caller may see, or null for full access. */
async function allowedDocIds(user: ScopeUser, projectId: string): Promise<Set<string> | null> {
  const scope = await resolveProjectScope(user, projectId);
  if (scope.isFullAccess) return null;
  // Restricted: only docs inside granted folders (root/null-folder docs excluded,
  // matching documents.service scoping).
  const docs = await prisma.document.findMany({
    where: { projectId, folderId: { in: scope.allowedFolderIds } },
    select: { id: true },
  });
  return new Set(docs.map((d) => d.id));
}

const inScope = (allowed: Set<string> | null, docId: string | null): boolean =>
  allowed === null || (docId != null && allowed.has(docId));

export const libraryService = {
  async getGraph(projectId: string, user: ScopeUser): Promise<LibraryGraph> {
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
    const sourcesShown = sourcesRanked.slice(0, MAX_GRAPH_SOURCES);
    const entitiesShown = entitiesRanked.slice(0, MAX_GRAPH_ENTITIES);

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
