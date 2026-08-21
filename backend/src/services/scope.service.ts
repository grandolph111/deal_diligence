import { User } from '@prisma/client';
import { prisma } from '../config/database';

export interface ProjectScope {
  isFullAccess: boolean;
  // When isFullAccess=false, this is the exhaustive list of folder IDs the
  // caller can see (top-level grants expanded to include descendants).
  // [] + isFullAccess=false → user has been added but holds no grants yet,
  // callers must return empty lists, not everything.
  //
  // Folders are dormant: retired from the UI in favour of risk categories, kept
  // here so the un-migrated read paths keep behaving until they are removed.
  allowedFolderIds: string[];
  // Checklist risk category slugs (see integrations/library/risk-categories.ts) the
  // caller can see. Flat — risk categories have no hierarchy, so unlike folders
  // there is no descendant cascade to expand.
  allowedRiskCategoryIds: string[];
}

/** @deprecated Folder scoping is dormant — use {@link ProjectScope}. */
export type FolderScope = ProjectScope;

const FULL_ACCESS: ProjectScope = {
  isFullAccess: true,
  allowedFolderIds: [],
  allowedRiskCategoryIds: [],
};
const NO_ACCESS: ProjectScope = {
  isFullAccess: false,
  allowedFolderIds: [],
  allowedRiskCategoryIds: [],
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
 *      the row carries: `restrictedRiskCategories` verbatim, and (dormant)
 *      `restrictedFolders` expanded to descendants
 *   5. Anything else                                        → NO_ACCESS
 *      (no ProjectMember row; or row with no/empty grants)
 *
 * Folder grants do NOT imply risk category grants — the two taxonomies have no
 * mapping between them (a document lives in one folder but supplies evidence
 * to ~8 risk categories). A member holding only legacy `restrictedFolders` gets an
 * empty risk category scope, i.e. sees nothing on risk category-scoped paths, until
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
  const riskCategoryGrants = permissions?.restrictedRiskCategories as string[] | undefined;

  const hasFolderGrants = Array.isArray(folderGrants) && folderGrants.length > 0;
  const hasRiskCategoryGrants = Array.isArray(riskCategoryGrants) && riskCategoryGrants.length > 0;
  if (!hasFolderGrants && !hasRiskCategoryGrants) {
    return NO_ACCESS;
  }

  return {
    isFullAccess: false,
    allowedFolderIds: hasFolderGrants
      ? await expandFoldersToDescendants(projectId, folderGrants)
      : [],
    allowedRiskCategoryIds: hasRiskCategoryGrants ? [...new Set(riskCategoryGrants)] : [],
  };
}

/**
 * Check a specific risk category against a scope. Flat membership — no cascade.
 */
export function riskCategoryIsInScope(scope: ProjectScope, riskCategoryId: string): boolean {
  if (scope.isFullAccess) return true;
  return scope.allowedRiskCategoryIds.includes(riskCategoryId);
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
