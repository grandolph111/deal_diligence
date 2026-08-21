/**
 * RiskCategory scoping — the access-control seam every list/read service keys off.
 *
 * The rule under test is that folder grants do NOT imply risk category grants.
 * There is no mapping between the two taxonomies (a document lives in one
 * folder but supplies evidence to ~8 risk categories), so inferring one from the
 * other could only ever over-grant. A member holding stale folder-only grants
 * must see nothing on risk category-scoped paths until an admin re-grants.
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

import { resolveProjectScope, riskCategoryIsInScope } from '../../src/services/scope.service';

const user = (platformRole: string, companyId: string | null = null) =>
  ({ id: 'u1', platformRole, companyId }) as never;

const member = (role: string, permissions: Record<string, unknown> | null) => ({
  projectId: 'p1',
  userId: 'u1',
  role,
  permissions,
});

describe('resolveProjectScope — risk category grants', () => {
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
    memberFindUnique.mockResolvedValue(member('ADMIN', { restrictedRiskCategories: ['07-tax-matters'] }));
    const scope = await resolveProjectScope(user('MEMBER'), 'p1');
    expect(scope.isFullAccess).toBe(true);
  });

  it('returns the granted risk categories verbatim for a restricted member', async () => {
    memberFindUnique.mockResolvedValue(
      member('MEMBER', { restrictedRiskCategories: ['14-intellectual-property', '20-employees-contractors'] })
    );
    const scope = await resolveProjectScope(user('MEMBER'), 'p1');

    expect(scope.isFullAccess).toBe(false);
    expect(scope.allowedRiskCategoryIds).toEqual([
      '14-intellectual-property',
      '20-employees-contractors',
    ]);
  });

  it('deduplicates repeated grants', async () => {
    memberFindUnique.mockResolvedValue(
      member('MEMBER', { restrictedRiskCategories: ['07-tax-matters', '07-tax-matters'] })
    );
    const scope = await resolveProjectScope(user('MEMBER'), 'p1');
    expect(scope.allowedRiskCategoryIds).toEqual(['07-tax-matters']);
  });

  it('does NOT translate legacy folder grants into risk category access', async () => {
    // The migration hazard: this member was scoped to a folder before the
    // switch. Granting them risk categories by inference would hand them documents
    // no admin ever approved, so the risk category scope stays empty.
    memberFindUnique.mockResolvedValue(member('MEMBER', { restrictedFolders: ['folder-legal'] }));
    folderFindMany.mockResolvedValue([{ id: 'folder-legal', parentId: null }]);

    const scope = await resolveProjectScope(user('MEMBER'), 'p1');

    expect(scope.isFullAccess).toBe(false);
    expect(scope.allowedRiskCategoryIds).toEqual([]);
    expect(scope.allowedFolderIds).toContain('folder-legal'); // dormant path still resolves
  });

  it('denies a member with no grants at all', async () => {
    memberFindUnique.mockResolvedValue(member('MEMBER', {}));
    const scope = await resolveProjectScope(user('MEMBER'), 'p1');
    expect(scope).toMatchObject({ isFullAccess: false, allowedRiskCategoryIds: [] });
  });

  it('denies a non-member', async () => {
    memberFindUnique.mockResolvedValue(null);
    const scope = await resolveProjectScope(user('MEMBER'), 'p1');
    expect(scope).toMatchObject({ isFullAccess: false, allowedRiskCategoryIds: [] });
  });
});

describe('riskCategoryIsInScope', () => {
  it('admits everything under full access', () => {
    const scope = { isFullAccess: true, allowedFolderIds: [], allowedRiskCategoryIds: [] };
    expect(riskCategoryIsInScope(scope, '07-tax-matters')).toBe(true);
  });

  it('admits only granted risk categories — membership is flat, no cascade', () => {
    const scope = {
      isFullAccess: false,
      allowedFolderIds: [],
      allowedRiskCategoryIds: ['14-intellectual-property'],
    };
    expect(riskCategoryIsInScope(scope, '14-intellectual-property')).toBe(true);
    expect(riskCategoryIsInScope(scope, '20-employees-contractors')).toBe(false);
  });
});
