/**
 * Workstream scoping — the access-control seam every list/read service keys off.
 *
 * The rule under test is that folder grants do NOT imply workstream grants.
 * There is no mapping between the two taxonomies (a document lives in one
 * folder but supplies evidence to ~8 workstreams), so inferring one from the
 * other could only ever over-grant. A member holding stale folder-only grants
 * must see nothing on workstream-scoped paths until an admin re-grants.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const projectFindUnique = vi.fn();
const memberFindUnique = vi.fn();
const folderFindMany = vi.fn();

vi.mock('../../src/config/database', () => ({
  prisma: {
    project: { findUnique: (...a: unknown[]) => projectFindUnique(...a) },
    projectMember: { findUnique: (...a: unknown[]) => memberFindUnique(...a) },
    folder: { findMany: (...a: unknown[]) => folderFindMany(...a) },
  },
}));

import { resolveProjectScope, workstreamIsInScope } from '../../src/services/scope.service';

const user = (platformRole: string, companyId: string | null = null) =>
  ({ id: 'u1', platformRole, companyId }) as never;

const member = (role: string, permissions: Record<string, unknown> | null) => ({
  projectId: 'p1',
  userId: 'u1',
  role,
  permissions,
});

describe('resolveProjectScope — workstream grants', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    folderFindMany.mockResolvedValue([]);
  });

  it('gives SUPER_ADMIN full access without consulting membership', async () => {
    const scope = await resolveProjectScope(user('SUPER_ADMIN'), 'p1');
    expect(scope.isFullAccess).toBe(true);
    expect(memberFindUnique).not.toHaveBeenCalled();
  });

  it('gives CUSTOMER_ADMIN full access only within their own company', async () => {
    projectFindUnique.mockResolvedValue({ companyId: 'acme' });
    expect((await resolveProjectScope(user('CUSTOMER_ADMIN', 'acme'), 'p1')).isFullAccess).toBe(true);

    projectFindUnique.mockResolvedValue({ companyId: 'other-co' });
    memberFindUnique.mockResolvedValue(null);
    expect((await resolveProjectScope(user('CUSTOMER_ADMIN', 'acme'), 'p1')).isFullAccess).toBe(false);
  });

  it('gives project OWNER/ADMIN full access', async () => {
    memberFindUnique.mockResolvedValue(member('ADMIN', { restrictedWorkstreams: ['11-tax'] }));
    const scope = await resolveProjectScope(user('MEMBER'), 'p1');
    expect(scope.isFullAccess).toBe(true);
  });

  it('returns the granted workstreams verbatim for a restricted member', async () => {
    memberFindUnique.mockResolvedValue(
      member('MEMBER', { restrictedWorkstreams: ['04-intellectual-property', '05-liability-risk'] })
    );
    const scope = await resolveProjectScope(user('MEMBER'), 'p1');

    expect(scope.isFullAccess).toBe(false);
    expect(scope.allowedWorkstreamIds).toEqual([
      '04-intellectual-property',
      '05-liability-risk',
    ]);
  });

  it('deduplicates repeated grants', async () => {
    memberFindUnique.mockResolvedValue(
      member('MEMBER', { restrictedWorkstreams: ['11-tax', '11-tax'] })
    );
    const scope = await resolveProjectScope(user('MEMBER'), 'p1');
    expect(scope.allowedWorkstreamIds).toEqual(['11-tax']);
  });

  it('does NOT translate legacy folder grants into workstream access', async () => {
    // The migration hazard: this member was scoped to a folder before the
    // switch. Granting them workstreams by inference would hand them documents
    // no admin ever approved, so the workstream scope stays empty.
    memberFindUnique.mockResolvedValue(member('MEMBER', { restrictedFolders: ['folder-legal'] }));
    folderFindMany.mockResolvedValue([{ id: 'folder-legal', parentId: null }]);

    const scope = await resolveProjectScope(user('MEMBER'), 'p1');

    expect(scope.isFullAccess).toBe(false);
    expect(scope.allowedWorkstreamIds).toEqual([]);
    expect(scope.allowedFolderIds).toContain('folder-legal'); // dormant path still resolves
  });

  it('denies a member with no grants at all', async () => {
    memberFindUnique.mockResolvedValue(member('MEMBER', {}));
    const scope = await resolveProjectScope(user('MEMBER'), 'p1');
    expect(scope).toMatchObject({ isFullAccess: false, allowedWorkstreamIds: [] });
  });

  it('denies a non-member', async () => {
    memberFindUnique.mockResolvedValue(null);
    const scope = await resolveProjectScope(user('MEMBER'), 'p1');
    expect(scope).toMatchObject({ isFullAccess: false, allowedWorkstreamIds: [] });
  });
});

describe('workstreamIsInScope', () => {
  it('admits everything under full access', () => {
    const scope = { isFullAccess: true, allowedFolderIds: [], allowedWorkstreamIds: [] };
    expect(workstreamIsInScope(scope, '11-tax')).toBe(true);
  });

  it('admits only granted workstreams — membership is flat, no cascade', () => {
    const scope = {
      isFullAccess: false,
      allowedFolderIds: [],
      allowedWorkstreamIds: ['04-intellectual-property'],
    };
    expect(workstreamIsInScope(scope, '04-intellectual-property')).toBe(true);
    expect(workstreamIsInScope(scope, '05-liability-risk')).toBe(false);
  });
});
