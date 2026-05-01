import { apiClient } from '../client';
import type { Project } from '../../types/api';

export interface Company {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  projectCount?: number;
  memberCount?: number;
}

export interface UpdateCompanyDto {
  name?: string;
  description?: string | null;
  playbook?: string | null;
}

export interface CompanyDetail extends Company {
  playbook?: { content: string } | null;
  projects: Array<
    Project & {
      memberCount: number;
      taskCount: number;
      documentCount: number;
    }
  >;
  members: Array<{
    id: string;
    email: string;
    name: string | null;
    platformRole: 'SUPER_ADMIN' | 'CUSTOMER_ADMIN' | 'MEMBER';
    createdAt: string;
  }>;
}

export interface CreateCompanyDto {
  name: string;
  description?: string;
  adminEmail: string;
  adminName?: string;
}

export interface CreateCompanyResponse {
  company: Company;
  admin: {
    id: string;
    email: string;
    name: string | null;
  };
  generatedPassword: string;
}

export interface CreateCompanyMemberDto {
  email: string;
  name?: string;
}

export interface CreateCompanyMemberResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    platformRole: 'SUPER_ADMIN' | 'CUSTOMER_ADMIN' | 'MEMBER';
    companyId: string | null;
  };
  generatedPassword: string;
}

export const companiesService = {
  async listCompanies(): Promise<Company[]> {
    return apiClient.get<Company[]>('/companies');
  },

  async getCompany(id: string): Promise<CompanyDetail> {
    return apiClient.get<CompanyDetail>(`/companies/${id}`);
  },

  async createCompany(data: CreateCompanyDto): Promise<CreateCompanyResponse> {
    return apiClient.post<CreateCompanyResponse>('/companies', data);
  },

  async addCustomerAdmin(
    companyId: string,
    data: CreateCompanyMemberDto
  ): Promise<CreateCompanyMemberResponse> {
    return apiClient.post<CreateCompanyMemberResponse>(
      `/companies/${companyId}/admins`,
      data
    );
  },

  async addMember(
    companyId: string,
    data: CreateCompanyMemberDto
  ): Promise<CreateCompanyMemberResponse> {
    return apiClient.post<CreateCompanyMemberResponse>(
      `/companies/${companyId}/members`,
      data
    );
  },

  async updateCompany(companyId: string, data: UpdateCompanyDto): Promise<Company> {
    return apiClient.patch<Company>(`/companies/${companyId}`, data);
  },

  async deleteCompany(companyId: string): Promise<void> {
    return apiClient.delete(`/companies/${companyId}`);
  },

  async removeMember(companyId: string, userId: string): Promise<void> {
    return apiClient.delete(`/companies/${companyId}/members/${userId}`);
  },

  async regeneratePassword(
    companyId: string,
    userId: string
  ): Promise<CreateCompanyMemberResponse> {
    return apiClient.post<CreateCompanyMemberResponse>(
      `/companies/${companyId}/members/${userId}/regenerate-password`,
      {}
    );
  },

  async changeOwnPassword(
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    return apiClient.patch('/auth/me/password', {
      currentPassword,
      newPassword,
    });
  },
};
