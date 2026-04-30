import { Navigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import type { PlatformRole } from './AuthProvider';

interface RequirePlatformRoleProps {
  roles: PlatformRole[];
  children: React.ReactNode;
}

/**
 * Gate children on the signed-in user's platformRole. Bounces to /dashboard
 * when the user is signed in but holds the wrong tier, and to /login when
 * not signed in at all.
 */
export function RequirePlatformRole({ roles, children }: RequirePlatformRoleProps) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading…</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (!roles.includes(user.platformRole)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
