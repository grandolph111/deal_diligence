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
  projectsService,
  type CompanyDetail,
  type CreateCompanyMemberResponse,
  type UpdateCompanyDto,
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

  const [settingsName, setSettingsName] = useState('');
  const [settingsDesc, setSettingsDesc] = useState('');
  const [settingsPlaybook, setSettingsPlaybook] = useState('');
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [creatingDeal, setCreatingDeal] = useState(false);
  const [newDealName, setNewDealName] = useState('');
  const [newDealDesc, setNewDealDesc] = useState('');
  const [dealSubmitting, setDealSubmitting] = useState(false);
  const [dealError, setDealError] = useState<string | null>(null);

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
      setSettingsName(data.name);
      setSettingsDesc(data.description ?? '');
      setSettingsPlaybook(data.playbook?.content ?? '');
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
          setSettingsName(data.name);
          setSettingsDesc(data.description ?? '');
          setSettingsPlaybook(data.playbook?.content ?? '');
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

  const handleDealCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setDealError(null);
    setDealSubmitting(true);
    try {
      const project = await projectsService.createProject({
        name: newDealName.trim(),
        description: newDealDesc.trim() || undefined,
        companyId,
      });
      setCreatingDeal(false);
      setNewDealName('');
      setNewDealDesc('');
      await refetch();
      window.location.href = `/projects/${project.id}`;
    } catch (err) {
      setDealError(err instanceof Error ? err.message : 'Failed to create deal');
    } finally {
      setDealSubmitting(false);
    }
  };

  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSaved(false);
    try {
      const patch: UpdateCompanyDto = {};
      if (settingsName.trim()) patch.name = settingsName.trim();
      patch.description = settingsDesc.trim() || null;
      patch.playbook = settingsPlaybook.trim() || null;
      await companiesService.updateCompany(companyId, patch);
      await refetch();
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2500);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!companyId) return;
    if (!confirm(`Permanently delete "${company?.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await companiesService.deleteCompany(companyId);
      window.history.back();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
      setDeleting(false);
    }
  };

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
            {canManage && (
              <div className="members-actions">
                <button
                  type="button"
                  className="button primary"
                  onClick={() => { setDealError(null); setCreatingDeal(true); }}
                >
                  <Plus size={14} /> New Deal
                </button>
              </div>
            )}
            {company.projects.length === 0 ? (
              <div className="empty-state">
                <Briefcase size={48} strokeWidth={1} />
                <h3>No deals yet</h3>
                <p>Create a deal to get started.</p>
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
            <form onSubmit={handleSettingsSave}>
              <div className="form-group">
                <label>Company Name</label>
                <input
                  type="text"
                  value={settingsName}
                  onChange={(e) => setSettingsName(e.target.value)}
                  required
                  maxLength={255}
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={settingsDesc}
                  onChange={(e) => setSettingsDesc(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="Optional description"
                />
              </div>
              <div className="form-group">
                <label>Playbook</label>
                <p className="form-hint">Deal checklist or instructions for this company's deals. Markdown supported.</p>
                <textarea
                  value={settingsPlaybook}
                  onChange={(e) => setSettingsPlaybook(e.target.value)}
                  rows={10}
                  maxLength={50000}
                  placeholder="## Due Diligence Checklist&#10;&#10;- [ ] Review financials&#10;- [ ] Legal review"
                />
              </div>
              {settingsError && <p className="error-message">{settingsError}</p>}
              {settingsSaved && <p className="success-message">Saved.</p>}
              <div className="settings-actions">
                <button type="submit" className="button primary" disabled={settingsSaving}>
                  {settingsSaving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>

            {canManage && user?.platformRole === 'SUPER_ADMIN' && (
              <div className="danger-zone">
                <h3>Danger Zone</h3>
                <p>Permanently delete this company and all its data.</p>
                <button
                  type="button"
                  className="button danger"
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete Company'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {creatingDeal && (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <form className="modal-card" onSubmit={handleDealCreate}>
            <h2>New Deal</h2>
            <div className="form-group">
              <label>Deal Name <span className="required">*</span></label>
              <input
                type="text"
                value={newDealName}
                onChange={(e) => setNewDealName(e.target.value)}
                required
                placeholder="e.g. Acme Corp Acquisition"
                maxLength={255}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea
                value={newDealDesc}
                onChange={(e) => setNewDealDesc(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder="Optional"
              />
            </div>
            {dealError && <p className="error-message">{dealError}</p>}
            <div className="modal-actions">
              <button type="button" className="button secondary" onClick={() => setCreatingDeal(false)}>Cancel</button>
              <button type="submit" className="button primary" disabled={dealSubmitting || !newDealName.trim()}>
                {dealSubmitting ? 'Creating…' : 'Create Deal'}
              </button>
            </div>
          </form>
        </div>
      )}

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
