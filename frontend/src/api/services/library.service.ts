import { apiClient } from '../client';

/** A node in the knowledge-library graph. Mirrors backend library.service GraphNode. */
export interface LibraryGraphNode {
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
  riskCategoryId?: string | null;
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
  riskCategories: TocWorkstream[];
  unfiled: { documentCount: number };
  totals: { documents: number; placed: number };
}

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
      riskCategoryId: string;
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
  stats: { documents: number; riskCategories: number };
}

export interface DocumentBacklinks {
  document: { id: string; name: string };
  riskCategories: Array<{
    riskCategoryId: string;
    title: string;
    status: string;
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

export interface SuggestedNoteItem {
  riskCategoryId: string;
  title: string;
  riskCategoryTitle: string;
  documentCount: number;
}

export interface CreateNoteInput {
  title: string;
  content: string;
  /** Risk categories this answer addresses. */
  riskCategoryIds?: string[];
  /** Documents the answer cited. */
  documentIds?: string[];
}

/**
 * Knowledge-library API. `getToc` is the risk-category tree the Data Room
 * navigates; `getGraph` is the same skeleton drawn as a graph, with sources and
 * entities opt-in. Item evidence is fetched on expand.
 */
export const libraryService = {
  /**
   * Risk category → risk category item tree with document counts.
   *
   * Counts sum to more than `totals.documents` by design: a document supplies
   * evidence to ~8 risk categories, so it is counted under each.
   */
  async getToc(projectId: string): Promise<LibraryToc> {
    return apiClient.get<LibraryToc>(`/projects/${projectId}/library/toc`);
  },

  /**
   * The base graph is risk categories only. Pass
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

  /** The deal as a network: root → risk categories → documents, plus peer links. */
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

  /** Risk categories the cited documents speak to — suggestions for filing. */
  async suggestNoteCategories(projectId: string, documentIds: string[]): Promise<SuggestedNoteItem[]> {
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
  ): Promise<{ id: string; riskCategoryId: string; slug: string }> {
    return apiClient.post(`/projects/${projectId}/library/notes`, input);
  },

  async getCategoryEvidence(projectId: string, riskCategoryId: string): Promise<LibraryGraph> {
    return apiClient.get<LibraryGraph>(
      `/projects/${projectId}/library/items/${encodeURIComponent(riskCategoryId)}/evidence`
    );
  },

  /** Run the gap-hunting lint pass; returns prioritized findings. */
  async runLint(projectId: string): Promise<LintResult> {
    return apiClient.post<LintResult>(`/projects/${projectId}/library/lint`, {});
  },
};
