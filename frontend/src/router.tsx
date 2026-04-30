import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout';
import { ProtectedRoute, RequirePlatformRole } from './auth';
import {
  LoginPage,
  CallbackPage,
  DashboardPage,
  NotFoundPage,
  CreateProjectPage,
  ProjectOverviewPage,
  KanbanPage,
  SettingsPage,
  VDRPage,
  EntitiesPage,
  GraphExplorerPage,
  DealBriefPage,
  BoardsIndexPage,
  AdminCompaniesPage,
  CreateCompanyPage,
  CompanyDetailPage,
  CompanyTeamPage,
  AccountPasswordPage,
} from './pages';
import { RoleAwareHome } from './components/RoleAwareHome';

/**
 * Application router configuration
 * Uses React Router v7 with protected routes
 */
export const router = createBrowserRouter([
  // Public routes
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/callback',
    element: <CallbackPage />,
  },

  // Protected routes (require authentication)
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      // Role-aware root: SUPER_ADMIN → /admin/companies, others → /dashboard
      {
        index: true,
        element: <RoleAwareHome />,
      },
      // Super Admin admin routes
      {
        path: 'admin/companies',
        element: (
          <RequirePlatformRole roles={['SUPER_ADMIN']}>
            <AdminCompaniesPage />
          </RequirePlatformRole>
        ),
      },
      {
        path: 'admin/companies/new',
        element: (
          <RequirePlatformRole roles={['SUPER_ADMIN']}>
            <CreateCompanyPage />
          </RequirePlatformRole>
        ),
      },
      {
        path: 'admin/companies/:companyId',
        element: (
          <RequirePlatformRole roles={['SUPER_ADMIN']}>
            <CompanyDetailPage />
          </RequirePlatformRole>
        ),
      },
      // Dashboard (Customer Admin + Member)
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      // Customer Admin team view (their own company)
      {
        path: 'company',
        element: <CompanyTeamPage />,
      },
      // Self-service password change (any signed-in user)
      {
        path: 'account/password',
        element: <AccountPasswordPage />,
      },
      // Create new project
      {
        path: 'projects/new',
        element: <CreateProjectPage />,
      },
      // Project routes
      {
        path: 'projects/:projectId',
        children: [
          {
            index: true,
            element: <ProjectOverviewPage />,
          },
          {
            path: 'brief',
            element: <DealBriefPage />,
          },
          {
            // Legacy single-board URL: redirect to the boards index which
            // will send users to the default "All Documents" board.
            path: 'board',
            element: <Navigate to="../boards" replace />,
          },
          {
            path: 'boards',
            element: <BoardsIndexPage />,
          },
          {
            path: 'boards/:boardId',
            element: <KanbanPage />,
          },
          {
            path: 'vdr',
            element: <VDRPage />,
          },
          {
            path: 'entities',
            element: <EntitiesPage />,
          },
          {
            path: 'graph',
            element: <GraphExplorerPage />,
          },
          {
            path: 'members',
            element: <Navigate to="settings?tab=team" replace />,
          },
          {
            path: 'settings',
            element: <SettingsPage />,
          },
        ],
      },
    ],
  },

  // 404 catch-all
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
