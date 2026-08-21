import { apiClient } from '../client';

export type ReportEntryStatus = 'AI_DRAFT' | 'IN_REVIEW' | 'VERIFIED';

export interface ReportIssue {
  id: string;
  title: string;
  clauseType: string | null;
  riskLevel: string | null;
  confidence: number | null;
  quote: string | null;
  pageNumber: number | null;
  documentId: string | null;
  documentName: string | null;
}

export interface ReportEntry {
  id: string;
  title: string;
  /** What Claude wrote. Kept alongside the reviewer's version as the audit record. */
  aiDraft: string;
  /** The reviewer's version. Null until someone edits it. */
  humanText: string | null;
  nextSteps: string | null;
  supplementalRequest: string | null;
  severity: string | null;
  status: ReportEntryStatus;
  taskId: string | null;
  taskTitle: string | null;
  verifiedBy: { id: string; name: string | null; email: string } | null;
  verifiedAt: string | null;
  updatedAt: string;
}

export interface ReportSection {
  riskCategoryId: string;
  title: string;
  reportTitle: string;
  order: number;
  description: string;
  status: string;
  factFed: boolean;
  issues: ReportIssue[];
  entries: ReportEntry[];
  actions: Array<{ id: string; title: string; status: string; assignees: string[] }>;
  documentCount: number;
  evidenceCount: number;
}

export interface DealReport {
  project: { id: string; name: string; description: string | null };
  generatedAt: string;
  scope: { isFullAccess: boolean; categoryCount: number };
  sections: ReportSection[];
  totals: {
    categories: number;
    flagged: number;
    open: number;
    issues: number;
    entries: number;
    verified: number;
  };
}

export interface UpdateEntryInput {
  humanText?: string | null;
  nextSteps?: string | null;
  supplementalRequest?: string | null;
  severity?: string | null;
  status?: ReportEntryStatus;
}

export const reportService = {
  /** The issues report. Flagged-only by default: this is the exceptions document. */
  async getReport(projectId: string, opts: { flaggedOnly?: boolean } = {}): Promise<DealReport> {
    const query = opts.flaggedOnly === false ? '?flaggedOnly=false' : '';
    return apiClient.get(`/projects/${projectId}/report${query}`);
  },

  async updateEntry(
    projectId: string,
    entryId: string,
    input: UpdateEntryInput
  ): Promise<ReportEntry> {
    return apiClient.patch(`/projects/${projectId}/report/entries/${entryId}`, input);
  },

  async createEntry(
    projectId: string,
    input: {
      riskCategoryId: string;
      title: string;
      humanText: string;
      nextSteps?: string | null;
      supplementalRequest?: string | null;
      severity?: string | null;
    }
  ): Promise<ReportEntry> {
    return apiClient.post(`/projects/${projectId}/report/entries`, input);
  },

  async deleteEntry(projectId: string, entryId: string): Promise<void> {
    return apiClient.delete(`/projects/${projectId}/report/entries/${entryId}`);
  },
};
