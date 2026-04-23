import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout';
import { ProtectedRoute } from './auth';
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
} from './pages';

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
      // Redirect root to dashboard
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      // Dashboard
      {
        path: 'dashboard',
        element: <DashboardPage />,
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
