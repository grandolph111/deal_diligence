import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { CompanyDetailPage } from './admin/CompanyDetailPage';

/**
 * Customer Admin's own-company view at `/company`. Reuses the admin's
 * CompanyDetailPage but pinned to the user's companyId, without the
 * Deals tab (deals are already the dashboard).
 */
export function CompanyTeamPage() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
      </div>
    );
  }
  // Only company/platform admins can view the company team page — the underlying
  // company-detail endpoint 403s for members. Bounce everyone else to the dashboard
  // instead of rendering a dead-end error card.
  const canView =
    user?.platformRole === 'SUPER_ADMIN' || user?.platformRole === 'CUSTOMER_ADMIN';
  if (!user?.companyId || !canView) {
    return <Navigate to="/dashboard" replace />;
  }
  return (
    <CompanyDetailPage
      companyId={user.companyId}
      hideDealsTab
      hideBackLink
    />
  );
}
