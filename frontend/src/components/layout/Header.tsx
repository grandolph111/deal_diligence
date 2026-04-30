import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, KeyRound, ChevronDown } from 'lucide-react';
import { useAuth } from '../../auth';

/**
 * Application header with role pill + user dropdown (change password, logout).
 */
export function Header() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const homePath =
    user?.platformRole === 'SUPER_ADMIN' ? '/admin/companies' : '/dashboard';

  const roleLabel =
    user?.platformRole === 'SUPER_ADMIN'
      ? 'Super Admin'
      : user?.platformRole === 'CUSTOMER_ADMIN'
        ? 'Customer Admin'
        : user?.platformRole === 'MEMBER'
          ? 'Member'
          : null;

  const companyLabel = user?.company?.name;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <header className="app-header">
      <div className="header-left">
        <Link to={homePath} className="logo">
          <span className="logo-mark" aria-hidden="true" />
          DealDiligence
        </Link>
        <nav className="header-nav">
          <Link to={homePath}>Dashboard</Link>
        </nav>
      </div>

      <div className="header-right">
        {roleLabel && (
          <span className="role-pill" title={user?.email ?? undefined}>
            {roleLabel}
            {companyLabel ? ` @ ${companyLabel}` : ''}
          </span>
        )}
        <div className="user-menu" ref={menuRef}>
          <button
            type="button"
            className="user-menu-trigger"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="user-name">{user?.name || user?.email}</span>
            <ChevronDown size={14} />
          </button>
          {open && (
            <div className="user-menu-popover">
              <Link
                to="/account/password"
                className="user-menu-item"
                onClick={() => setOpen(false)}
              >
                <KeyRound size={14} /> Change password
              </Link>
              <button
                type="button"
                className="user-menu-item"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
              >
                <LogOut size={14} /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
