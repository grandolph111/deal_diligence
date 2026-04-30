import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  CheckSquare,
  FileText,
  Briefcase,
  Sparkles,
  Plus,
  KeyRound,
  Trash2,
} from 'lucide-react';
import {
  apiClient,
  companiesService,
  type CompanyDetail,
  type CreateCompanyMemberResponse,
} from '../../api';
import { useAuth } from '../../auth';
import { EntityCard } from '../../components/EntityCard';
import { CredentialsRevealModal } from '../../components/CredentialsRevealModal';

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

type Tab = 'deals' | 'members' | 'settings';

interface CompanyDetailPageProps {
  /** Which company to show; defaults to the :companyId route param. */
  companyId?: string;
  /** Hide the Deals tab (used on the Customer Admin's `/company` view). */
  hideDealsTab?: boolean;
  /** Hide the "Back to Companies" link (Customer Admin isn't coming from that list). */
  hideBackLink?: boolean;
}

export function CompanyDetailPage({
  companyId: companyIdProp,
  hideDealsTab,
  hideBackLink,
}: CompanyDetailPageProps = {}) {
  const { companyId: companyIdParam } = useParams<{ companyId: string }>();
  const companyId = companyIdProp ?? companyIdParam;
  const { user } = useAuth();

  const [company, setCompany] = useState<CompanyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(hideDealsTab ? 'members' : 'deals');

  const [creating, setCreating] = useState<null | 'admin' | 'member'>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [creds, setCreds] = useState<null | {
    email: string;
    password: string;
    role: string;
    headline: string;
  }>(null);

  const refetch = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await companiesService.getCompany(companyId);
      setCompany(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch company', err);
      setError('Failed to load company');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !apiClient.isReady()) return;
    let cancelled = false;
    setLoading(true);
    companiesService
      .getCompany(companyId)
      .then((data) => {
        if (!cancelled) {
          setCompany(data);
          setError(null);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch company', err);
        if (!cancelled) setError('Failed to load company');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const canManage =
    user?.platformRole === 'SUPER_ADMIN' ||
    (user?.platformRole === 'CUSTOMER_ADMIN' && user.companyId === companyId);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setFormError(null);
    setSubmitting(true);
    try {
      const api =
        creating === 'admin'
          ? companiesService.addCustomerAdmin
          : companiesService.addMember;
      const result: CreateCompanyMemberResponse = await api(companyId, {
        email: newEmail.trim(),
        name: newName.trim() || undefined,
      });
      setCreds({
        email: result.user.email,
        password: result.generatedPassword,
        role: creating === 'admin' ? 'Customer Admin' : 'Member (SME)',
        headline:
          creating === 'admin' ? 'Customer Admin created' : 'Member created',
      });
      setNewEmail('');
      setNewName('');
      setCreating(null);
      await refetch();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegenerate = async (userId: string, email: string) => {
    if (!companyId) return;
    try {
      const result = await companiesService.regeneratePassword(companyId, userId);
      setCreds({
        email,
        password: result.generatedPassword,
        role: 'New password',
        headline: 'Password regenerated',
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to regenerate');
    }
  };

  const handleRemove = async (userId: string, email: string) => {
    if (!companyId) return;
    if (!confirm(`Remove ${email} from this company?`)) return;
    try {
      await companiesService.removeMember(companyId, userId);
      await refetch();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove');
    }
  };

  if (loading) {
    return (
      <div className="dashboard-page">
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Loading company…</p>
        </div>
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="dashboard-page">
        <div className="error-container">
          <p className="error-message">{error ?? 'Company not found'}</p>
          {!hideBackLink && (
            <Link to="/admin/companies" className="back-link">
              <ArrowLeft size={16} /> Back to Companies
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        {!hideBackLink && (
          <Link to="/admin/companies" className="back-link">
            <ArrowLeft size={16} /> Back to Companies
          </Link>
        )}
        <h1>{company.name}</h1>
        <p>{company.description || 'No description yet.'}</p>
      </div>

      <div className="company-detail-tabs">
        {!hideDealsTab && (
          <button
            type="button"
            className={`tab ${tab === 'deals' ? 'active' : ''}`}
            onClick={() => setTab('deals')}
          >
            Deals ({company.projects.length})
          </button>
        )}
        <button
          type="button"
          className={`tab ${tab === 'members' ? 'active' : ''}`}
          onClick={() => setTab('members')}
        >
          Members ({company.members.length})
        </button>
        <button
          type="button"
          className={`tab ${tab === 'settings' ? 'active' : ''}`}
          onClick={() => setTab('settings')}
        >
          Settings
        </button>
      </div>

      <div className="dashboard-content">
        {tab === 'deals' && !hideDealsTab && (
          <>
            {company.projects.length === 0 ? (
              <div className="empty-state">
                <Briefcase size={48} strokeWidth={1} />
                <h3>No deals yet</h3>
                <p>
                  The Customer Admin can create deals from their own dashboard.
                </p>
              </div>
            ) : (
              <div className="projects-grid">
                {company.projects.map((project) => {
                  const hasBrief = project.briefManifest != null;
                  const updated = relativeTime(project.updatedAt);
                  return (
                    <EntityCard
                      key={project.id}
                      to={`/projects/${project.id}`}
                      title={project.name}
                      description={project.description}
                      chips={
                        hasBrief ? (
                          <span className="chip accent">
                            <Sparkles size={11} /> Brief ready
                          </span>
                        ) : (
                          <span className="chip">Awaiting brief</span>
                        )
                      }
                      stats={[
                        {
                          label: 'Documents',
                          icon: <FileText size={14} />,
                          value: project.documentCount ?? 0,
                        },
                        {
                          label: 'Tasks',
                          icon: <CheckSquare size={14} />,
                          value: project.taskCount ?? 0,
                        },
                        {
                          label: 'Members',
                          icon: <Users size={14} />,
                          value: project.memberCount ?? 0,
                        },
                      ]}
                      footerRight={
                        updated && (
                          <span className="project-card-time">
                            Updated {updated}
                          </span>
                        )
                      }
                    />
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === 'members' && (
          <div className="company-members-list">
            {canManage && (
              <div className="members-actions">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => {
                    setFormError(null);
                    setCreating('admin');
                  }}
                >
                  <Plus size={14} /> Add Customer Admin
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setFormError(null);
                    setCreating('member');
                  }}
                >
                  <Plus size={14} /> Add Member (SME)
                </button>
              </div>
            )}

            {company.members.length === 0 ? (
              <div className="empty-state">
                <Users size={48} strokeWidth={1} />
                <h3>No members yet</h3>
              </div>
            ) : (
              <table className="members-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                    {canManage && <th className="actions-cell">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {company.members.map((m) => {
                    const isSelf = user?.id === m.id;
                    return (
                      <tr key={m.id}>
                        <td>{m.name || '—'}</td>
                        <td>{m.email}</td>
                        <td>
                          <span className="chip">{m.platformRole}</span>
                        </td>
                        <td>{relativeTime(m.createdAt)}</td>
                        {canManage && (
                          <td className="actions-cell">
                            <button
                              type="button"
                              className="icon-button"
                              title="Regenerate password"
                              onClick={() => handleRegenerate(m.id, m.email)}
                            >
                              <KeyRound size={14} />
                            </button>
                            {m.platformRole === 'MEMBER' && !isSelf && (
                              <button
                                type="button"
                                className="icon-button"
                                title="Remove user"
                                onClick={() => handleRemove(m.id, m.email)}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div className="company-settings">
            <p className="form-hint">
              Settings for editing company details will live here.
            </p>
          </div>
        )}
      </div>

      {creating && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <form className="modal-card" onSubmit={handleCreate}>
            <h2>
              {creating === 'admin' ? 'Add Customer Admin' : 'Add Member (SME)'}
            </h2>
            <p className="modal-subtitle">
              A random password will be generated. You'll see it once.
            </p>

            <div className="form-group">
              <label>
                Email <span className="required">*</span>
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                placeholder={
                  creating === 'admin' ? 'co-admin@acme.com' : 'sme@acme.com'
                }
              />
            </div>
            <div className="form-group">
              <label>Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Jane Doe"
                maxLength={255}
              />
            </div>

            {formError && <p className="error-message">{formError}</p>}

            <div className="modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setCreating(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={submitting || !newEmail.trim()}
              >
                {submitting ? 'Creating…' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {creds && (
        <CredentialsRevealModal
          email={creds.email}
          password={creds.password}
          headline={creds.headline}
          role={creds.role}
          onClose={() => setCreds(null)}
        />
      )}
    </div>
  );
}
