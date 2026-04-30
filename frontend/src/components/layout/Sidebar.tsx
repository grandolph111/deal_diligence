import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Kanban,
  Settings,
  FolderOpen,
  BookOpen,
  Building2,
} from 'lucide-react';
import { useAuth } from '../../auth';

interface SidebarProps {
  projectId?: string;
}

/**
 * Application sidebar. Three flavors:
 *  - admin  (Super Admin, on /admin/*): Companies link
 *  - default (Customer Admin / Member, on /dashboard): Dashboard link
 *  - project-scoped: adds the per-project nav when projectId is set
 */
export function Sidebar({ projectId }: SidebarProps) {
  const location = useLocation();
  const { user } = useAuth();
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isSuperAdmin = user?.platformRole === 'SUPER_ADMIN';

  if (isAdminRoute || (isSuperAdmin && !projectId)) {
    return (
      <aside className="app-sidebar">
        <nav className="sidebar-nav">
          <NavLink
            to="/admin/companies"
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
          >
            <Building2 className="icon" size={20} />
            <span>Companies</span>
          </NavLink>
        </nav>
      </aside>
    );
  }

  const homePath = isSuperAdmin ? '/admin/companies' : '/dashboard';
  const homeLabel = isSuperAdmin ? 'Companies' : 'Dashboard';
  const HomeIcon = isSuperAdmin ? Building2 : LayoutDashboard;

  const isCustomerAdmin = user?.platformRole === 'CUSTOMER_ADMIN';

  return (
    <aside className="app-sidebar">
      <nav className="sidebar-nav">
        <NavLink
          to={homePath}
          className={({ isActive }) =>
            `sidebar-link ${isActive ? 'active' : ''}`
          }
        >
          <HomeIcon className="icon" size={20} />
          <span>{homeLabel}</span>
        </NavLink>

        {isCustomerAdmin && (
          <NavLink
            to="/company"
            className={({ isActive }) =>
              `sidebar-link ${isActive ? 'active' : ''}`
            }
          >
            <Building2 className="icon" size={20} />
            <span>Company</span>
          </NavLink>
        )}

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
              to={`/projects/${projectId}/brief`}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <BookOpen className="icon" size={20} />
              <span>Deal Brief</span>
            </NavLink>

            <NavLink
              to={`/projects/${projectId}/boards`}
              className={({ isActive }) =>
                `sidebar-link ${isActive ? 'active' : ''}`
              }
            >
              <Kanban className="icon" size={20} />
              <span>Kanban Boards</span>
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
              <span>Admin</span>
            </NavLink>
          </>
        )}
      </nav>
    </aside>
  );
}
