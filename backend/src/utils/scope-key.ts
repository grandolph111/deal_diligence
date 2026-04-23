/**
 * Scope-key computation for folder-scoped deal briefs.
 *
 * OWNER / ADMIN always see the "full" brief. MEMBER / VIEWER with folder
 * restrictions see a brief rendered for their exact folder set, keyed by a
 * short hash so different users sharing a scope share the same brief file.
 */

import crypto from 'crypto';
import type { ProjectMember } from '@prisma/client';

export const SCOPE_FULL = 'full';

export const computeScopeKey = (member: ProjectMember): string => {
  if (member.role === 'OWNER' || member.role === 'ADMIN') return SCOPE_FULL;
  const permissions = member.permissions as Record<string, unknown> | null;
  const restricted = permissions?.restrictedFolders as string[] | undefined;
  if (!restricted || restricted.length === 0) return SCOPE_FULL;
  const sorted = [...restricted].sort();
  const hash = crypto
    .createHash('sha256')
    .update(sorted.join(','))
    .digest('hex')
    .slice(0, 12);
  return `folder-${hash}`;
};

export const scopeKeyFromFolderIds = (folderIds: string[] | null): string => {
  if (!folderIds || folderIds.length === 0) return SCOPE_FULL;
  const sorted = [...folderIds].sort();
  const hash = crypto
    .createHash('sha256')
    .update(sorted.join(','))
    .digest('hex')
    .slice(0, 12);
  return `folder-${hash}`;
};

export const isFullScope = (key: string): boolean => key === SCOPE_FULL;
