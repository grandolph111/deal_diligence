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

/**
 * Knowledge-library graph API. The base graph is the tiered ToC (workstreams →
 * checklist items → sources + entities); item evidence is fetched on expand.
 */
export const libraryService = {
  async getGraph(projectId: string): Promise<LibraryGraph> {
    return apiClient.get<LibraryGraph>(`/projects/${projectId}/library/graph`);
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
