import { apiClient } from '../client';

export interface DashboardDocument {
  id: string;
  name: string;
  documentType: string | null;
  riskScore: number | null;
  riskLevel: string | null;
  riskSummary: string | null;
  extractionSummary: string | null;
  pageCount: number | null;
  dealValue: number | null;
  effectiveDate: string | null;
  governingLaw: string | null;
  currency: string | null;
  folderId: string | null;
  createdAt: string;
  confidenceScore: number | null;
  confidenceReason: string | null;
  verificationStatus: string | null;
}

export interface DashboardResponse {
  project: { id: string; name: string; description: string | null; createdAt: string };
  scope: { isFullAccess: boolean; allowedFolderCount: number | null };
  header: {
    portfolioRiskScore: number | null;
    dealValue: number | null;
    dealCurrency: string | null;
    effectiveDate: string | null;
    governingLaw: string | null;
  };
  riskStrip: {
    highRiskDocuments: number;
    openAiTasks: number;
    pendingSpecialistReviews: number;
    flaggedClauses: number;
  };
  documentsByRisk: DashboardDocument[];
  entitySummary: Array<{ entityType: string; count: number }>;
  masterEntities: Array<{
    id: string;
    entityType: string;
    canonicalName: string;
    aliases: string[] | null;
  }>;
  recentReports: Array<{
    id: string;
    title: string;
    aiReportSummary: string | null;
    aiCompletedAt: string | null;
    aiConfidenceScore: number | null;
    aiConfidenceReason: string | null;
    status: string;
  }>;
}

export const dashboardService = {
  async getProjectDashboard(projectId: string): Promise<DashboardResponse> {
    return apiClient.get<DashboardResponse>(`/projects/${projectId}/dashboard`);
  },
};
