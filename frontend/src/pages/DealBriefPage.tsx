import { useCallback, useEffect, useMemo, useState } from 'react';
import './deal-memo.css';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Diamond, FileText, Scale, Workflow, BookOpen, BarChart3 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiClient, briefService, dashboardService } from '../api';
import { libraryService, type DealMap } from '../api/services/library.service';
import type { DashboardResponse } from '../api/services/dashboard.service';
import { useAuth } from '../auth';
import type { DealBrief } from '../types/api';

/* ---------------------------------------------------------------- */
/* Brief parsing                                                     */
/* ---------------------------------------------------------------- */

interface BriefMeta {
  project?: string;
  portfolio_risk?: string | number;
  doc_count?: string | number;
  [key: string]: string | number | undefined;
}

const parseBriefMarkdown = (raw: string | null | undefined): { meta: BriefMeta; body: string } => {
  if (!raw) return { meta: {}, body: '' };
  let remaining = raw.trim();
  const meta: BriefMeta = {};
  const fm = remaining.match(/^---\s*\n([\s\S]*?)\n---\s*/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^\s*([a-z_][a-z0-9_]*)\s*:\s*(.*?)\s*$/i);
      if (m) meta[m[1]] = m[2];
    }
    remaining = remaining.slice(fm[0].length);
  }
  remaining = remaining.replace(/<!--[\s\S]*?-->/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return { meta, body: remaining };
};

const sectionBody = (markdown: string, heading: string): string => {
  const lines = markdown.split('\n');
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `# ${heading}`.toLowerCase());
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
};

const countListItems = (body: string): number =>
  body && !/^_?No\b/i.test(body.trim())
    ? body.split('\n').filter((l) => /^\s*(?:[-*]|\d+\.)\s+\S/.test(l)).length
    : 0;

const toInt = (v: string | number | undefined | null): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
};

const riskBand = (score: number): 'high' | 'medium' | 'low' =>
  score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low';
const chipRisk = (score: number) => `risk-${riskBand(score) === 'medium' ? 'med' : riskBand(score)}`;

const prettyDate = (raw: string): string => {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const cleanDocName = (name: string): string => name.replace(/\.pdf$/i, '').replace(/_/g, ' ');

/* ---------------------------------------------------------------- */
/* Workflow (riskCategory) rollup from the deal map                    */
/* ---------------------------------------------------------------- */

interface WorkflowRow {
  id: string;
  title: string;
  docCount: number;
  highCount: number;
  meanRisk: number | null;
}

const buildWorkflows = (map: DealMap | null): { rows: WorkflowRow[]; maxDocs: number } => {
  if (!map) return { rows: [], maxDocs: 0 };
  const docsByWs = new Map<string, { risks: number[]; high: number }>();
  for (const n of map.nodes) {
    if (n.type !== 'DOCUMENT') continue;
    const entry = docsByWs.get(n.riskCategoryId) ?? { risks: [], high: 0 };
    if (n.riskScore != null) entry.risks.push(n.riskScore);
    if ((n.riskScore ?? 0) >= 7 || n.riskLevel === 'HIGH') entry.high += 1;
    docsByWs.set(n.riskCategoryId, entry);
  }
  const rows: WorkflowRow[] = [];
  for (const n of map.nodes) {
    if (n.type !== 'RISK_CATEGORY') continue;
    const agg = docsByWs.get(n.riskCategoryId) ?? { risks: [], high: 0 };
    if (n.documentCount === 0) continue;
    rows.push({
      id: n.riskCategoryId,
      title: n.label,
      docCount: n.documentCount,
      highCount: agg.high,
      meanRisk: agg.risks.length ? agg.risks.reduce((a, b) => a + b, 0) / agg.risks.length : null,
    });
  }
  // Most risk first: high-risk docs, then mean risk, then volume.
  rows.sort(
    (a, b) =>
      b.highCount - a.highCount ||
      (b.meanRisk ?? 0) - (a.meanRisk ?? 0) ||
      b.docCount - a.docCount
  );
  const maxDocs = rows.reduce((m, r) => Math.max(m, r.docCount), 0);
  return { rows: rows.slice(0, 8), maxDocs };
};

/* ---------------------------------------------------------------- */

interface RailItem { id: string; label: string; }

export function DealBriefPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isLoading: authLoading } = useAuth();
  const [brief, setBrief] = useState<DealBrief | null>(null);
  const [dash, setDash] = useState<DashboardResponse | null>(null);
  const [dealMap, setDealMap] = useState<DealMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const b = await briefService.get(projectId);
      setBrief(b);
      // Supplementary data — best-effort; the memo still renders without it.
      dashboardService.getProjectDashboard(projectId).then(setDash).catch(() => undefined);
      libraryService.getDealMap(projectId).then(setDealMap).catch(() => undefined);
    } catch (err) {
      console.error('Failed to load brief:', err);
      setError('Failed to load deal memorandum');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (authLoading || !apiClient.isReady()) return;
    fetchAll();
  }, [authLoading, fetchAll]);

  const handleRebuild = async () => {
    if (!projectId) return;
    try {
      setRebuilding(true);
      setError(null);
      await briefService.rebuild(projectId);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Rebuild failed — check server logs.');
    } finally {
      setRebuilding(false);
    }
  };

  const { meta, body } = useMemo(() => parseBriefMarkdown(brief?.markdown ?? null), [brief?.markdown]);
  const overview = useMemo(() => sectionBody(body, 'Deal Snapshot'), [body]);
  const anomalyCount = useMemo(() => countListItems(sectionBody(body, 'Cross-document Anomalies')), [body]);

  const portfolioRisk = toInt(meta.portfolio_risk);
  const docCount = toInt(meta.doc_count);
  const topDocs = useMemo(() => (dash?.documentsByRisk ?? []).slice(0, 5), [dash]);
  const { rows: workflows, maxDocs } = useMemo(() => buildWorkflows(dealMap), [dealMap]);

  const rail: RailItem[] = useMemo(() => {
    const items: RailItem[] = [];
    if (overview) items.push({ id: 'overview', label: 'Deal Overview' });
    if (portfolioRisk != null) items.push({ id: 'posture', label: 'Risk Posture' });
    if (topDocs.length) items.push({ id: 'critical-docs', label: 'Critical Documents' });
    if (workflows.length) items.push({ id: 'workflows', label: 'Workflows by Risk' });
    items.push({ id: 'glance', label: 'At a Glance' });
    return items;
  }, [overview, portfolioRisk, topDocs, workflows]);

  useEffect(() => {
    if (rail.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-90px 0px -70% 0px', threshold: 0.01 }
    );
    rail.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [rail]);

  if (authLoading || loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading deal memorandum…</p>
      </div>
    );
  }

  const dealName = meta.project || brief?.scopeLabel || 'Deal Memorandum';
  const scopeWord = brief?.scopeKey === 'full' ? 'Full access' : brief?.scopeLabel || 'Scoped access';
  const updated = brief?.updatedAt;
  const railIcon = (id: string) =>
    id === 'critical-docs' ? FileText : id === 'workflows' ? Workflow : id === 'posture' ? Scale : id === 'glance' ? BarChart3 : BookOpen;

  return (
    <div className="memo-page">
      <div className="memo-topbar">
        <Link to={`/projects/${projectId}`} className="button ghost sm">
          <ArrowLeft size={14} /> Overview
        </Link>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          {brief && <span className={brief.scopeKey === 'full' ? 'chip primary' : 'chip accent'}>{brief.scopeLabel}</span>}
          <button className="button secondary sm" onClick={handleRebuild} disabled={rebuilding}>
            <RefreshCw size={14} className={rebuilding ? 'loading-spinner' : ''} />
            {rebuilding ? 'Rebuilding…' : 'Rebuild now'}
          </button>
        </div>
      </div>

      {error && <div className="error-container"><span className="error-message">{error}</span></div>}

      {!brief?.markdown ? (
        <div className="empty-state">
          <h3>No deal memorandum yet</h3>
          <p>Upload documents to the Data Room. Once extraction completes, the memorandum is generated automatically.</p>
          <Link className="button primary" to={`/projects/${projectId}/vdr`}>Go to Data Room</Link>
        </div>
      ) : (
        <>
          {/* Full-width header */}
          <header className="memo-header">
            <div className="memo-header__lead">
              <div className="memo-eyebrow">Deal Memorandum · {scopeWord}</div>
              <h1 className="memo-header__title">{dealName}</h1>
            </div>
            <div className="memo-header__meta">
              {portfolioRisk != null && (
                <div className="memo-stat">
                  <span className="memo-stat__label">Portfolio risk</span>
                  <span className="memo-riskbadge">
                    <span className="memo-riskbadge__score">{portfolioRisk}<span>/10</span></span>
                    <span className={`chip ${chipRisk(portfolioRisk)}`}>{riskBand(portfolioRisk).toUpperCase()}</span>
                  </span>
                </div>
              )}
              {docCount != null && (
                <div className="memo-stat">
                  <span className="memo-stat__label">Documents</span>
                  <span className="memo-stat__value">{docCount}</span>
                </div>
              )}
              {updated && (
                <div className="memo-stat">
                  <span className="memo-stat__label">Updated</span>
                  <span className="memo-stat__value memo-stat__value--sm">{prettyDate(updated)}</span>
                </div>
              )}
            </div>
          </header>

          {/* Left rail + document */}
          <div className="memo-layout">
            {rail.length > 0 && (
              <nav className="memo-rail" aria-label="Memorandum sections">
                <div className="memo-rail__label">Contents</div>
                {rail.map(({ id, label }) => {
                  const Icon = railIcon(id);
                  return (
                    <a
                      key={id}
                      href={`#${id}`}
                      className={`memo-rail__link${activeId === id ? ' is-active' : ''}`}
                      onClick={(e) => {
                        e.preventDefault();
                        const el = document.getElementById(id);
                        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setActiveId(id); }
                      }}
                    >
                      <Icon size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
                      <span className="memo-rail__text">{label}</span>
                    </a>
                  );
                })}
              </nav>
            )}

            <div className="memo-doc">
              {/* ── Page 1 ── */}
              <article className="memo-sheet memo-sheet--first">
                <div className="memo-sheet__body">
                  <div className="memo-letterhead">
                    <span className="memo-wordmark">
                      <span className="memo-wordmark__mark"><Diamond size={16} fill="currentColor" /></span>
                      DealDiligence
                    </span>
                    <span className="memo-confidential">Confidential · Privileged</span>
                  </div>

                  <div className="memo-recap">
                    <span className="memo-eyebrow">Memorandum</span>
                    <p className="memo-doc-title"><span className="memo-recap__re">Re:</span> {dealName}</p>
                    <p className="memo-doc-subtitle">
                      {scopeWord}{docCount != null ? ` · ${docCount} documents` : ''}{updated ? ` · Prepared ${prettyDate(updated)}` : ''}
                    </p>
                  </div>

                  {overview && (
                    <section id="overview" className="memo-section">
                      <div className="memo-section__head">
                        <span className="memo-section__num">01</span>
                        <h3 className="memo-section__title">Deal Overview</h3>
                        <span className="memo-section__rule" />
                      </div>
                      <div className="memo-prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{overview}</ReactMarkdown></div>
                    </section>
                  )}

                  {portfolioRisk != null && (
                    <section id="posture" className="memo-section">
                      <div className="memo-section__head">
                        <span className="memo-section__num">02</span>
                        <h3 className="memo-section__title">Risk Posture</h3>
                        <span className="memo-section__rule" />
                      </div>
                      <div className="memo-posture">
                        <div className="memo-posture__score">{portfolioRisk}<span>/10</span></div>
                        <div className="memo-posture__meter-wrap">
                          <div className="memo-posture__meter">
                            <div className={`memo-posture__fill is-${riskBand(portfolioRisk)}`} style={{ width: `${(portfolioRisk / 10) * 100}%` }} />
                          </div>
                          <p className="memo-posture__caption">
                            Page-weighted mean across {docCount ?? 'all'} documents · {riskBand(portfolioRisk).toUpperCase()}
                            {anomalyCount > 0 ? ` · ${anomalyCount} cross-document anomalies flagged` : ''}
                          </p>
                        </div>
                      </div>
                    </section>
                  )}

                  {topDocs.length > 0 && (
                    <section id="critical-docs" className="memo-section">
                      <div className="memo-section__head">
                        <span className="memo-section__num">03</span>
                        <h3 className="memo-section__title">Most Critical Documents</h3>
                        <span className="memo-section__rule" />
                      </div>
                      <ol className="memo-doclist">
                        {topDocs.map((d, i) => (
                          <li key={d.id} className="memo-doc-item">
                            <span className="memo-doc-item__rank">{String(i + 1).padStart(2, '0')}</span>
                            <div className="memo-doc-item__main">
                              <div className="memo-doc-item__head">
                                <span className="memo-doc-item__name" title={cleanDocName(d.name)}>{cleanDocName(d.name)}</span>
                                {d.riskScore != null && (
                                  <span className={`chip ${chipRisk(d.riskScore)} memo-doc-item__risk`}>{d.riskScore}/10</span>
                                )}
                              </div>
                              {(d.riskSummary || d.extractionSummary) && (
                                <p className="memo-doc-item__summary">{d.riskSummary ?? d.extractionSummary}</p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </section>
                  )}
                </div>
                <footer className="memo-sheet__foot">
                  <span>DealDiligence · Confidential</span>
                  <span>Page 1 of 2</span>
                </footer>
              </article>

              {/* ── Page 2 ── */}
              <article className="memo-sheet">
                <div className="memo-sheet__body">
                  <div className="memo-runhead">
                    <span>{dealName} — Diligence Memorandum</span>
                    <span>Confidential</span>
                  </div>

                  {workflows.length > 0 && (
                    <section id="workflows" className="memo-section">
                      <div className="memo-section__head">
                        <span className="memo-section__num">04</span>
                        <h3 className="memo-section__title">Workflows by Risk</h3>
                        <span className="memo-section__rule" />
                      </div>
                      <p className="memo-section__note">
                        Risk categories ranked by concentration of high-risk documents. Bar length shows how the {docCount ?? ''} documents distribute across categories.
                      </p>
                      <div className="memo-flow">
                        {workflows.map((w) => (
                          <div key={w.id} className="memo-flow-row">
                            <span className="memo-flow-row__title" title={w.title}>{w.title}</span>
                            <div className="memo-flow-row__track">
                              <div
                                className={`memo-flow-row__bar is-${w.meanRisk != null ? riskBand(w.meanRisk) : 'low'}`}
                                style={{ width: `${maxDocs ? Math.max((w.docCount / maxDocs) * 100, 4) : 0}%` }}
                              />
                            </div>
                            <span className="memo-flow-row__count">{w.docCount}</span>
                            <span className={`memo-flow-row__high${w.highCount > 0 ? ' has-high' : ''}`}>
                              {w.highCount > 0 ? `${w.highCount} high` : '—'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  <section id="glance" className="memo-section">
                    <div className="memo-section__head">
                      <span className="memo-section__num">05</span>
                      <h3 className="memo-section__title">Portfolio at a Glance</h3>
                      <span className="memo-section__rule" />
                    </div>
                    <div className="memo-glance">
                      <div className="memo-glance__cell">
                        <div className="memo-glance__value">{docCount ?? '—'}</div>
                        <div className="memo-glance__label">Documents</div>
                      </div>
                      <div className="memo-glance__cell">
                        <div className="memo-glance__value">{dash?.riskStrip.highRiskDocuments ?? '—'}</div>
                        <div className="memo-glance__label">High-risk docs</div>
                      </div>
                      <div className="memo-glance__cell">
                        <div className="memo-glance__value">{dealMap?.stats.riskCategories || workflows.length || '—'}</div>
                        <div className="memo-glance__label">Workflows</div>
                      </div>
                      <div className="memo-glance__cell">
                        <div className="memo-glance__value">{anomalyCount || '—'}</div>
                        <div className="memo-glance__label">Anomalies</div>
                      </div>
                    </div>
                  </section>

                  <p className="memo-endnote">
                    Full clause-level detail, every party, and the complete document registry are in the{' '}
                    <Link to={`/projects/${projectId}/vdr`} style={{ color: 'var(--color-primary)' }}>Data Room</Link>.
                  </p>
                </div>
                <footer className="memo-sheet__foot">
                  <span>DealDiligence · Confidential</span>
                  <span>Page 2 of 2</span>
                </footer>
              </article>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
