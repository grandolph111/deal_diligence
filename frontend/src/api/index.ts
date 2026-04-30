// Export API client
export { apiClient, ApiClientError } from './client';

// Export hooks
export { useApiClientInit } from './hooks/useApiClient';

// Export services
export { authService } from './services/auth.service';
export { companiesService } from './services/companies.service';
export type {
  Company,
  CompanyDetail,
  CreateCompanyDto,
  CreateCompanyResponse,
  CreateCompanyMemberResponse,
} from './services/companies.service';
export { projectsService } from './services/projects.service';
export { membersService } from './services/members.service';
export { tasksService } from './services/tasks.service';
export { tagsService } from './services/tags.service';
export { foldersService } from './services/folders.service';
export { taskDocumentsService } from './services/task-documents.service';
export { searchService } from './services/search.service';
export { documentsService } from './services/documents.service';
export { entitiesService } from './services/entities.service';
export { classificationService } from './services/classification.service';
export { clausesService } from './services/clauses.service';
export { masterEntitiesService } from './services/master-entities.service';
export { relationshipsService } from './services/relationships.service';
export { chatService } from './services/chat.service';
export { dashboardService } from './services/dashboard.service';
export { briefService } from './services/brief.service';
export { playbookService } from './services/playbook.service';
export { boardsService } from './services/boards.service';
