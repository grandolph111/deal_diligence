/**
 * Library read layer — serves the Data Room navigation and the Deal Map.
 *
 * Three shapes:
 *   getToc(projectId, user)                → risk category → checklist item tree
 *       with per-node document counts. The Data Room tree and the board scope
 *       picker both render this.
 *   getGraph(projectId, user, options)     → the BASE graph: risk category hubs →
 *       checklist items. Sources and entities are opt-in (see GraphOptions);
 *       provisions are always fetched on expand, never in the base tier.
 *   getCategoryEvidence(projectId, riskCategoryId, u)  → the PROVISION nodes under one item
 *       plus their edges, spliced into the base graph client-side on click.
 *
 * Everything is risk category-scoped via scope.service: checklist items always
 * show (they are the ToC skeleton, and an unanswered question is itself the
 * finding), but sources / provisions / entities are limited to documents the
 * caller can reach through their granted risk categories.
 */

import type { User } from '@prisma/client';
import { prisma } from '../../config/database';
import { resolveProjectScope } from '../../services/scope.service';
import { ApiError } from '../../utils/ApiError';
import { playbookService } from '../../services/playbook.service';
import {
  computeCategoryStatus,
  highPriorityClauseTypesFor,
} from '../../services/library-writer.service';
import { RISK_CATEGORIES, getRiskCategory, TRIAGE_CATEGORY_ID } from '../../integrations/library/risk-categories';

export interface GraphNode {
  id: string;
  type: 'RISK_CATEGORY' | 'PROVISION' | 'RISK' | 'OBLIGATION' | 'ENTITY' | 'SOURCE';
  label: string;
  status?: string | null;
  riskCategoryId?: string;
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

// The base graph is the checklist skeleton only: risk category hubs + their items
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
  // risk category. Documents with no evidence yet belong to no risk category and so
  // are visible only to full-access callers.
  if (scope.allowedRiskCategoryIds.length === 0) return new Set();
  const rows = await prisma.libraryNode.findMany({
    where: {
      projectId,
      type: { in: [...EVIDENCE_TYPES] },
      riskCategoryId: { in: scope.allowedRiskCategoryIds },
      sourceDocumentId: { not: null },
    },
    select: { sourceDocumentId: true },
    distinct: ['sourceDocumentId'],
  });
  return new Set(rows.map((r) => r.sourceDocumentId as string));
}

const inScope = (allowed: Set<string> | null, docId: string | null): boolean =>
  allowed === null || (docId != null && allowed.has(docId));

export interface TocRiskCategory {
  id: string;
  title: string;
  order: number;
  /** Documents placed here — each document is counted exactly once. */
  documentCount: number;
}

export interface LibraryToc {
  riskCategories: TocRiskCategory[];
  /** Documents with no evidence at all — never extracted, or extraction failed. */
  unfiled: { documentCount: number };
  totals: { documents: number; placed: number };
}

export interface DocumentBacklinks {
  document: { id: string; name: string };
  /** Risk categories this document supplies evidence to, worst-risk first. */
  riskCategories: Array<{
    riskCategoryId: string;
    title: string;
    status: string;
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
  notes: Array<{ id: string; title: string; riskCategoryId: string; createdAt: string }>;
}

export interface ClauseComparison {
  clauseType: string;
  riskCategoryId: string | null;
  provisions: Array<{
    id: string;
    documentId: string | null;
    documentName: string;
    title: string;
    content: string | null;
    riskLevel: string | null;
    confidence: number | null;
    pageNumber: number | null;
    riskCategoryId: string;
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

export type DealMapNode =
  | { id: string; type: 'ROOT'; label: string; documentCount: number }
  | {
      id: string;
      type: 'RISK_CATEGORY';
      label: string;
      riskCategoryId: string;
      documentCount: number;
      order: number;
    }
  | {
      id: string;
      type: 'DOCUMENT';
      label: string;
      documentId: string;
      /** The single risk category this document is placed under. */
      riskCategoryId: string;
      riskScore: number | null;
      riskLevel: string | null;
      documentType: string | null;
      evidenceCount: number;
      /** Distinct checklist questions this document answers. */
      itemCount: number;
      /** False when extraction never produced evidence. */
      analyzed: boolean;
    };

export interface DealMapEdge {
  id: string;
  source: string;
  target: string;
  type: 'CONTAINS' | 'PEER';
  /** For PEER: how many clause types the two documents share. */
  weight: number;
}

export interface DealMap {
  nodes: DealMapNode[];
  edges: DealMapEdge[];
  stats: { documents: number; riskCategories: number };
}

// Peer links are the associative trails between documents, but they are dense:
// 98 of 100 contracts carry a governing-law clause, so linking every pair that
// shares anything yields thousands of edges and a solid grey mat. Keeping only
// each document's strongest few neighbours preserves the shape of the
// relationships while staying legible.
const PEER_LINKS_PER_DOC = 3;
const MIN_SHARED_CLAUSES = 2;

/**
 * Undirected document↔document links, capped per document.
 *
 * Strength is the number of clause types two documents have in common — a
 * rough "these two contracts are built alike" signal, which is what makes
 * clusters legible on the map.
 */
function peerEdges(docs: Array<{ id: string; clauseTypes: Set<string> }>): DealMapEdge[] {
  // Inverted index: clause type → documents carrying it.
  const byClause = new Map<string, string[]>();
  for (const d of docs) {
    for (const c of d.clauseTypes) {
      const bucket = byClause.get(c) ?? [];
      bucket.push(d.id);
      byClause.set(c, bucket);
    }
  }

  const shared = new Map<string, Map<string, number>>();
  for (const ids of byClause.values()) {
    // A clause type shared by nearly every document says nothing about which
    // two are alike, and costs O(n²) to expand. Skip the ubiquitous ones.
    if (ids.length > Math.max(8, docs.length * 0.6)) continue;
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const [a, b] = [ids[i], ids[j]];
        const am = shared.get(a) ?? new Map<string, number>();
        am.set(b, (am.get(b) ?? 0) + 1);
        shared.set(a, am);
        const bm = shared.get(b) ?? new Map<string, number>();
        bm.set(a, (bm.get(a) ?? 0) + 1);
        shared.set(b, bm);
      }
    }
  }

  const seen = new Set<string>();
  const edges: DealMapEdge[] = [];
  for (const [a, partners] of shared) {
    const top = [...partners.entries()]
      .filter(([, n]) => n >= MIN_SHARED_CLAUSES)
      .sort((x, y) => y[1] - x[1])
      .slice(0, PEER_LINKS_PER_DOC);
    for (const [b, weight] of top) {
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ id: `p:${key}`, source: a, target: b, type: 'PEER', weight });
    }
  }
  return edges;
}

/**
 * Where each document lives: exactly one risk category.
 *
 * A document supplies evidence to ~8 risk categories, but showing it in all eight
 * made both the tree and the map read as noise — the same contract everywhere,
 * with no sense of what it primarily is. Placement picks the risk category it
 * contributes the most evidence to; the other relationships remain reachable
 * through the document's backlinks and the clause comparison.
 *
 * `granted` restricts the candidate risk categories for a scoped caller, so every
 * document they can reach still lands somewhere they can see.
 */
export async function primaryRiskCategoryByDocument(
  projectId: string,
  allowed: Set<string> | null,
  granted: Set<string> | null
): Promise<Map<string, string>> {
  const evidence = await prisma.libraryNode.findMany({
    where: { projectId, type: { in: [...EVIDENCE_TYPES] }, sourceDocumentId: { not: null } },
    select: { riskCategoryId: true, sourceDocumentId: true, riskLevel: true },
  });

  const counts = new Map<string, Map<string, { n: number; high: number }>>();
  for (const e of evidence) {
    const docId = e.sourceDocumentId as string;
    if (!inScope(allowed, docId)) continue;
    if (granted && !granted.has(e.riskCategoryId)) continue;
    const byWs = counts.get(docId) ?? new Map<string, { n: number; high: number }>();
    const cur = byWs.get(e.riskCategoryId) ?? { n: 0, high: 0 };
    cur.n += 1;
    if (e.riskLevel === 'HIGH') cur.high += 1;
    byWs.set(e.riskCategoryId, cur);
    counts.set(docId, byWs);
  }

  const order = new Map(RISK_CATEGORIES.map((w) => [w.id, w.order]));
  const out = new Map<string, string>();
  for (const [docId, byWs] of counts) {
    let best: string | null = null;
    let bestN = -1;
    let bestHigh = -1;
    for (const [ws, { n, high }] of byWs) {
      // Most evidence wins; ties break on high-risk density, then checklist order.
      const better =
        n > bestN ||
        (n === bestN && high > bestHigh) ||
        (n === bestN && high === bestHigh && (order.get(ws) ?? 99) < (order.get(best ?? '') ?? 99));
      if (better) {
        best = ws;
        bestN = n;
        bestHigh = high;
      }
    }
    if (best) out.set(docId, best);
  }
  return out;
}

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
   * The risk category tree the Data Room navigates and the board picker scopes to.
   *
   * Each document is counted once, under the risk category it primarily belongs
   * to, so the counts partition the deal rather than overlapping. `unfiled`
   * holds documents with no evidence at all — never extracted, or extraction
   * failed — which would otherwise vanish from a tree keyed on evidence.
   */
  async getToc(projectId: string, user: ScopeUser): Promise<LibraryToc> {
    const scope = await resolveProjectScope(user, projectId);
    const allowed = await allowedDocIds(user, projectId);
    // A restricted caller navigates only their granted risk categories. Listing the
    // others would advertise branches the documents API then refuses with 403.
    const grantedRiskCategories = scope.isFullAccess ? null : new Set(scope.allowedRiskCategoryIds);

    const [placement, projectDocs] = await Promise.all([
      primaryRiskCategoryByDocument(projectId, allowed, grantedRiskCategories),
      prisma.document.findMany({ where: { projectId }, select: { id: true } }),
    ]);

    const docsByRiskCategory = new Map<string, number>();
    for (const ws of placement.values()) {
      docsByRiskCategory.set(ws, (docsByRiskCategory.get(ws) ?? 0) + 1);
    }

    const riskCategories: TocRiskCategory[] = RISK_CATEGORIES.filter((ws) => {
      if (grantedRiskCategories && !grantedRiskCategories.has(ws.id)) return false;
      // The catch-all triage risk category is internal — surface it only once
      // something has actually landed there.
      if (ws.id === TRIAGE_WORKSTREAM_ID) return (docsByRiskCategory.get(ws.id) ?? 0) > 0;
      return true;
    }).map((ws) => ({
      id: ws.id,
      title: ws.title,
      order: ws.order,
      documentCount: docsByRiskCategory.get(ws.id) ?? 0,
    }));

    // Unfiled is a full-access notion: a document with no evidence belongs to no
    // risk category, so a restricted caller has no grant that could reach it.
    const visibleDocs = projectDocs.filter((d) => allowed === null || allowed.has(d.id));
    const unfiledCount =
      allowed === null ? visibleDocs.filter((d) => !placement.has(d.id)).length : 0;

    return {
      riskCategories,
      unfiled: { documentCount: unfiledCount },
      totals: { documents: visibleDocs.length, placed: placement.size },
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
        where: { projectId, type: 'RISK_CATEGORY' },
        select: { id: true, riskCategoryId: true, title: true, status: true },
      }),
      prisma.libraryNode.findMany({
        where: { projectId, type: 'SOURCE' },
        select: { id: true, title: true, sourceDocumentId: true, riskLevel: true },
      }),
      prisma.libraryNode.findMany({
        where: { projectId, type: { in: ['PROVISION', 'RISK', 'OBLIGATION'] } },
        select: {
          id: true,
          riskCategoryId: true,
          sourceDocumentId: true,
          riskLevel: true,
          confidence: true,
          clauseType: true,
        },
      }),
      prisma.libraryNode.findMany({
        where: { projectId, type: 'ENTITY' },
        select: { id: true, title: true, riskCategoryId: true },
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
    const evidenceByCategory = new Map<string, typeof provInScope>();
    for (const p of provInScope) {
      const arr = evidenceByCategory.get(p.riskCategoryId) ?? [];
      arr.push(p);
      evidenceByCategory.set(p.riskCategoryId, arr);
    }
    const scopedStatus = (riskCategoryId: string): string =>
      computeCategoryStatus(
        (evidenceByCategory.get(riskCategoryId) ?? []).map((e) => ({
          riskLevel: e.riskLevel,
          confidence: e.confidence,
          clauseType: e.clauseType,
        })),
        highPriority
      );

    const categoryNodeById = new Map(items.map((i) => [i.riskCategoryId, i.id]));

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

    // The catch-all "other issues / red flags" category is the report's own
    // bucket — surface it only once something actually lands there.
    const categoryVisible = (it: { riskCategoryId: string }): boolean =>
      it.riskCategoryId !== TRIAGE_CATEGORY_ID ||
      (evidenceByCategory.get(it.riskCategoryId)?.length ?? 0) > 0;

    // category ↔ source (aggregated from hidden provisions)
    const evidenceCount = new Map<string, number>();
    for (const p of provInScope) {
      evidenceCount.set(p.riskCategoryId, (evidenceCount.get(p.riskCategoryId) ?? 0) + 1);
      const categoryNode = categoryNodeById.get(p.riskCategoryId);
      const srcNode = p.sourceDocumentId ? sourceNodeByDoc.get(p.sourceDocumentId) : undefined;
      if (categoryNode && srcNode) push(categoryNode, srcNode, 'EVIDENCES');
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
    for (const item of items) {
      if (!categoryVisible(item)) continue;
      nodes.push({
        id: item.id,
        type: 'RISK_CATEGORY',
        label: item.title,
        status: scopedStatus(item.riskCategoryId),
        riskCategoryId: item.riskCategoryId,
        evidenceCount: evidenceCount.get(item.riskCategoryId) ?? 0,
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
      nodes.push({ id: e.id, type: 'ENTITY', label: e.title, riskCategoryId: e.riskCategoryId });
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
   * The deal map: one node per document, clustered under its risk category.
   *
   * An earlier map drew the taxonomy itself, which described the schema rather
   * than the deal. This draws the corpus: root → risk categories → every
   * document, with documents linked to each other where they share clause
   * language. A 100-document deal is ~120 nodes, which is a readable network.
   *
   * A document usually has evidence in several risk categories but is placed
   * under exactly one — whichever it contributes most evidence to. A node has to
   * sit somewhere, and "where does this contract mostly live" is the honest
   * answer; the rest stay reachable through the document's backlinks.
   */
  async getDealMap(projectId: string, user: ScopeUser): Promise<DealMap> {
    const allowed = await allowedDocIds(user, projectId);
    const scope = await resolveProjectScope(user, projectId);
    const grantedRiskCategories = scope.isFullAccess ? null : new Set(scope.allowedRiskCategoryIds);

    const [project, evidence, documents] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
      prisma.libraryNode.findMany({
        where: { projectId, type: { in: [...EVIDENCE_TYPES] }, sourceDocumentId: { not: null } },
        select: { riskCategoryId: true, sourceDocumentId: true, riskLevel: true, clauseType: true },
      }),
      prisma.document.findMany({
        where: { projectId },
        select: { id: true, name: true, riskScore: true, riskLevel: true, documentType: true },
      }),
    ]);

    const inScopeEvidence = evidence.filter((e) => inScope(allowed, e.sourceDocumentId));

    // --- per-document rollup: evidence by risk category, clause types, risk ---
    type Roll = {
      byRiskCategory: Map<string, number>;
      highRiskByRiskCategory: Map<string, number>;
      clauseTypes: Set<string>;
      items: Set<string>;
      evidenceCount: number;
    };
    const roll = new Map<string, Roll>();
    for (const e of inScopeEvidence) {
      const docId = e.sourceDocumentId as string;
      if (grantedRiskCategories && !grantedRiskCategories.has(e.riskCategoryId)) continue;
      const r =
        roll.get(docId) ??
        ({
          byRiskCategory: new Map(),
          highRiskByRiskCategory: new Map(),
          clauseTypes: new Set(),
          items: new Set(),
          evidenceCount: 0,
        } as Roll);
      r.byRiskCategory.set(e.riskCategoryId, (r.byRiskCategory.get(e.riskCategoryId) ?? 0) + 1);
      if (e.riskLevel === 'HIGH') {
        r.highRiskByRiskCategory.set(e.riskCategoryId, (r.highRiskByRiskCategory.get(e.riskCategoryId) ?? 0) + 1);
      }
      if (e.clauseType) r.clauseTypes.add(e.clauseType);
      r.items.add(e.riskCategoryId);
      r.evidenceCount += 1;
      roll.set(docId, r);
    }

    const wsOrder = new Map(RISK_CATEGORIES.map((w) => [w.id, w.order]));

    /** Most evidence wins; ties break on high-risk density, then checklist order. */
    const primaryRiskCategory = (r: Roll): string | null => {
      let best: string | null = null;
      let bestN = -1;
      let bestHigh = -1;
      for (const [ws, n] of r.byRiskCategory) {
        const high = r.highRiskByRiskCategory.get(ws) ?? 0;
        const better =
          n > bestN ||
          (n === bestN && high > bestHigh) ||
          (n === bestN && high === bestHigh && (wsOrder.get(ws) ?? 99) < (wsOrder.get(best ?? '') ?? 99));
        if (better) {
          best = ws;
          bestN = n;
          bestHigh = high;
        }
      }
      return best;
    };

    const nodes: DealMapNode[] = [];
    const edges: DealMapEdge[] = [];

    const ROOT_ID = 'root';
    const docsByRiskCategory = new Map<string, string[]>();
    const placedDocs: Array<{ id: string; clauseTypes: Set<string> }> = [];

    for (const d of documents) {
      if (!inScope(allowed, d.id)) continue;
      const r = roll.get(d.id);
      const ws = r ? primaryRiskCategory(r) : null;
      // A document with no in-scope evidence has no risk category to live under;
      // restricted callers must not see it at all, and for full-access callers
      // it belongs in triage rather than floating unattached.
      if (!ws) {
        if (!scope.isFullAccess) continue;
        const bucket = docsByRiskCategory.get(TRIAGE_WORKSTREAM_ID) ?? [];
        bucket.push(d.id);
        docsByRiskCategory.set(TRIAGE_WORKSTREAM_ID, bucket);
      } else {
        const bucket = docsByRiskCategory.get(ws) ?? [];
        bucket.push(d.id);
        docsByRiskCategory.set(ws, bucket);
      }

      nodes.push({
        id: d.id,
        type: 'DOCUMENT',
        label: d.name,
        documentId: d.id,
        riskCategoryId: ws ?? TRIAGE_WORKSTREAM_ID,
        riskScore: d.riskScore,
        riskLevel: d.riskLevel,
        documentType: d.documentType,
        evidenceCount: r?.evidenceCount ?? 0,
        itemCount: r?.items.size ?? 0,
        analyzed: !!r,
      });
      placedDocs.push({ id: d.id, clauseTypes: r?.clauseTypes ?? new Set() });
    }

    // --- risk category hubs (only those the caller may see) ---
    const visibleRiskCategories = RISK_CATEGORIES.filter((w) => {
      if (grantedRiskCategories && !grantedRiskCategories.has(w.id)) return false;
      if (w.id === TRIAGE_WORKSTREAM_ID) return (docsByRiskCategory.get(w.id)?.length ?? 0) > 0;
      return true;
    });

    for (const w of visibleRiskCategories) {
      const docIds = docsByRiskCategory.get(w.id) ?? [];
      nodes.push({
        id: `ws:${w.id}`,
        type: 'RISK_CATEGORY',
        label: w.title,
        riskCategoryId: w.id,
        documentCount: docIds.length,
        order: w.order,
      });
      edges.push({ id: `c:${ROOT_ID}->ws:${w.id}`, source: ROOT_ID, target: `ws:${w.id}`, type: 'CONTAINS', weight: 1 });
      for (const docId of docIds) {
        edges.push({ id: `c:ws:${w.id}->${docId}`, source: `ws:${w.id}`, target: docId, type: 'CONTAINS', weight: 1 });
      }
    }

    nodes.push({
      id: ROOT_ID,
      type: 'ROOT',
      label: project?.name ?? 'Deal',
      documentCount: placedDocs.length,
    });

    // --- document ↔ document links, from shared clause language ---
    edges.push(...peerEdges(placedDocs));

    return { nodes, edges, stats: { documents: placedDocs.length, riskCategories: visibleRiskCategories.length } };
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
      select: { id: true, riskCategoryId: true, clauseType: true, riskLevel: true },
    });

    // --- checklist items this document answers ---
    const byCategory = new Map<string, { count: number; riskCategoryId: string; highRisk: number }>();
    for (const p of provisions) {
      const e = byCategory.get(p.riskCategoryId) ?? { count: 0, riskCategoryId: p.riskCategoryId, highRisk: 0 };
      e.count += 1;
      if (p.riskLevel === 'HIGH') e.highRisk += 1;
      byCategory.set(p.riskCategoryId, e);
    }
    const categoryNodes = await prisma.libraryNode.findMany({
      where: { projectId, type: 'RISK_CATEGORY', riskCategoryId: { in: [...byCategory.keys()] } },
      select: { riskCategoryId: true, title: true, status: true },
    });
    const categoryMeta = new Map(categoryNodes.map((n) => [n.riskCategoryId, n]));

    const riskCategories = [...byCategory.entries()]
      .map(([riskCategoryId, e]) => ({
        riskCategoryId,
        title: categoryMeta.get(riskCategoryId)?.title ?? getRiskCategory(riskCategoryId)?.title ?? riskCategoryId,
        status: categoryMeta.get(riskCategoryId)?.status ?? 'OPEN',
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
          select: { id: true, title: true, riskCategoryId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    return {
      document,
      riskCategories,
      clauseTypes,
      relatedDocuments,
      entities,
      notes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        riskCategoryId: n.riskCategoryId,
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
          riskCategoryId: true,
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
        riskCategoryId: r.riskCategoryId,
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
      riskCategoryId: provisions[0]?.riskCategoryId ?? null,
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
  async suggestNoteCategories(
    projectId: string,
    documentIds: string[],
    user: ScopeUser
  ): Promise<Array<{ riskCategoryId: string; title: string; riskCategoryTitle: string; documentCount: number }>> {
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
      select: { riskCategoryId: true, sourceDocumentId: true },
    });

    const docsByCategory = new Map<string, { docs: Set<string>; riskCategoryId: string }>();
    for (const r of rows) {
      if (!r.sourceDocumentId) continue;
      const e = docsByCategory.get(r.riskCategoryId) ?? { docs: new Set<string>(), riskCategoryId: r.riskCategoryId };
      e.docs.add(r.sourceDocumentId);
      docsByCategory.set(r.riskCategoryId, e);
    }

    const categoryNodes = await prisma.libraryNode.findMany({
      where: { projectId, type: 'RISK_CATEGORY', riskCategoryId: { in: [...docsByCategory.keys()] } },
      select: { riskCategoryId: true, title: true },
    });
    const titleByItem = new Map(categoryNodes.map((n) => [n.riskCategoryId, n.title]));

    return [...docsByCategory.entries()]
      .map(([riskCategoryId, e]) => ({
        riskCategoryId,
        title: titleByItem.get(riskCategoryId) ?? getRiskCategory(riskCategoryId)?.title ?? riskCategoryId,
        riskCategoryTitle: getRiskCategory(e.riskCategoryId)?.title ?? e.riskCategoryId,
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
    input: { title: string; content: string; riskCategoryIds?: string[]; documentIds?: string[] }
  ): Promise<{ id: string; riskCategoryId: string; slug: string }> {
    const title = input.title.trim();
    if (!title) throw ApiError.badRequest('A note needs a title');
    if (!input.content.trim()) throw ApiError.badRequest('A note needs content');

    const scope = await resolveProjectScope(user, projectId);
    const allowed = await allowedDocIds(user, projectId);

    // Reject unknown category slugs up front — the taxonomy is static config, so
    // nothing downstream would catch a typo.
    const requested = [...new Set(input.riskCategoryIds ?? [])];
    const unknown = requested.filter((id) => !getRiskCategory(id));
    if (unknown.length > 0) {
      throw ApiError.badRequest(`Unknown risk categor(ies): ${unknown.join(', ')}`);
    }
    const riskCategoryIds = requested.filter(
      (id) => scope.isFullAccess || scope.allowedRiskCategoryIds.includes(id)
    );
    if (requested.length > 0 && riskCategoryIds.length === 0) {
      throw ApiError.forbidden('You do not have access to those risk categories');
    }

    // Unfiled notes land in the report's catch-all rather than being rejected —
    // a useful answer that doesn't map cleanly to a category is still worth keeping.
    const riskCategoryId = riskCategoryIds[0] ?? TRIAGE_CATEGORY_ID;

    const documentIds = (await resolveDocumentRefs(projectId, input.documentIds ?? [])).filter(
      (id) => inScope(allowed, id)
    );

    const slug = `note-${slugify(title)}-${Date.now().toString(36)}`;
    const note = await prisma.libraryNode.create({
      data: {
        projectId,
        type: 'NOTE',
        riskCategoryId,
        slug,
        title,
        content: input.content,
      },
      select: { id: true, riskCategoryId: true, slug: true },
    });

    const edges: {
      projectId: string;
      fromNodeId: string;
      toNodeId: string;
      edgeType: 'EVIDENCES' | 'SOURCED_FROM';
    }[] = [];

    // note → checklist item, for every item it answers (not just the primary).
    const categoryNodes = riskCategoryIds.length
      ? await prisma.libraryNode.findMany({
          where: { projectId, type: 'RISK_CATEGORY', riskCategoryId: { in: riskCategoryIds } },
          select: { id: true },
        })
      : [];
    for (const n of categoryNodes) {
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

  async getCategoryEvidence(
    projectId: string,
    riskCategoryId: string,
    user: ScopeUser
  ): Promise<LibraryGraph> {
    const allowed = await allowedDocIds(user, projectId);

    const categoryNode = await prisma.libraryNode.findFirst({
      where: { projectId, type: 'RISK_CATEGORY', riskCategoryId },
      select: { id: true },
    });
    if (!categoryNode) return { nodes: [], edges: [] };

    const provisions = (
      await prisma.libraryNode.findMany({
        // NOTE included so a filed answer is visible on the map alongside the
        // evidence it was drawn from.
        where: { projectId, riskCategoryId, type: { in: ['PROVISION', 'RISK', 'OBLIGATION', 'NOTE'] } },
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
      riskCategoryId,
    }));

    const edges: GraphEdge[] = [];
    for (const p of provisions) {
      edges.push({ id: `EVIDENCES:${p.id}->${categoryNode.id}`, source: p.id, target: categoryNode.id, type: 'EVIDENCES' });
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
