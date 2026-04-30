import { User } from '@prisma/client';
import { prisma } from '../config/database';

export interface FolderScope {
  isFullAccess: boolean;
  // When isFullAccess=false, this is the exhaustive list of folder IDs the
  // caller can see (top-level grants expanded to include descendants).
  // [] + isFullAccess=false → user has been added but holds no grants yet,
  // callers must return empty lists, not everything.
  allowedFolderIds: string[];
}

const FULL_ACCESS: FolderScope = { isFullAccess: true, allowedFolderIds: [] };
const NO_ACCESS: FolderScope = { isFullAccess: false, allowedFolderIds: [] };

/**
 * Resolve the folder scope for a user on a project. Single source of truth
 * for all list/read services — consolidates the four near-duplicates that
 * used to live in dashboard/documents/chat/folders services.
 *
 * Rules, in order:
 *   1. SUPER_ADMIN                                         → full access
 *   2. CUSTOMER_ADMIN whose companyId === project.companyId → full access
 *   3. ProjectMember with role OWNER or ADMIN              → full access
 *   4. ProjectMember with role MEMBER/VIEWER and
 *      permissions.restrictedFolders is a non-empty array  → that array
 *                                                            expanded to
 *                                                            descendants
 *   5. Anything else                                        → NO_ACCESS
 *      (no ProjectMember row; or row with no/empty grants)
 */
export async function resolveProjectScope(
  user: Pick<User, 'id' | 'platformRole' | 'companyId'>,
  projectId: string
): Promise<FolderScope> {
  if (user.platformRole === 'SUPER_ADMIN') {
    return FULL_ACCESS;
  }

  if (user.platformRole === 'CUSTOMER_ADMIN' && user.companyId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { companyId: true },
    });
    if (project && project.companyId === user.companyId) {
      return FULL_ACCESS;
    }
  }

  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
  });
  if (!membership) return NO_ACCESS;

  if (membership.role === 'OWNER' || membership.role === 'ADMIN') {
    return FULL_ACCESS;
  }

  const permissions = membership.permissions as Record<string, unknown> | null;
  const grants = permissions?.restrictedFolders as string[] | undefined;
  if (!grants || grants.length === 0) {
    return NO_ACCESS;
  }

  const allowed = await expandFoldersToDescendants(projectId, grants);
  return { isFullAccess: false, allowedFolderIds: allowed };
}

/**
 * Check a specific folder against a scope, including descendant cascade.
 */
export async function folderIsInScope(
  scope: FolderScope,
  folderId: string
): Promise<boolean> {
  if (scope.isFullAccess) return true;
  return scope.allowedFolderIds.includes(folderId);
}

/**
 * Expand a list of top-level folder IDs into the flat set that includes
 * all descendants. Grants cascade — granting "Financial" grants every
 * subfolder underneath.
 */
export async function expandFoldersToDescendants(
  projectId: string,
  rootIds: string[]
): Promise<string[]> {
  if (rootIds.length === 0) return [];

  const allFolders = await prisma.folder.findMany({
    where: { projectId },
    select: { id: true, parentId: true },
  });

  const childrenByParent = new Map<string, string[]>();
  for (const f of allFolders) {
    if (!f.parentId) continue;
    const bucket = childrenByParent.get(f.parentId) ?? [];
    bucket.push(f.id);
    childrenByParent.set(f.parentId, bucket);
  }

  const result = new Set<string>();
  const queue: string[] = [...rootIds];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (result.has(id)) continue;
    result.add(id);
    const kids = childrenByParent.get(id);
    if (kids) queue.push(...kids);
  }
  return Array.from(result);
}
