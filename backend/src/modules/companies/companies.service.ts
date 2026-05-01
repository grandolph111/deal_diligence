import { PlatformRole, Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { generateDevPassword } from '../../utils/generateDevPassword';
import type { CreateCompanyInput, UpdateCompanyInput } from './companies.validators';

export const companiesService = {
  async listCompanies() {
    const companies = await prisma.company.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { projects: true, users: true },
        },
      },
    });
    return companies.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      projectCount: c._count.projects,
      memberCount: c._count.users,
    }));
  },

  async getCompanyById(companyId: string) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        projects: {
          orderBy: { updatedAt: 'desc' },
          include: {
            _count: {
              select: { members: true, tasks: true, documents: true },
            },
          },
        },
        users: {
          select: {
            id: true,
            email: true,
            name: true,
            platformRole: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!company) {
      throw ApiError.notFound('Company not found');
    }
    return {
      id: company.id,
      name: company.name,
      description: company.description,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
      projects: company.projects.map((p) => ({
        ...p,
        memberCount: p._count.members,
        taskCount: p._count.tasks,
        documentCount: p._count.documents,
      })),
      members: company.users,
    };
  },

  async updateCompany(companyId: string, data: UpdateCompanyInput) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw ApiError.notFound('Company not found');
    return prisma.company.update({
      where: { id: companyId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.playbook !== undefined && {
          playbook: data.playbook === null ? Prisma.JsonNull : { content: data.playbook },
        }),
      },
    });
  },

  async deleteCompany(companyId: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw ApiError.notFound('Company not found');
    await prisma.company.delete({ where: { id: companyId } });
  },

  /**
   * Create a company plus its initial Customer Admin user. Password is
   * generated server-side and returned once so the caller can display it.
   */
  async createCompanyWithAdmin(data: CreateCompanyInput) {
    const existing = await prisma.user.findUnique({
      where: { email: data.adminEmail },
    });
    if (existing) {
      throw ApiError.badRequest(
        `A user with email ${data.adminEmail} already exists`
      );
    }

    const generatedPassword = generateDevPassword();

    const { company, admin } = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: data.name,
          description: data.description ?? null,
        },
      });

      const admin = await tx.user.create({
        data: {
          auth0Id: `dev|customer-admin-${company.id}`,
          email: data.adminEmail,
          name: data.adminName ?? data.adminEmail.split('@')[0],
          devPassword: generatedPassword,
          platformRole: PlatformRole.CUSTOMER_ADMIN,
          companyId: company.id,
        },
      });

      return { company, admin };
    });

    return { company, admin, generatedPassword };
  },
};
