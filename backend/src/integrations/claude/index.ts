export { getClaudeClient, getModelId, isMock } from './client';
export { extractDocument } from './extract';
export { classifyDocument, classifyTextSample, slicePdfPages } from './classify';
export { verifyExtraction } from './verify';
export { generateDealBrief } from './deal-brief';
export { detectAnomalies } from './anomaly';
export { generateRiskReport, type AttachedDoc } from './riskReport';
export { runChat, type ChatTurn } from './chat';
export { reconcileGraph } from './reconcile';
export {
  pickExtractionModel,
  type ModelTier,
  type RouterDecision,
} from './model-router';
export {
  extractionResponseSchema,
  classifyResponseSchema,
  verifyResponseSchema,
  riskReportResponseSchema,
  chatResponseSchema,
  reconciliationResponseSchema,
  anomalyResponseSchema,
  briefResponseSchema,
  playbookSchema,
  emptyPlaybook,
  DOCUMENT_TYPES,
  VERIFICATION_ISSUE_TYPES,
  type DocumentType,
  type ExtractionResponse,
  type ClassifyResponse,
  type VerifyResponse,
  type VerificationIssueType,
  type RiskReportResponse,
  type ChatResponse,
  type ReconciliationResponse,
  type AnomalyResponse,
  type BriefResponse,
  type Playbook,
} from './schema';
export { renderPlaybookBlock, buildExtractionPrompt } from './prompts/extraction';
