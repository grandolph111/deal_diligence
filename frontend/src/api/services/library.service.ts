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

export interface TocItem {
  itemId: string;
  title: string;
  status: 'OPEN' | 'COVERED' | 'FLAGGED' | 'THIN' | 'NA' | string;
  documentCount: number;
  evidenceCount: number;
}

export interface TocWorkstream {
  id: string;
  title: string;
  order: number;
  documentCount: number;
  evidenceCount: number;
  items: TocItem[];
}

export interface LibraryToc {
  workstreams: TocWorkstream[];
  unfiled: { documentCount: number };
  totals: { documents: number; evidence: number };
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
