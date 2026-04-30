import { PlatformRole, User } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { generateDevPassword } from '../../utils/generateDevPassword';

type Caller = Pick<User, 'id' | 'platformRole' | 'companyId'>;

function canManageCompany(caller: Caller, companyId: string): boolean {
  if (caller.platformRole === 'SUPER_ADMIN') return true;
  if (caller.platformRole === 'CUSTOMER_ADMIN' && caller.companyId === companyId) {
    return true;
  }
  return false;
}

function canManageUser(caller: Caller, target: Pick<User, 'id' | 'companyId'>): boolean {
  if (caller.platformRole === 'SUPER_ADMIN') return true;
  if (caller.id === target.id) return true;
  if (
    caller.platformRole === 'CUSTOMER_ADMIN' &&
    caller.companyId &&
    target.companyId &&
    caller.companyId === target.companyId
  ) {
    return true;
  }
  return false;
}

async function createCompanyUser(
  companyId: string,
  platformRole: PlatformRole,
  { email, name }: { email: string; name?: string }
) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw ApiError.badRequest(
      `A user with email ${email} already exists. Invite them from their existing account instead.`
    );
  }

  const generatedPassword = generateDevPassword();
  const user = await prisma.user.create({
    data: {
      auth0Id: `dev|${platformRole.toLowerCase()}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      email,
      name: name ?? email.split('@')[0],
      devPassword: generatedPassword,
      platformRole,
      companyId,
    },
  });

  return { user, generatedPassword };
}

export const companyMembersService = {
  async addCustomerAdmin(
    caller: Caller,
    companyId: string,
    input: { email: string; name?: string }
  ) {
    if (!canManageCompany(caller, companyId)) {
      throw ApiError.forbidden('Not authorized to manage this company');
    }
    return createCompanyUser(companyId, PlatformRole.CUSTOMER_ADMIN, input);
  },

  async addMember(
    caller: Caller,
    companyId: string,
    input: { email: string; name?: string }
  ) {
    if (!canManageCompany(caller, companyId)) {
      throw ApiError.forbidden('Not authorized to manage this company');
    }
    return createCompanyUser(companyId, PlatformRole.MEMBER, input);
  },

  async removeMember(caller: Caller, companyId: string, userId: string) {
    if (!canManageCompany(caller, companyId)) {
      throw ApiError.forbidden('Not authorized to manage this company');
    }
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target || target.companyId !== companyId) {
      throw ApiError.notFound('User not found in this company');
    }
    if (target.platformRole === 'CUSTOMER_ADMIN') {
      throw ApiError.badRequest(
        'Removing Customer Admins is not supported yet. Remove their membership via support.'
      );
    }
    await prisma.user.delete({ where: { id: userId } });
  },

  async regeneratePassword(caller: Caller, userId: string) {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw ApiError.notFound('User not found');
    if (!canManageUser(caller, target)) {
      throw ApiError.forbidden('Not authorized to manage this user');
    }
    const generatedPassword = generateDevPassword();
    const user = await prisma.user.update({
      where: { id: userId },
      data: { devPassword: generatedPassword },
    });
    return { user, generatedPassword };
  },

  async changeOwnPassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ) {
    const target = await prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw ApiError.unauthorized('User not found');
    if (target.devPassword !== currentPassword) {
      throw ApiError.unauthorized('Current password is incorrect');
    }
    await prisma.user.update({
      where: { id: userId },
      data: { devPassword: newPassword },
    });
  },
};
