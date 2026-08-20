import { apiClient } from '../client';

/** A node in the knowledge-library graph. Mirrors backend library.service GraphNode. */
export interface LibraryGraphNode {
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

export interface LibraryGraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  weight?: number;
}

export interface LibraryGraph {
  nodes: LibraryGraphNode[];
  edges: LibraryGraphEdge[];
  truncated?: { sources: number; entities: number };
}

export type LintFindingType = 'GAP' | 'THIN' | 'RISK' | 'INCONSISTENCY' | 'SUGGESTION';

export interface LintFinding {
  type: LintFindingType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  itemId?: string | null;
  title: string;
  detail: string;
  suggestedAction?: string | null;
}

export interface LintResult {
  findings: LintFinding[];
  generatedAt: string;
  source: 'llm' | 'deterministic';
}

export interface TocWorkstream {
  id: string;
  title: string;
  order: number;
  /** Documents placed here — each document is counted exactly once. */
  documentCount: number;
}

export interface LibraryToc {
  workstreams: TocWorkstream[];
  unfiled: { documentCount: number };
  totals: { documents: number; placed: number };
}

export type DealMapNode =
  | { id: string; type: 'ROOT'; label: string; documentCount: number }
  | {
      id: string;
      type: 'WORKSTREAM';
      label: string;
      workstreamId: string;
      documentCount: number;
      order: number;
    }
  | {
      id: string;
      type: 'DOCUMENT';
      label: string;
      documentId: string;
      workstreamId: string;
      riskScore: number | null;
      riskLevel: string | null;
      documentType: string | null;
      evidenceCount: number;
      itemCount: number;
      analyzed: boolean;
    };

export interface DealMapEdge {
  id: string;
  source: string;
  target: string;
  type: 'CONTAINS' | 'PEER';
  weight: number;
}

export interface DealMap {
  nodes: DealMapNode[];
  edges: DealMapEdge[];
  stats: { documents: number; workstreams: number };
}

export interface DocumentBacklinks {
  document: { id: string; name: string };
  checklistItems: Array<{
    itemId: string;
    title: string;
    status: string;
    workstreamId: string;
    workstreamTitle: string;
    evidenceCount: number;
    highRiskCount: number;
  }>;
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

export interface SuggestedNoteItem {
  itemId: string;
  title: string;
  workstreamTitle: string;
  documentCount: number;
}

export interface CreateNoteInput {
  title: string;
  content: string;
  /** Checklist items this answer addresses. */
  itemIds?: string[];
  /** Documents the answer cited. */
  documentIds?: string[];
}

/**
 * Knowledge-library API. `getToc` is the checklist tree the Data Room
 * navigates; `getGraph` is the same skeleton drawn as a graph, with sources and
 * entities opt-in. Item evidence is fetched on expand.
 */
export const libraryService = {
  /**
   * Workstream → checklist item tree with document counts.
   *
   * Counts sum to more than `totals.documents` by design: a document supplies
   * evidence to ~8 workstreams, so it is counted under each.
   */
  async getToc(projectId: string): Promise<LibraryToc> {
    return apiClient.get<LibraryToc>(`/projects/${projectId}/library/toc`);
  },

  /**
   * The base graph is workstreams + checklist items only. Pass
   * `{ includeSources: true }` / `{ includeEntities: true }` to opt the heavier
   * tiers back in — at 100 documents that is ~180 nodes and reads as a hairball,
   * which is why it is off by default.
   */
  async getGraph(
    projectId: string,
    opts: { includeSources?: boolean; includeEntities?: boolean } = {}
  ): Promise<LibraryGraph> {
    const include = [
      opts.includeSources ? 'sources' : null,
      opts.includeEntities ? 'entities' : null,
    ].filter(Boolean);
    const qs = include.length > 0 ? `?include=${include.join(',')}` : '';
    return apiClient.get<LibraryGraph>(`/projects/${projectId}/library/graph${qs}`);
  },

  /** The deal as a network: root → workstreams → documents, plus peer links. */
  async getDealMap(projectId: string): Promise<DealMap> {
    return apiClient.get<DealMap>(`/projects/${projectId}/library/map`);
  },

  /** Everything in the deal that connects to one document. */
  async getDocumentBacklinks(projectId: string, documentId: string): Promise<DocumentBacklinks> {
    return apiClient.get<DocumentBacklinks>(
      `/projects/${projectId}/library/documents/${documentId}/backlinks`
    );
  },

  /** Every instance of one clause type across the deal, worst-risk first. */
  async compareClause(projectId: string, clauseType: string): Promise<ClauseComparison> {
    return apiClient.get<ClauseComparison>(
      `/projects/${projectId}/library/clauses/${encodeURIComponent(clauseType)}/compare`
    );
  },

  /** Checklist items the cited documents speak to — suggestions for filing. */
  async suggestNoteItems(projectId: string, documentIds: string[]): Promise<SuggestedNoteItem[]> {
    const res = await apiClient.post<{ items: SuggestedNoteItem[] }>(
      `/projects/${projectId}/library/notes/suggest`,
      { documentIds }
    );
    return res.items;
  },

  /** File an answer back into the library so it stops being chat scrollback. */
  async createNote(
    projectId: string,
    input: CreateNoteInput
  ): Promise<{ id: string; itemId: string; workstreamId: string; slug: string }> {
    return apiClient.post(`/projects/${projectId}/library/notes`, input);
  },

  async getItemEvidence(projectId: string, itemId: string): Promise<LibraryGraph> {
    return apiClient.get<LibraryGraph>(
      `/projects/${projectId}/library/items/${encodeURIComponent(itemId)}/evidence`
    );
  },

  /** Run the gap-hunting lint pass; returns prioritized findings. */
  async runLint(projectId: string): Promise<LintResult> {
    return apiClient.post<LintResult>(`/projects/${projectId}/library/lint`, {});
  },
};
