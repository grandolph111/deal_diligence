/**
 * API Types matching backend Prisma schema and API responses
 */

// Role enum matching backend
export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';

// Task status enum matching backend
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'COMPLETE';

// Priority enum matching backend
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

// Subtask status enum matching backend
export type SubtaskStatus = 'TODO' | 'IN_PROGRESS' | 'COMPLETE';

// Base timestamps
export interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

// User model
export interface User extends Timestamps {
  id: string;
  auth0Id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

// Project model
export interface Project extends Timestamps {
  id: string;
  name: string;
  description: string | null;
  isArchived?: boolean;
  archivedAt?: string | null;
  // Counts returned from backend (flat properties)
  memberCount?: number;
  taskCount?: number;
  documentCount?: number;
  // User's role in project (only on list response)
  role?: Role;
  // Non-null once reconciliation has produced at least one scoped Deal Brief;
  // used by the dashboard to surface "Brief ready" vs. "Awaiting brief".
  briefManifest?: unknown | null;
}

// Granular permissions for members
export interface MemberPermissions {
  canAccessKanban?: boolean;
  canAccessVDR?: boolean;
  canUploadDocs?: boolean;
  restrictedToTags?: string[];
  restrictedFolders?: string[];
}

// Project member model
export interface ProjectMember extends Timestamps {
  id: string;
  projectId: string;
  userId: string;
  role: Role;
  permissions: MemberPermissions | null;
  invitedBy: string | null;
  invitedAt: string | null;
  acceptedAt: string | null;
  user: User;
}

// Pending invitation model
export interface PendingInvitation {
  id: string;
  projectId: string;
  email: string;
  role: Role;
  permissions: MemberPermissions | null;
  token: string;
  invitedBy: string;
  invitedAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  project?: {
    id: string;
    name: string;
    description: string | null;
  };
}

// Invitation result (returned when creating an invitation)
export interface InvitationResult {
  type: 'existing_user' | 'pending_invitation';
  member?: ProjectMember;
  invitation?: PendingInvitation;
}

// Tag model
export interface Tag extends Timestamps {
  id: string;
  projectId: string;
  name: string;
  color: string;
  _count?: {
    tasks: number;
  };
}

// Task assignee
export interface TaskAssignee {
  taskId: string;
  userId: string;
  assignedAt: string;
  user: User;
}

// Task tag
export interface TaskTag {
  taskId: string;
  tagId: string;
  tag: Tag;
}

// Comment model
export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author: Pick<User, 'id' | 'email' | 'name' | 'avatarUrl'>;
}

// Subtask model
export interface Subtask {
  id: string;
  taskId: string;
  title: string;
  description: string | null;
  status: SubtaskStatus;
  assigneeId: string | null;
  dueDate: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  assignee: Pick<User, 'id' | 'email' | 'name' | 'avatarUrl'> | null;
}

// AI task status
export type TaskAiStatus = 'IDLE' | 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

// Kanban board (multi-board per project)
export interface KanbanBoardSummary extends Timestamps {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  folders: Array<{ id: string; name: string }>;
  taskCount: number;
}

export interface KanbanBoardDetail extends Timestamps {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  folders: Array<{ id: string; name: string; parentId?: string | null }>;
}

export interface CreateBoardDto {
  name: string;
  description?: string | null;
  folderIds: string[];
}

export interface UpdateBoardDto {
  name?: string;
  description?: string | null;
  folderIds?: string[];
}

// Shared confidence band helper — keep in sync with backend/claude/schema.ts
export type ConfidenceBand = 'HIGH' | 'GOOD' | 'MODERATE' | 'LOW' | 'UNKNOWN';
export const confidenceBand = (score: number | null | undefined): ConfidenceBand => {
  if (score == null) return 'UNKNOWN';
  if (score >= 90) return 'HIGH';
  if (score >= 80) return 'GOOD';
  if (score >= 70) return 'MODERATE';
  return 'LOW';
};

// Task model
export interface Task extends Timestamps {
  id: string;
  projectId: string;
  createdById: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  riskCategory: string | null;
  assignedDate: string | null;
  dueDate: string | null;
  timeEstimate: number | null;
  // AI workflow
  aiPrompt: string | null;
  aiStatus: TaskAiStatus | null;
  aiReportS3Key: string | null;
  aiReportSummary: string | null;
  aiModel: string | null;
  aiConfidenceScore: number | null;
  aiConfidenceReason: string | null;
  aiStartedAt: string | null;
  aiCompletedAt: string | null;
  aiError: string | null;
  assignees: TaskAssignee[];
  tags: TaskTag[];
  createdBy: User;
  comments?: TaskComment[];
  subtasks?: Subtask[];
  commentCount?: number;
  subtaskCount?: number;
  attachmentCount?: number;
}

// Kanban board response (tasks grouped by status)
export interface KanbanBoard {
  TODO: Task[];
  IN_PROGRESS: Task[];
  IN_REVIEW: Task[];
  COMPLETE: Task[];
}

// API error response
export interface ApiError {
  status: 'error';
  message: string;
  error: string;  // Alias for message
  code?: string;
}

// Create/Update DTOs
export interface CreateProjectDto {
  name: string;
  description?: string;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
}

export interface InviteMemberDto {
  email: string;
  role: Role;
  permissions?: Partial<MemberPermissions>;
}

export interface UpdateMemberDto {
  role?: Role;
  permissions?: Partial<MemberPermissions>;
}

export interface CreateInvitationDto {
  email: string;
  role: Exclude<Role, 'OWNER'>;
  permissions?: Partial<MemberPermissions>;
}

export interface CreateTaskDto {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  riskCategory?: string;
  dueDate?: string;
  timeEstimate?: number;
  assigneeIds?: string[];
  tagIds?: string[];
  boardId?: string;
  aiPrompt?: string;
  attachedDocumentIds?: string[];
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  riskCategory?: string;
  dueDate?: string;
  timeEstimate?: number;
  aiPrompt?: string | null;
  attachedDocumentIds?: string[];
}

export interface UpdateTaskStatusDto {
  status: TaskStatus;
}

export interface CreateTagDto {
  name: string;
  color?: string;
}

// Task filter params
export interface TaskFilters {
  status?: TaskStatus;
  priority?: Priority;
  assigneeId?: string;
  tagId?: string;
  search?: string;
  dueBefore?: string;
  dueAfter?: string;
}

// Comment DTOs
export interface CreateCommentDto {
  content: string;
}

export interface UpdateCommentDto {
  content: string;
}

// Subtask DTOs
export interface CreateSubtaskDto {
  title: string;
  description?: string;
  status?: SubtaskStatus;
  assigneeId?: string;
  dueDate?: string;
}

export interface UpdateSubtaskDto {
  title?: string;
  description?: string | null;
  status?: SubtaskStatus;
  assigneeId?: string | null;
  dueDate?: string | null;
}

export interface ReorderSubtasksDto {
  subtaskIds: string[];
}

// ============================================
// VIRTUAL DATA ROOM (VDR)
// ============================================

// Document processing status
export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETE' | 'FAILED';

// Document type classification
export type DocumentType =
  // manual classification
  | 'CONTRACT'
  | 'FINANCIAL'
  | 'LEGAL'
  | 'CORPORATE'
  | 'TECHNICAL'
  | 'TAX'
  | 'HR'
  | 'IP'
  | 'COMMERCIAL'
  | 'OPERATIONAL'
  | 'OTHER'
  // extraction pipeline output
  | 'SPA'
  | 'APA'
  | 'LOI'
  | 'NDA'
  | 'EMPLOYMENT'
  | 'LEASE'
  | 'GENERIC';

// Risk level classification
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// Document type display labels and colors
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  CONTRACT: 'Contract',
  FINANCIAL: 'Financial',
  LEGAL: 'Legal',
  CORPORATE: 'Corporate',
  TECHNICAL: 'Technical',
  TAX: 'Tax',
  HR: 'HR',
  IP: 'IP/Patent',
  COMMERCIAL: 'Commercial',
  OPERATIONAL: 'Operational',
  OTHER: 'Other',
  // extraction-pipeline labels
  SPA: 'SPA (Stock Purchase)',
  APA: 'APA (Asset Purchase)',
  LOI: 'LOI',
  NDA: 'NDA',
  EMPLOYMENT: 'Employment',
  LEASE: 'Lease',
  GENERIC: 'Generic',
};

// Document-type badge colors — desaturated, coordinated with the navy/brass
// palette in index.css. Each tone sits between 35–55% luminance so white text
// stays legible, and no two adjacent types collide in hue.
export const DOCUMENT_TYPE_COLORS: Record<DocumentType, string> = {
  CONTRACT: '#1e3a5f',    // navy (brand primary)
  FINANCIAL: '#046c4e',   // deep forest
  LEGAL: '#4a4e8a',       // muted indigo
  CORPORATE: '#a87a3d',   // deep brass (brand accent)
  TECHNICAL: '#0e6e84',   // steel teal
  TAX: '#991b1b',         // oxblood
  HR: '#8a2f5a',          // mulberry
  IP: '#0f6e66',          // pine
  COMMERCIAL: '#c7a46c',  // warm brass
  OPERATIONAL: '#475569', // slate
  OTHER: '#6b7486',       // neutral gray
  SPA: '#1e3a5f',
  APA: '#1e3a5f',
  LOI: '#4a4e8a',
  NDA: '#8a2f5a',
  EMPLOYMENT: '#0e6e84',
  LEASE: '#a87a3d',
  GENERIC: '#6b7486',
};

// Risk level display labels and colors
export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  LOW: 'Low Risk',
  MEDIUM: 'Medium Risk',
  HIGH: 'High Risk',
  CRITICAL: 'Critical Risk',
};

// Risk-level colors — mirror the --risk-* tokens in index.css so chip/badge
// consumers stay in the same palette as the card variants.
export const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  LOW: '#047857',     // forest — matches --risk-low
  MEDIUM: '#b45309',  // burnt ochre — matches --risk-med
  HIGH: '#b91c1c',    // oxblood — matches --risk-high
  CRITICAL: '#7f1d1d', // deep oxblood
};

// Folder model
export interface Folder extends Timestamps {
  id: string;
  projectId: string;
  name: string;
  parentId: string | null;
  categoryType: string | null;
  isViewOnly: boolean;
  // Nested children (for tree view)
  children?: Folder[];
  // Document count (for flat list)
  _count?: {
    documents: number;
  };
}

// Folder tree node (recursive structure)
export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[];
}

// Document model
export type VerificationStatus = 'VERIFIED' | 'NEEDS_REVIEW' | 'FAILED';

export interface VerificationIssue {
  type: string;
  severity: string;
  description: string;
  location?: { section?: string; pageNumber?: number | null } | null;
  suggestedCorrection?: string | null;
}

export interface AnomalyFlag {
  documentId: string;
  clauseType: string;
  thisValue: string;
  peerValue: string;
  peerSize: number;
  reason: string;
}

export interface Document extends Timestamps {
  id: string;
  projectId: string;
  folderId: string | null;
  name: string;
  s3Key: string;
  mimeType: string;
  sizeBytes: number;
  processingStatus: DocumentStatus;
  // Extraction outputs
  extractionS3Key: string | null;
  extractionSummary: string | null;
  extractionModel: string | null;
  // Risk
  riskScore: number | null;
  riskLevel: string | null;
  riskSummary: string | null;
  // Extraction confidence (Claude self-reported, 0-100)
  confidenceScore: number | null;
  confidenceReason: string | null;
  // Deal metadata
  documentType: string | null;
  documentTypeConfidence: number | null;
  pageCount: number | null;
  dealValue: number | null;
  effectiveDate: string | null;
  governingLaw: string | null;
  currency: string | null;
  // Verification
  verificationStatus: VerificationStatus | null;
  verificationIssues: VerificationIssue[] | null;
  // Anomaly flags from cross-document reconciliation
  anomalyFlags: AnomalyFlag[] | null;
  isViewOnly: boolean;
  uploadedById: string;
  uploadedBy?: Pick<User, 'id' | 'email' | 'name' | 'avatarUrl'>;
  folder?: Pick<Folder, 'id' | 'name'>;
}

// Playbook (per-project standard positions conditioning extraction)
export interface PlaybookStandardPosition {
  clauseType: string;
  preferredLanguage?: string;
  fallbacks: string[];
  riskIfDeviates: 'LOW' | 'MEDIUM' | 'HIGH';
  notes?: string;
}

export interface Playbook {
  version: 1;
  dealContext?: string;
  redFlags: string[];
  standardPositions: PlaybookStandardPosition[];
}

// Deal brief response
export interface DealBrief {
  scopeKey: string;
  scopeLabel: string;
  markdown: string | null;
  updatedAt: string | null;
}

// Folder path breadcrumb
export interface FolderPathItem {
  id: string;
  name: string;
}

// VDR DTOs
export interface CreateFolderDto {
  name: string;
  parentId?: string | null;
  categoryType?: string;
  isViewOnly?: boolean;
}

export interface UpdateFolderDto {
  name?: string;
  isViewOnly?: boolean;
}

export interface MoveFolderDto {
  parentId: string | null;
}

// ============================================
// TASK-DOCUMENT LINKING
// ============================================

// Linked document with linking metadata
export interface LinkedDocument {
  id: string;
  documentId: string;
  taskId: string;
  linkedAt: string;
  linkedBy: Pick<User, 'id' | 'email' | 'name'>;
  document: Pick<Document, 'id' | 'name' | 'mimeType' | 'sizeBytes' | 'processingStatus' | 'folderId'> & {
    folder?: Pick<Folder, 'id' | 'name'>;
  };
}

// DTO for linking a document to a task
export interface LinkDocumentDto {
  documentId: string;
}

// ============================================
// VDR SEARCH
// ============================================

// Search type options
export type SearchType = 'keyword' | 'semantic' | 'hybrid';

// Search result snippet with highlighting
export interface SearchSnippet {
  text: string;
  highlights: Array<{
    start: number;
    end: number;
  }>;
  pageNumber?: number;
}

// Search result item
export interface SearchResult {
  document: Pick<Document, 'id' | 'name' | 'mimeType' | 'sizeBytes' | 'processingStatus' | 'documentType' | 'riskLevel' | 'folderId' | 'uploadedBy' | 'createdAt'> & {
    folder?: Pick<Folder, 'id' | 'name'>;
  };
  score: number;
  snippets: SearchSnippet[];
  matchedEntities?: string[];
  isRestricted?: boolean;
}

// Search response from API
export interface SearchResponse {
  results: SearchResult[];
  total: number;
  page: number;
  pageSize: number;
  query: string;
  searchType: SearchType;
  filters: SearchFilters;
}

// Search filters
export interface SearchFilters {
  folderId?: string | null;
  documentType?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  riskLevel?: string | null;
  entityName?: string | null;
  amountMin?: number | null;
  amountMax?: number | null;
}

// Search request DTO
export interface SearchRequestDto {
  query: string;
  searchType?: SearchType;
  folderId?: string | null;
  documentType?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  riskLevel?: string | null;
  entityName?: string | null;
  amountMin?: number | null;
  amountMax?: number | null;
  page?: number;
  pageSize?: number;
}

// Similar document item
export interface SimilarDocument {
  document: Pick<Document, 'id' | 'name' | 'mimeType' | 'sizeBytes' | 'processingStatus' | 'documentType' | 'riskLevel' | 'folderId' | 'uploadedBy' | 'createdAt'> & {
    folder?: Pick<Folder, 'id' | 'name'>;
  };
  similarityScore: number;
  sharedEntities?: string[];
}

// Response from find similar endpoint
export interface SimilarDocumentsResponse {
  documentId: string;
  similarDocuments: SimilarDocument[];
  total: number;
}

// ============================================
// ENTITY EXTRACTION
// ============================================

// Canonical entity types (aligned with backend extraction prompt).
// Keep in lockstep with backend/src/services/extraction.service.ts
// ENTITY_TYPE_ALIASES — the backend normalizes COMPANY→ORGANIZATION,
// AMOUNT→MONEY, etc. at write time so this list is exhaustive.
export const ENTITY_TYPES = [
  'PERSON',
  'ORGANIZATION',
  'DATE',
  'MONEY',
  'PERCENTAGE',
  'LOCATION',
  'CONTRACT_TERM',
  'CLAUSE_TYPE',
  'JURISDICTION',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

// Document entity (extracted from a document)
export interface DocumentEntity extends Timestamps {
  id: string;
  documentId: string;
  entityType: EntityType;
  text: string;
  normalizedText: string | null;
  confidence: number;
  needsReview: boolean;
  pageNumber: number | null;
  startOffset: number;
  endOffset: number;
  masterEntityId: string | null;
  masterEntity?: MasterEntity;
}

// Master entity (deduplicated/canonical entity)
export interface MasterEntity extends Timestamps {
  id: string;
  projectId: string;
  entityType: EntityType;
  canonicalName: string;
  aliases: string[];
  metadata: Record<string, unknown> | null;
}

// Entity statistics
export interface EntityStats {
  total: number;
  byType: Record<EntityType, number>;
  needsReview: number;
}

// Query params for listing entities
export interface ListEntitiesParams {
  entityType?: EntityType;
  needsReview?: boolean;
  minConfidence?: number;
  page?: number;
  limit?: number;
}

// Entity list response
export interface EntitiesListResponse {
  entities: DocumentEntity[];
  total: number;
  page: number;
  limit: number;
}

// Entity colors for display
export const ENTITY_TYPE_COLORS: Record<EntityType, string> = {
  PERSON: '#4CAF50',      // Green
  ORGANIZATION: '#2196F3', // Blue
  DATE: '#FF9800',         // Orange
  MONEY: '#9C27B0',        // Purple
  PERCENTAGE: '#00BCD4',   // Cyan
  LOCATION: '#F44336',     // Red
  CONTRACT_TERM: '#795548',// Brown
  CLAUSE_TYPE: '#607D8B',  // Blue Grey
  JURISDICTION: '#E91E63', // Pink
};

// Entity display labels
export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  PERSON: 'Person',
  ORGANIZATION: 'Organization',
  DATE: 'Date',
  MONEY: 'Money',
  PERCENTAGE: 'Percentage',
  LOCATION: 'Location',
  CONTRACT_TERM: 'Contract Term',
  CLAUSE_TYPE: 'Clause Type',
  JURISDICTION: 'Jurisdiction',
};

// ============================================
// CLAUSE DETECTION
// ============================================

// ----------------------------------------------------------------------
// CANONICAL CLAUSE VOCABULARY
//
// Single source of truth. Mirrors the CUAD-aligned list in
// backend/src/integrations/claude/prompts/extraction/shared.ts —
// when adding a clause type, edit that prompt AND this constant together.
// TypeScript's Record<ClauseType, …> below enforces that every map
// (labels, colors, icons) has an entry for every type.
// ----------------------------------------------------------------------

export const CLAUSE_TYPES = [
  // Dates
  'AGREEMENT_DATE',
  'EFFECTIVE_DATE',
  'EXPIRATION_DATE',
  // Core M&A risk
  'CAP_ON_LIABILITY',
  'UNCAPPED_LIABILITY',
  'INDEMNIFICATION',
  'REPRESENTATIONS_AND_WARRANTIES',
  'CHANGE_OF_CONTROL',
  'TERMINATION_FOR_CONVENIENCE',
  'MATERIAL_ADVERSE_CHANGE',
  'CONDITIONS_PRECEDENT',
  'COVENANTS',
  'COVENANT_NOT_TO_SUE',
  // Restrictions
  'EXCLUSIVITY',
  'NON_COMPETE',
  'NON_DISPARAGEMENT',
  'NO_SOLICIT_CUSTOMERS',
  'NO_SOLICIT_EMPLOYEES',
  'VOLUME_RESTRICTION',
  'PRICE_RESTRICTIONS',
  'COMPETITIVE_RESTRICTION_EXCEPTION',
  'ANTI_ASSIGNMENT',
  // IP / license
  'IP_OWNERSHIP_ASSIGNMENT',
  'JOINT_IP_OWNERSHIP',
  'LICENSE_GRANT',
  'IRREVOCABLE_OR_PERPETUAL_LICENSE',
  'NON_TRANSFERABLE_LICENSE',
  'UNLIMITED_LICENSE',
  'SOURCE_CODE_ESCROW',
  // Commercial
  'MINIMUM_COMMITMENT',
  'REVENUE_OR_PROFIT_SHARING',
  'MOST_FAVORED_NATION',
  'ROFR_ROFO_ROFN',
  'THIRD_PARTY_BENEFICIARY',
  // Payment / warranty
  'PAYMENT_TERMS',
  'LIQUIDATED_DAMAGES',
  'WARRANTY_DURATION',
  // Renewal
  'RENEWAL_TERM',
  'NOTICE_PERIOD_TO_TERMINATE_RENEWAL',
  'POST_TERMINATION_SERVICES',
  // Ops
  'AUDIT_RIGHTS',
  'INSURANCE',
  'CONFIDENTIALITY',
  // Jurisdiction / law
  'GOVERNING_LAW',
  'DISPUTE_RESOLUTION',
  'FORCE_MAJEURE',
  // Rollup
  'ASSIGNMENT',
  'INTELLECTUAL_PROPERTY',
  'LIABILITY',
  'TERMINATION',
  'WARRANTY',
  'REPRESENTATIONS',
  'OTHER',
] as const;
export type ClauseType = (typeof CLAUSE_TYPES)[number];

// Human-readable labels. Record<ClauseType, …> forces exhaustiveness.
export const CLAUSE_TYPE_LABELS: Record<ClauseType, string> = {
  AGREEMENT_DATE: 'Agreement Date',
  EFFECTIVE_DATE: 'Effective Date',
  EXPIRATION_DATE: 'Expiration Date',
  CAP_ON_LIABILITY: 'Cap on Liability',
  UNCAPPED_LIABILITY: 'Uncapped Liability',
  INDEMNIFICATION: 'Indemnification',
  REPRESENTATIONS_AND_WARRANTIES: 'Representations & Warranties',
  CHANGE_OF_CONTROL: 'Change of Control',
  TERMINATION_FOR_CONVENIENCE: 'Termination for Convenience',
  MATERIAL_ADVERSE_CHANGE: 'Material Adverse Change',
  CONDITIONS_PRECEDENT: 'Conditions Precedent',
  COVENANTS: 'Covenants',
  COVENANT_NOT_TO_SUE: 'Covenant Not to Sue',
  EXCLUSIVITY: 'Exclusivity',
  NON_COMPETE: 'Non-Compete',
  NON_DISPARAGEMENT: 'Non-Disparagement',
  NO_SOLICIT_CUSTOMERS: 'No-Solicit Customers',
  NO_SOLICIT_EMPLOYEES: 'No-Solicit Employees',
  VOLUME_RESTRICTION: 'Volume Restriction',
  PRICE_RESTRICTIONS: 'Price Restrictions',
  COMPETITIVE_RESTRICTION_EXCEPTION: 'Competitive Restriction Exception',
  ANTI_ASSIGNMENT: 'Anti-Assignment',
  IP_OWNERSHIP_ASSIGNMENT: 'IP Ownership Assignment',
  JOINT_IP_OWNERSHIP: 'Joint IP Ownership',
  LICENSE_GRANT: 'License Grant',
  IRREVOCABLE_OR_PERPETUAL_LICENSE: 'Irrevocable / Perpetual License',
  NON_TRANSFERABLE_LICENSE: 'Non-Transferable License',
  UNLIMITED_LICENSE: 'Unlimited License',
  SOURCE_CODE_ESCROW: 'Source Code Escrow',
  MINIMUM_COMMITMENT: 'Minimum Commitment',
  REVENUE_OR_PROFIT_SHARING: 'Revenue / Profit Sharing',
  MOST_FAVORED_NATION: 'Most Favored Nation',
  ROFR_ROFO_ROFN: 'ROFR / ROFO / ROFN',
  THIRD_PARTY_BENEFICIARY: 'Third-Party Beneficiary',
  PAYMENT_TERMS: 'Payment Terms',
  LIQUIDATED_DAMAGES: 'Liquidated Damages',
  WARRANTY_DURATION: 'Warranty Duration',
  RENEWAL_TERM: 'Renewal Term',
  NOTICE_PERIOD_TO_TERMINATE_RENEWAL: 'Notice Period to Terminate Renewal',
  POST_TERMINATION_SERVICES: 'Post-Termination Services',
  AUDIT_RIGHTS: 'Audit Rights',
  INSURANCE: 'Insurance',
  CONFIDENTIALITY: 'Confidentiality',
  GOVERNING_LAW: 'Governing Law',
  DISPUTE_RESOLUTION: 'Dispute Resolution',
  FORCE_MAJEURE: 'Force Majeure',
  ASSIGNMENT: 'Assignment',
  INTELLECTUAL_PROPERTY: 'Intellectual Property',
  LIABILITY: 'Liability',
  TERMINATION: 'Termination',
  WARRANTY: 'Warranty',
  REPRESENTATIONS: 'Representations',
  OTHER: 'Other',
};

// Muted, semantically grouped color palette.
export const CLAUSE_TYPE_COLORS: Record<ClauseType, string> = {
  AGREEMENT_DATE: '#0ea5e9',
  EFFECTIVE_DATE: '#0ea5e9',
  EXPIRATION_DATE: '#0ea5e9',
  CAP_ON_LIABILITY: '#f97316',
  UNCAPPED_LIABILITY: '#dc2626',
  INDEMNIFICATION: '#f59e0b',
  REPRESENTATIONS_AND_WARRANTIES: '#ec4899',
  CHANGE_OF_CONTROL: '#14b8a6',
  TERMINATION_FOR_CONVENIENCE: '#ef4444',
  MATERIAL_ADVERSE_CHANGE: '#dc2626',
  CONDITIONS_PRECEDENT: '#78716c',
  COVENANTS: '#f43f5e',
  COVENANT_NOT_TO_SUE: '#f43f5e',
  EXCLUSIVITY: '#22c55e',
  NON_COMPETE: '#22c55e',
  NON_DISPARAGEMENT: '#22c55e',
  NO_SOLICIT_CUSTOMERS: '#22c55e',
  NO_SOLICIT_EMPLOYEES: '#22c55e',
  VOLUME_RESTRICTION: '#84cc16',
  PRICE_RESTRICTIONS: '#84cc16',
  COMPETITIVE_RESTRICTION_EXCEPTION: '#84cc16',
  ANTI_ASSIGNMENT: '#06b6d4',
  IP_OWNERSHIP_ASSIGNMENT: '#a855f7',
  JOINT_IP_OWNERSHIP: '#a855f7',
  LICENSE_GRANT: '#a855f7',
  IRREVOCABLE_OR_PERPETUAL_LICENSE: '#a855f7',
  NON_TRANSFERABLE_LICENSE: '#a855f7',
  UNLIMITED_LICENSE: '#a855f7',
  SOURCE_CODE_ESCROW: '#a855f7',
  MINIMUM_COMMITMENT: '#6366f1',
  REVENUE_OR_PROFIT_SHARING: '#6366f1',
  MOST_FAVORED_NATION: '#6366f1',
  ROFR_ROFO_ROFN: '#6366f1',
  THIRD_PARTY_BENEFICIARY: '#6366f1',
  PAYMENT_TERMS: '#6366f1',
  LIQUIDATED_DAMAGES: '#6366f1',
  WARRANTY_DURATION: '#8b5cf6',
  RENEWAL_TERM: '#06b6d4',
  NOTICE_PERIOD_TO_TERMINATE_RENEWAL: '#06b6d4',
  POST_TERMINATION_SERVICES: '#06b6d4',
  AUDIT_RIGHTS: '#78716c',
  INSURANCE: '#0ea5e9',
  CONFIDENTIALITY: '#84cc16',
  GOVERNING_LAW: '#3b82f6',
  DISPUTE_RESOLUTION: '#3b82f6',
  FORCE_MAJEURE: '#d946ef',
  ASSIGNMENT: '#06b6d4',
  INTELLECTUAL_PROPERTY: '#a855f7',
  LIABILITY: '#f97316',
  TERMINATION: '#ef4444',
  WARRANTY: '#8b5cf6',
  REPRESENTATIONS: '#ec4899',
  OTHER: '#6b7280',
};

// Document clause/annotation model
export interface DocumentClause extends Timestamps {
  id: string;
  documentId: string;
  annotationType: 'CLAUSE' | 'RISK_FLAG' | 'NOTE' | 'VERIFICATION';
  clauseType: ClauseType | null;
  title: string | null;
  content: string;
  pageNumber: number | null;
  startOffset: number | null;
  endOffset: number | null;
  confidence: number;
  riskLevel: RiskLevel | null;
  source: 'berrydb' | 'manual' | null;
  isVerified: boolean;
  verifiedById: string | null;
  verifiedAt: string | null;
  verificationNote: string | null;
  isRejected: boolean;
  rejectedById: string | null;
  rejectedAt: string | null;
  rejectionNote: string | null;
  verifiedBy?: Pick<User, 'id' | 'email' | 'name'> | null;
  rejectedBy?: Pick<User, 'id' | 'email' | 'name'> | null;
  document?: Pick<Document, 'id' | 'name' | 'folderId'>;
}

// Clause statistics
export interface ClauseStats {
  documentId: string;
  totalClauses: number;
  riskFlaggedCount: number;
  verifiedCount: number;
  byType: Array<{ type: string; count: number }>;
  byRiskLevel: Array<{ level: string; count: number }>;
}

// Query params for listing clauses
export interface ListClausesParams {
  clauseType?: ClauseType;
  riskLevel?: RiskLevel;
  isRiskFlagged?: boolean;
  isVerified?: boolean;
  page?: number;
  limit?: number;
}

// Clauses list response
export interface ClausesListResponse {
  clauses: DocumentClause[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// MASTER ENTITIES (Knowledge Graph)
// ============================================

// Master entity with document count
export interface MasterEntityWithCount extends MasterEntity {
  documentCount: number;
  _count?: {
    documentEntities: number;
  };
}

// Master entity list response
export interface MasterEntityListResponse {
  entities: MasterEntityWithCount[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Document entity mention (from a master entity)
export interface DocumentEntityMention {
  id: string;
  text: string;
  pageNumber: number | null;
  confidence: number;
}

// Document with mentions from a master entity
export interface DocumentWithMentions {
  document: Pick<Document, 'id' | 'name' | 'folderId' | 'documentType' | 'createdAt'>;
  mentions: DocumentEntityMention[];
}

// Master entity detail with relationships and document entities
export interface MasterEntityDetail extends MasterEntityWithCount {
  documentEntities: Array<{
    id: string;
    text: string;
    pageNumber: number | null;
    confidence: number;
    documentId: string;
    document: Pick<Document, 'id' | 'name' | 'folderId'>;
  }>;
  relatedEntities: Array<{
    targetEntity: {
      id: string;
      canonicalName: string;
      entityType: EntityType;
    };
  }>;
  relatedFrom: Array<{
    sourceEntity: {
      id: string;
      canonicalName: string;
      entityType: EntityType;
    };
  }>;
}

// Master entity documents response
export interface MasterEntityDocumentsResponse {
  entity: {
    id: string;
    canonicalName: string;
    entityType: EntityType;
  };
  documents: DocumentWithMentions[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Duplicate pair for deduplication suggestions
export interface DuplicatePair {
  entity1: {
    id: string;
    canonicalName: string;
    entityType: EntityType;
  };
  entity2: {
    id: string;
    canonicalName: string;
    entityType: EntityType;
  };
  similarity: number;
}

// Response from find duplicates endpoint
export interface DuplicatePairsResponse {
  duplicates: DuplicatePair[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Deduplication statistics
export interface DeduplicationStats {
  processed: number;
  newMasterEntities: number;
  linkedToExisting: number;
  skipped: number;
}

// ============================================
// AI CHAT (Phase 3)
// ============================================

// Chat message role
export type ChatMessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';

// Citation from AI response
export interface Citation {
  documentId: string;
  filename: string;
  pageNumber: number | null;
  textExcerpt: string;
  relevanceScore: number;
}

// Chat message model
export interface ChatMessage {
  id: string;
  conversationId: string;
  role: ChatMessageRole;
  content: string;
  citations: Citation[] | null;
  createdAt: string;
}

// Chat conversation model
export interface ChatConversation extends Timestamps {
  id: string;
  projectId: string;
  title: string | null;
  createdById: string;
  createdBy: Pick<User, 'id' | 'email' | 'name' | 'avatarUrl'>;
  messages?: ChatMessage[];
  messageCount: number;
}

// Chat DTOs
export interface CreateConversationDto {
  title?: string;
}

export interface UpdateConversationDto {
  title: string;
}

export interface SendMessageDto {
  content: string;
  documentIds?: string[];
}

// Response from sending a message
export interface SendMessageResponse {
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
  citations: Citation[];
}
