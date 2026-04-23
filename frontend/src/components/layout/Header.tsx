import { Link } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../auth';

/**
 * Application header with navigation and user menu
 */
export function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="app-header">
      <div className="header-left">
        <Link to="/dashboard" className="logo">
          <span className="logo-mark" aria-hidden="true" />
          DealDiligence
        </Link>
        <nav className="header-nav">
          <Link to="/dashboard">Dashboard</Link>
        </nav>
      </div>

      <div className="header-right">
        <div className="user-menu">
          {user?.picture && (
            <img
              src={user.picture}
              alt={user.name || 'User'}
              className="user-avatar"
            />
          )}
          <span className="user-name">{user?.name || user?.email}</span>
          <button className="logout-button" onClick={logout}>
            <LogOut size={16} />
            <span className="sr-only">Sign Out</span>
          </button>
        </div>
      </div>
    </header>
  );
}
