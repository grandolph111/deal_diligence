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
