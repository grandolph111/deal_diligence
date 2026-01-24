// Auth mocking utilities
export {
  testUsers,
  setMockUser,
  getMockUser,
  clearMockUser,
  createMockUser,
  mockAuthMiddleware,
  type MockUser,
} from './auth-mock';

// Database utilities
export {
  testPrisma,
  cleanDatabase,
  disconnectDatabase,
  createTestUser,
  createTestUsers,
  createTestProject,
  addProjectMember,
  createTestTask,
  createTestTag,
  assignUserToTask,
  addTagToTask,
  seedTestScenario,
  createTestComment,
  createTestSubtask,
  createTestFolder,
  createTestDocument,
  linkDocumentToTask,
} from './db-helpers';

// Test app factory
export { createTestApp, testRequest } from './test-app';
