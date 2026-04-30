import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, FileText, Building2, Briefcase } from 'lucide-react';
import { useAuth } from '../../auth';
import { apiClient, companiesService, type Company } from '../../api';
import { EntityCard } from '../../components/EntityCard';

const relativeTime = (iso?: string) => {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const day = 86400000;
  if (diff < day) return 'today';
  if (diff < 2 * day) return 'yesterday';
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}mo ago`;
  return `${Math.floor(diff / (365 * day))}y ago`;
};

/**
 * Super Admin landing: every company on the platform. Mirrors the layout
 * of the Customer Admin DashboardPage so the Super Admin's mental model
 * stays "one list of cards" one level up.
 */
export function AdminCompaniesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !apiClient.isReady()) return;
    let cancelled = false;
    companiesService
      .listCompanies()
      .then((data) => {
        if (!cancelled) {
          setCompanies(data);
          setError(null);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch companies:', err);
        if (!cancelled) setError('Failed to load companies');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading]);

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Welcome, {user?.name || user?.email || 'Admin'}</h1>
        <p>Every company onboarded to the platform</p>
      </div>

      <div className="dashboard-content">
        <div className="projects-header">
          <h2>Companies</h2>
          <Link to="/admin/companies/new" className="button primary">
            <Plus size={16} />
            New Company
          </Link>
        </div>

        {(authLoading || loading) && (
          <div className="loading-container">
            <div className="loading-spinner" />
            <p>Loading companies...</p>
          </div>
        )}

        {!authLoading && error && (
          <div className="error-container">
            <p className="error-message">{error}</p>
          </div>
        )}

        {!authLoading && !loading && !error && companies.length === 0 && (
          <div className="empty-state">
            <Building2 size={48} strokeWidth={1} />
            <h3>No companies yet</h3>
            <p>Onboard your first company to get started</p>
            <Link to="/admin/companies/new" className="button primary">
              <Plus size={16} />
              Create Company
            </Link>
          </div>
        )}

        {!authLoading && !loading && !error && companies.length > 0 && (
          <div className="projects-grid">
            {companies.map((company) => {
              const updated = relativeTime(company.updatedAt);
              return (
                <EntityCard
                  key={company.id}
                  to={`/admin/companies/${company.id}`}
                  title={company.name}
                  description={company.description}
                  chips={<span className="chip primary">Company</span>}
                  stats={[
                    {
                      label: 'Deals',
                      icon: <Briefcase size={14} />,
                      value: company.projectCount ?? 0,
                    },
                    {
                      label: 'Members',
                      icon: <Users size={14} />,
                      value: company.memberCount ?? 0,
                    },
                    {
                      label: 'Documents',
                      icon: <FileText size={14} />,
                      value: 0,
                    },
                  ]}
                  footerRight={
                    updated && (
                      <span className="project-card-time">Updated {updated}</span>
                    )
                  }
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
