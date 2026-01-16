import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout';
import { ProtectedRoute } from './auth';
import {
  LoginPage,
  CallbackPage,
  DashboardPage,
  NotFoundPage,
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
      // Project routes (placeholder for future implementation)
      {
        path: 'projects/new',
        element: <div className="page-placeholder">Create Project (Coming Soon)</div>,
      },
      {
        path: 'projects/:projectId',
        children: [
          {
            index: true,
            element: <div className="page-placeholder">Project Overview (Coming Soon)</div>,
          },
          {
            path: 'board',
            element: <div className="page-placeholder">Kanban Board (Coming Soon)</div>,
          },
          {
            path: 'tasks',
            element: <div className="page-placeholder">Tasks List (Coming Soon)</div>,
          },
          {
            path: 'members',
            element: <div className="page-placeholder">Team Members (Coming Soon)</div>,
          },
          {
            path: 'settings',
            element: <div className="page-placeholder">Project Settings (Coming Soon)</div>,
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
