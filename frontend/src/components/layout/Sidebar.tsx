import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileText, Kanban, Settings, FolderOpen } from 'lucide-react';

interface SidebarProps {
  projectId?: string;
}

/**
 * Application sidebar with project navigation
 * Uses Lucide icons for consistent, professional iconography
 */
export function Sidebar({ projectId }: SidebarProps) {
  return (
    <aside className="app-sidebar">
      <nav className="sidebar-nav">
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'active' : ''}`
          }
        >
          <LayoutDashboard className="icon" size={20} />
          <span>Dashboard</span>
        </NavLink>

        {projectId && (
          <>
            <div className="sidebar-section">
              <span className="sidebar-section-title">Project</span>
            </div>

            <NavLink
              to={`/projects/${projectId}`}
              end
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <FileText className="icon" size={20} />
              <span>Overview</span>
            </NavLink>

            <NavLink
              to={`/projects/${projectId}/board`}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <Kanban className="icon" size={20} />
              <span>Kanban Board</span>
            </NavLink>

            <NavLink
              to={`/projects/${projectId}/vdr`}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <FolderOpen className="icon" size={20} />
              <span>Data Room</span>
            </NavLink>

            <NavLink
              to={`/projects/${projectId}/settings`}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <Settings className="icon" size={20} />
              <span>Settings</span>
            </NavLink>
          </>
        )}
      </nav>
    </aside>
  );
}
