import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  FileText,
  Kanban,
  Settings,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { apiClient, dashboardService, projectsService } from '../api';
import { useAuth } from '../auth';
import { ConfidencePill } from '../components/ConfidencePill';
import { RenameableTitle } from '../components/RenameableTitle';
import type { DashboardResponse } from '../api/services/dashboard.service';

const formatCurrency = (value: number | null, currency: string | null) => {
  if (value == null) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency ?? ''} ${value.toLocaleString()}`.trim();
  }
};

const formatDate = (value: string | null) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const riskChipClass = (level: string | null) => {
  if (level === 'HIGH') return 'chip risk-high';
  if (level === 'MEDIUM') return 'chip risk-med';
  if (level === 'LOW') return 'chip risk-low';
  return 'chip';
};

export function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isLoading: authLoading } = useAuth();

  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading || !apiClient.isReady() || !projectId) return;

    let cancelled = false;
    const fetchDashboard = async (isInitial: boolean) => {
      try {
        if (isInitial) {
          setLoading(true);
          setError(null);
        }
        const res = await dashboardService.getProjectDashboard(projectId);
        if (cancelled) return;
        setData(res);
        if (isInitial) setProjectName(res.project.name);
        if (isInitial) setError(null);
      } catch (err) {
        if (cancelled) return;
        if (isInitial) {
          console.error('Failed to load dashboard:', err);
          setError('Failed to load dashboard');
        }
        // Silently swallow background refresh errors to avoid flicker.
      } finally {
        if (isInitial && !cancelled) setLoading(false);
      }
    };

    // Initial load + periodic refresh so counts like "Open AI tasks" update
    // while a task is running in the background.
    fetchDashboard(true);
    const interval = window.setInterval(() => fetchDashboard(false), 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [projectId, authLoading]);

  if (authLoading || loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading deal dashboard…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ padding: 'var(--space-8)' }}>
        <Link to="/dashboard" className="button ghost sm">
          <ArrowLeft size={14} /> Back
        </Link>
        <div className="error-container" style={{ marginTop: 'var(--space-4)' }}>
          <p className="error-message">{error ?? 'Project not found'}</p>
        </div>
      </div>
    );
  }

  const { project, scope, header, riskStrip, documentsByRisk, entitySummary, recentReports } = data;

  const displayName = projectName ?? project.name;

  const handleRenameProject = async (newName: string) => {
    setProjectName(newName);
    try {
      await projectsService.updateProject(project.id, { name: newName });
    } catch {
      setProjectName(displayName);
    }
  };

  const riskScore = header.portfolioRiskScore;
  const riskScoreLevel: 'LOW' | 'MEDIUM' | 'HIGH' | null =
    riskScore == null ? null : riskScore >= 7 ? 'HIGH' : riskScore >= 4 ? 'MEDIUM' : 'LOW';

  // Zero-grant SME: friendly empty state instead of a dashboard full of zeros.
  const isLockedOut = !scope.isFullAccess && scope.allowedFolderCount === 0;
  if (isLockedOut) {
    return (
      <div style={{ padding: 'var(--space-6) var(--space-8)' }}>
        <Link to="/dashboard" className="button ghost sm">
          <ArrowLeft size={14} /> All deals
        </Link>
        <div className="empty-state" style={{ marginTop: 'var(--space-6)' }}>
          <h2 style={{ marginBottom: 'var(--space-2)' }}>{project.name}</h2>
          <p>
            You're a member of this deal but haven't been granted access to any
            Data Room folders yet. Ask your Customer Admin to share the folders
            you need and then refresh.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 'var(--space-6) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
      {/* Back + settings */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/dashboard" className="button ghost sm">
          <ArrowLeft size={14} /> All deals
        </Link>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <span
            className={scope.isFullAccess ? 'chip primary' : 'chip accent'}
            title={scope.isFullAccess ? 'Full deal access' : `Scoped to ${scope.allowedFolderCount} folder(s)`}
          >
            {scope.isFullAccess ? 'Full deal access' : `Scoped · ${scope.allowedFolderCount} folder(s)`}
          </span>
          <Link to={`/projects/${projectId}/settings`} className="button secondary sm">
            <Settings size={14} /> Admin
          </Link>
        </div>
      </div>

      {/* Deal header */}
      <div className="card" style={{ padding: 'var(--space-6)', position: 'relative', overflow: 'hidden' }}>
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(600px 200px at 100% 0%, rgb(199 164 108 / 0.08), transparent 70%), radial-gradient(400px 200px at 0% 100%, rgb(30 58 95 / 0.05), transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 'var(--space-6)', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', marginBottom: 'var(--space-2)' }}>
              Deal
            </div>
            <RenameableTitle
              value={displayName}
              onSave={handleRenameProject}
              tag="h1"
              style={{ margin: 0 }}
            />
            {project.description && project.description !== 'x' && (
              <p style={{ marginTop: 'var(--space-2)', color: 'var(--text-secondary)' }}>{project.description}</p>
            )}
          </div>
          <Metric label="Deal value" value={formatCurrency(header.dealValue, header.dealCurrency)} />
          <Metric label="Effective" value={formatDate(header.effectiveDate)} />
          <Metric label="Governing law" value={header.governingLaw ?? null} />
          <div
            title="Weighted average of each document's risk score (0–10), weighted by page count. LOW <4 · MEDIUM 4–6 · HIGH ≥7"
          >
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>
              Portfolio risk
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
              {riskScore != null ? (
                <>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)', fontWeight: 500 }}>
                    {riskScore}
                    <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-lg)' }}>/10</span>
                  </div>
                  {riskScoreLevel && <span className={riskChipClass(riskScoreLevel)}>{riskScoreLevel}</span>}
                </>
              ) : (
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
                  Awaiting extraction
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Risk strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-4)' }}>
        <StripCard icon={ShieldAlert} label="High-risk documents" value={riskStrip.highRiskDocuments} tone="risk-high" />
        <StripCard icon={Sparkles} label="Open AI tasks" value={riskStrip.openAiTasks} tone="primary" />
        <StripCard icon={CheckCircle2} label="Pending specialist reviews" value={riskStrip.pendingSpecialistReviews} tone="accent" />
        <StripCard icon={AlertCircle} label="Flagged clauses" value={riskStrip.flaggedClauses} tone="risk-med" />
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-4)' }}>
        <Link to={`/projects/${projectId}/boards`} className="card interactive" style={{ padding: 'var(--space-5)' }}>
          <Kanban size={20} style={{ color: 'var(--color-primary)' }} />
          <div style={{ fontWeight: 500, marginTop: 'var(--space-3)' }}>Kanban · AI workflow</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
            Prompt the AI against attached documents. Reports land in review.
          </p>
        </Link>
        <Link to={`/projects/${projectId}/vdr`} className="card interactive" style={{ padding: 'var(--space-5)' }}>
          <FileText size={20} style={{ color: 'var(--color-primary)' }} />
          <div style={{ fontWeight: 500, marginTop: 'var(--space-3)' }}>Data room</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
            Upload documents. Each gets a CUAD-aligned fact sheet + risk score.
          </p>
        </Link>
        <Link to={`/projects/${projectId}/entities`} className="card interactive" style={{ padding: 'var(--space-5)' }}>
          <Building2 size={20} style={{ color: 'var(--color-primary)' }} />
          <div style={{ fontWeight: 500, marginTop: 'var(--space-3)' }}>Entities & graph</div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
            Parties, people, jurisdictions, valuations aggregated across the deal.
          </p>
        </Link>
      </div>

      {/* Documents by risk */}
      <section>
        <h2 style={{ marginBottom: 'var(--space-4)' }}>Documents by risk</h2>
        {documentsByRisk.length === 0 ? (
          <div className="empty-state">
            <FileText size={24} />
            <h3>No documents yet</h3>
            <p>Upload documents to the data room to start risk analysis.</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Document</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Type</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Risk</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Confidence</th>
                  <th style={{ padding: 'var(--space-3) var(--space-4)' }}>Summary</th>
                </tr>
              </thead>
              <tbody>
                {documentsByRisk.slice(0, 12).map((d) => (
                  <tr key={d.id} style={{ borderTop: '1px solid var(--border-primary)' }}>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', fontWeight: 500 }}>{d.name}</td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--text-secondary)' }}>{d.documentType ?? '—'}</td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <span className={riskChipClass(d.riskLevel)}>
                        {d.riskScore != null ? `${d.riskScore}/10` : d.riskLevel ?? '—'}
                      </span>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <ConfidencePill score={d.confidenceScore} reason={d.confidenceReason} />
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)', color: 'var(--text-secondary)' }}>
                      {d.riskSummary ?? d.extractionSummary ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Entities + recent reports */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', alignItems: 'stretch' }}>
        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ marginBottom: 'var(--space-4)' }}>Entity rollups</h2>
          <div className="card" style={{ padding: 'var(--space-4)', flex: 1, display: 'flex', alignItems: 'center' }}>
            {entitySummary.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--text-tertiary)', width: '100%' }}>
                <Building2 size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span>Entities appear after your first document is analyzed.</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-3)', width: '100%' }}>
                {entitySummary.map((e) => (
                  <div key={e.entityType} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{e.entityType}</span>
                    <span style={{ fontWeight: 500 }}>{e.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ marginBottom: 'var(--space-4)' }}>Recent AI reports</h2>
          {recentReports.length === 0 ? (
            <div
              className="card"
              style={{
                padding: 'var(--space-5)',
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                color: 'var(--text-tertiary)',
              }}
            >
              <Sparkles size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span>Run a Kanban AI task to produce a risk report.</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', flex: 1 }}>
              {recentReports.map((r) => (
                <Link
                  key={r.id}
                  to={`/projects/${projectId}/boards`}
                  className="card interactive"
                  style={{ padding: 'var(--space-4)', display: 'block' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-2)' }}>
                    <span style={{ fontWeight: 500 }}>{r.title}</span>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <ConfidencePill score={r.aiConfidenceScore} reason={r.aiConfidenceReason} />
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                        {formatDate(r.aiCompletedAt)}
                      </span>
                    </div>
                  </div>
                  {r.aiReportSummary && (
                    <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)' }}>
                      {r.aiReportSummary}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | null }) {
  const isEmpty = value == null || value === '—';
  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>
        {label}
      </div>
      {isEmpty ? (
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 'var(--space-2)' }}>
          Not yet extracted
        </div>
      ) : (
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-xl)', fontWeight: 500, marginTop: 'var(--space-1)' }}>
          {value}
        </div>
      )}
    </div>
  );
}

function StripCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  tone: 'risk-high' | 'risk-med' | 'primary' | 'accent';
}) {
  const toneMap: Record<string, { bg: string; fg: string }> = {
    'risk-high': { bg: 'var(--risk-high-bg)', fg: 'var(--risk-high)' },
    'risk-med': { bg: 'var(--risk-med-bg)', fg: 'var(--risk-med)' },
    primary: { bg: 'var(--color-primary-light)', fg: 'var(--color-primary)' },
    accent: { bg: 'var(--color-accent-light)', fg: 'var(--color-gray-900)' },
  };
  const t = toneMap[tone];
  return (
    <div className="card" style={{ padding: 'var(--space-5)', display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 'var(--radius-md)',
          background: t.bg,
          color: t.fg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={20} />
      </div>
      <div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', fontWeight: 500 }}>{value}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>{label}</div>
      </div>
    </div>
  );
}

