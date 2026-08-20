import { User } from '@prisma/client';
import { prisma } from '../config/database';

export interface ProjectScope {
  isFullAccess: boolean;
  // When isFullAccess=false, this is the exhaustive list of folder IDs the
  // caller can see (top-level grants expanded to include descendants).
  // [] + isFullAccess=false → user has been added but holds no grants yet,
  // callers must return empty lists, not everything.
  //
  // Folders are dormant: retired from the UI in favour of workstreams, kept
  // here so the un-migrated read paths keep behaving until they are removed.
  allowedFolderIds: string[];
  // Checklist workstream slugs (see integrations/library/checklist.ts) the
  // caller can see. Flat — workstreams have no hierarchy, so unlike folders
  // there is no descendant cascade to expand.
  allowedWorkstreamIds: string[];
}

/** @deprecated Folder scoping is dormant — use {@link ProjectScope}. */
export type FolderScope = ProjectScope;

const FULL_ACCESS: ProjectScope = {
  isFullAccess: true,
  allowedFolderIds: [],
  allowedWorkstreamIds: [],
};
const NO_ACCESS: ProjectScope = {
  isFullAccess: false,
  allowedFolderIds: [],
  allowedWorkstreamIds: [],
};

/**
 * Resolve the read scope for a user on a project. Single source of truth
 * for all list/read services — consolidates the four near-duplicates that
 * used to live in dashboard/documents/chat/folders services.
 *
 * Rules, in order:
 *   1. SUPER_ADMIN                                         → full access
 *   2. CUSTOMER_ADMIN whose companyId === project.companyId → full access
 *   3. ProjectMember with role OWNER or ADMIN              → full access
 *   4. ProjectMember with role MEMBER/VIEWER               → whatever grants
 *      the row carries: `restrictedWorkstreams` verbatim, and (dormant)
 *      `restrictedFolders` expanded to descendants
 *   5. Anything else                                        → NO_ACCESS
 *      (no ProjectMember row; or row with no/empty grants)
 *
 * Folder grants do NOT imply workstream grants — the two taxonomies have no
 * mapping between them (a document lives in one folder but supplies evidence
 * to ~8 workstreams). A member holding only legacy `restrictedFolders` gets an
 * empty workstream scope, i.e. sees nothing on workstream-scoped paths, until
 * an admin re-grants. That fails closed rather than over-granting.
 */
export async function resolveProjectScope(
  user: Pick<User, 'id' | 'platformRole' | 'companyId'>,
  projectId: string
): Promise<ProjectScope> {
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
  const folderGrants = permissions?.restrictedFolders as string[] | undefined;
  const workstreamGrants = permissions?.restrictedWorkstreams as string[] | undefined;

  const hasFolderGrants = Array.isArray(folderGrants) && folderGrants.length > 0;
  const hasWorkstreamGrants = Array.isArray(workstreamGrants) && workstreamGrants.length > 0;
  if (!hasFolderGrants && !hasWorkstreamGrants) {
    return NO_ACCESS;
  }

  return {
    isFullAccess: false,
    allowedFolderIds: hasFolderGrants
      ? await expandFoldersToDescendants(projectId, folderGrants)
      : [],
    allowedWorkstreamIds: hasWorkstreamGrants ? [...new Set(workstreamGrants)] : [],
  };
}

/**
 * Check a specific workstream against a scope. Flat membership — no cascade.
 */
export function workstreamIsInScope(scope: ProjectScope, workstreamId: string): boolean {
  if (scope.isFullAccess) return true;
  return scope.allowedWorkstreamIds.includes(workstreamId);
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
