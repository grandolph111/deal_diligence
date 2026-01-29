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
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: Priority;
  riskCategory?: string;
  dueDate?: string;
  timeEstimate?: number;
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
  | 'OTHER';

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
};

export const DOCUMENT_TYPE_COLORS: Record<DocumentType, string> = {
  CONTRACT: '#3b82f6',    // blue
  FINANCIAL: '#10b981',   // green
  LEGAL: '#8b5cf6',       // purple
  CORPORATE: '#f59e0b',   // amber
  TECHNICAL: '#06b6d4',   // cyan
  TAX: '#ef4444',         // red
  HR: '#ec4899',          // pink
  IP: '#14b8a6',          // teal
  COMMERCIAL: '#f97316',  // orange
  OPERATIONAL: '#6366f1', // indigo
  OTHER: '#6b7280',       // gray
};

// Risk level display labels and colors
export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  LOW: 'Low Risk',
  MEDIUM: 'Medium Risk',
  HIGH: 'High Risk',
  CRITICAL: 'Critical Risk',
};

export const RISK_LEVEL_COLORS: Record<RiskLevel, string> = {
  LOW: '#10b981',     // green
  MEDIUM: '#f59e0b',  // amber
  HIGH: '#ef4444',    // red
  CRITICAL: '#dc2626', // dark red
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
export interface Document extends Timestamps {
  id: string;
  projectId: string;
  folderId: string | null;
  name: string;
  s3Key: string;
  mimeType: string;
  sizeBytes: number;
  berryDbId: string | null;
  processingStatus: DocumentStatus;
  documentType: string | null;
  riskLevel: string | null;
  pageCount: number | null;
  isViewOnly: boolean;
  uploadedById: string;
  uploadedBy?: Pick<User, 'id' | 'email' | 'name' | 'avatarUrl'>;
  folder?: Pick<Folder, 'id' | 'name'>;
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

// Entity types that can be extracted from documents
export type EntityType =
  | 'PERSON'
  | 'ORGANIZATION'
  | 'DATE'
  | 'MONEY'
  | 'PERCENTAGE'
  | 'LOCATION'
  | 'CONTRACT_TERM'
  | 'CLAUSE_TYPE'
  | 'JURISDICTION';

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

// Clause types that can be detected in documents
export type ClauseType =
  | 'TERMINATION'
  | 'LIABILITY'
  | 'INDEMNIFICATION'
  | 'CONFIDENTIALITY'
  | 'NON_COMPETE'
  | 'CHANGE_OF_CONTROL'
  | 'ASSIGNMENT'
  | 'GOVERNING_LAW'
  | 'DISPUTE_RESOLUTION'
  | 'PAYMENT_TERMS'
  | 'WARRANTY'
  | 'INTELLECTUAL_PROPERTY'
  | 'FORCE_MAJEURE'
  | 'REPRESENTATIONS'
  | 'COVENANTS'
  | 'CONDITIONS_PRECEDENT'
  | 'MATERIAL_ADVERSE_CHANGE'
  | 'OTHER';

// Clause display labels
export const CLAUSE_TYPE_LABELS: Record<ClauseType, string> = {
  TERMINATION: 'Termination',
  LIABILITY: 'Liability',
  INDEMNIFICATION: 'Indemnification',
  CONFIDENTIALITY: 'Confidentiality',
  NON_COMPETE: 'Non-Compete',
  CHANGE_OF_CONTROL: 'Change of Control',
  ASSIGNMENT: 'Assignment',
  GOVERNING_LAW: 'Governing Law',
  DISPUTE_RESOLUTION: 'Dispute Resolution',
  PAYMENT_TERMS: 'Payment Terms',
  WARRANTY: 'Warranty',
  INTELLECTUAL_PROPERTY: 'Intellectual Property',
  FORCE_MAJEURE: 'Force Majeure',
  REPRESENTATIONS: 'Representations',
  COVENANTS: 'Covenants',
  CONDITIONS_PRECEDENT: 'Conditions Precedent',
  MATERIAL_ADVERSE_CHANGE: 'Material Adverse Change',
  OTHER: 'Other',
};

// Clause type colors (distinct colors for each type)
export const CLAUSE_TYPE_COLORS: Record<ClauseType, string> = {
  TERMINATION: '#ef4444',         // Red
  LIABILITY: '#f97316',           // Orange
  INDEMNIFICATION: '#f59e0b',     // Amber
  CONFIDENTIALITY: '#84cc16',     // Lime
  NON_COMPETE: '#22c55e',         // Green
  CHANGE_OF_CONTROL: '#14b8a6',   // Teal
  ASSIGNMENT: '#06b6d4',          // Cyan
  GOVERNING_LAW: '#0ea5e9',       // Sky
  DISPUTE_RESOLUTION: '#3b82f6',  // Blue
  PAYMENT_TERMS: '#6366f1',       // Indigo
  WARRANTY: '#8b5cf6',            // Violet
  INTELLECTUAL_PROPERTY: '#a855f7', // Purple
  FORCE_MAJEURE: '#d946ef',       // Fuchsia
  REPRESENTATIONS: '#ec4899',     // Pink
  COVENANTS: '#f43f5e',           // Rose
  CONDITIONS_PRECEDENT: '#78716c',// Stone
  MATERIAL_ADVERSE_CHANGE: '#dc2626', // Dark Red (high importance)
  OTHER: '#6b7280',               // Gray
};

// Clause type icons (for UI display)
export const CLAUSE_TYPE_ICONS: Record<ClauseType, string> = {
  TERMINATION: 'X',
  LIABILITY: 'Shield',
  INDEMNIFICATION: 'ShieldCheck',
  CONFIDENTIALITY: 'Lock',
  NON_COMPETE: 'Ban',
  CHANGE_OF_CONTROL: 'RefreshCw',
  ASSIGNMENT: 'ArrowRight',
  GOVERNING_LAW: 'Scale',
  DISPUTE_RESOLUTION: 'Gavel',
  PAYMENT_TERMS: 'DollarSign',
  WARRANTY: 'CheckCircle',
  INTELLECTUAL_PROPERTY: 'Lightbulb',
  FORCE_MAJEURE: 'AlertTriangle',
  REPRESENTATIONS: 'FileText',
  COVENANTS: 'FileCheck',
  CONDITIONS_PRECEDENT: 'GitBranch',
  MATERIAL_ADVERSE_CHANGE: 'AlertOctagon',
  OTHER: 'MoreHorizontal',
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
