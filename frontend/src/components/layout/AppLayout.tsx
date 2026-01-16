import { Outlet, useParams } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { useApiClientInit } from '../../api';

/**
 * Main application layout with header, sidebar, and content area
 */
export function AppLayout() {
  const { projectId } = useParams<{ projectId?: string }>();

  // Initialize API client with token getter
  useApiClientInit();

  return (
    <div className="app-layout">
      <Header />
      <div className="app-body">
        <Sidebar projectId={projectId} />
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
