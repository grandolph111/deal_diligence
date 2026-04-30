import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';

/**
 * Root-level redirect: SUPER_ADMIN → /admin/companies, everyone else → /dashboard.
 */
export function RoleAwareHome() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
      </div>
    );
  }
  const target =
    user?.platformRole === 'SUPER_ADMIN' ? '/admin/companies' : '/dashboard';
  return <Navigate to={target} replace />;
}
