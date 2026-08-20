import { useCallback, useEffect, useMemo, useState } from 'react';
import './deal-memo.css';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Diamond, FileText, Scale, Calendar } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiClient, briefService } from '../api';
import { useAuth } from '../auth';
import type { DealBrief } from '../types/api';

/* ---------------------------------------------------------------- */
/* Brief parsing                                                     */
/* ---------------------------------------------------------------- */

interface BriefMeta {
  project?: string;
  last_updated?: string;
  doc_count?: string | number;
  portfolio_risk?: string | number;
  scope?: string;
  [key: string]: string | number | undefined;
}

interface ParsedBrief {
  meta: BriefMeta;
  body: string;
}

const parseBriefMarkdown = (raw: string | null | undefined): ParsedBrief => {
  if (!raw) return { meta: {}, body: '' };
  let remaining = raw.trim();
  const meta: BriefMeta = {};
  const fmMatch = remaining.match(/^---\s*\n([\s\S]*?)\n---\s*/);
  if (fmMatch) {
    for (const line of fmMatch[1].split('\n')) {
      const m = line.match(/^\s*([a-z_][a-z0-9_]*)\s*:\s*(.*?)\s*$/i);
      if (m) meta[m[1]] = m[2];
    }
    remaining = remaining.slice(fmMatch[0].length);
  }
  remaining = remaining.replace(/<!--[\s\S]*?-->/g, '');
  remaining = remaining.replace(/\n{3,}/g, '\n\n').trim();
  return { meta, body: remaining };
};

/** Body of one `# Heading` section, up to the next `# `. */
const sectionBody = (markdown: string, heading: string): string => {
  const lines = markdown.split('\n');
  const want = `# ${heading}`.toLowerCase();
  const start = lines.findIndex((l) => l.trim().toLowerCase() === want);
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#\s/.test(l));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
};

interface Risk {
  title: string;
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  source: string | null;
  rationale: string;
}

/** Parse the Top Risks section into structured, ranked entries. */
const parseRisks = (body: string): Risk[] => {
  const out: Risk[] = [];
  // Each risk starts with `N. ` and may wrap; split on leading enumerator.
  const blocks = body.split(/\n(?=\s*\d+\.\s)/);
  for (const block of blocks) {
    const flat = block.replace(/\s+/g, ' ').trim();
    const m = flat.match(
      /^\d+\.\s+(.+?)\s*(?:\(\[([^\]]*)\]\))?\s*—\s*(HIGH|MEDIUM|LOW)\b\.?\s*(.*)$/i
    );
    if (!m) continue;
    const rawSource = (m[2] ?? '').trim();
    // Strip a trailing `p.N` page ref and the .pdf extension for a clean label.
    const source = rawSource
      ? rawSource.replace(/\s*p\.\d+.*$/i, '').replace(/\.pdf$/i, '').trim()
      : null;
    out.push({
      title: m[1].trim(),
      level: m[3].toUpperCase() as Risk['level'],
      source,
      rationale: m[4].trim(),
    });
  }
  return out;
};

interface KeyDate {
  date: string;
  label: string;
}

const parseDates = (body: string, limit: number): KeyDate[] => {
  const out: KeyDate[] = [];
  for (const line of body.split('\n')) {
    // `- 2018-11-20: Effective date — filename.pdf`
    const m = line.match(/^[-*]\s*(\d{4}-\d{2}-\d{2})\s*:\s*(.+?)\s*—\s*(.+?)\s*$/);
    if (!m) continue;
    const doc = m[3].replace(/\.pdf$/i, '').trim();
    out.push({ date: m[1], label: `${m[2].trim()} · ${doc}` });
    if (out.length >= limit) break;
  }
  return out;
};

const countPartyHeadings = (body: string): number =>
  (body.match(/^##\s+/gm) ?? []).length;

const countListItems = (body: string): number =>
  body && !/^_?No\b/i.test(body.trim())
    ? body.split('\n').filter((l) => /^\s*(?:[-*]|\d+\.)\s+\S/.test(l)).length
    : 0;

const toInt = (v: string | number | undefined): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
};

const riskBand = (score: number): 'high' | 'medium' | 'low' =>
  score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low';

const prettyDate = (raw: string): string => {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

/* ---------------------------------------------------------------- */
/* Section rail                                                      */
/* ---------------------------------------------------------------- */

interface RailItem { id: string; label: string; }

/* ---------------------------------------------------------------- */

export function DealBriefPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isLoading: authLoading } = useAuth();
  const [brief, setBrief] = useState<DealBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const fetchBrief = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      setBrief(await briefService.get(projectId));
    } catch (err) {
      console.error('Failed to load brief:', err);
      setError('Failed to load deal brief');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (authLoading || !apiClient.isReady()) return;
    fetchBrief();
  }, [authLoading, fetchBrief]);

  const handleRebuild = async () => {
    if (!projectId) return;
    try {
      setRebuilding(true);
      setError(null);
      await briefService.rebuild(projectId);
      await fetchBrief();
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Rebuild failed — check server logs.');
    } finally {
      setRebuilding(false);
    }
  };

  const { meta, body } = useMemo(
    () => parseBriefMarkdown(brief?.markdown ?? null),
    [brief?.markdown]
  );

  const memo = useMemo(() => {
    const overview = sectionBody(body, 'Deal Snapshot');
    const risks = parseRisks(sectionBody(body, 'Top Risks')).slice(0, 6);
    const dates = parseDates(sectionBody(body, 'Key Dates'), 6);
    const partyCount = countPartyHeadings(sectionBody(body, 'Parties'));
    const anomalyCount = countListItems(sectionBody(body, 'Cross-document Anomalies'));
    return { overview, risks, dates, partyCount, anomalyCount };
  }, [body]);

  const portfolioRisk = toInt(meta.portfolio_risk);
  const docCount = toInt(meta.doc_count);

  const rail: RailItem[] = useMemo(() => {
    const items: RailItem[] = [];
    if (memo.overview) items.push({ id: 'overview', label: 'Deal Overview' });
    if (portfolioRisk != null) items.push({ id: 'posture', label: 'Risk Posture' });
    if (memo.risks.length) items.push({ id: 'key-risks', label: 'Key Risks' });
    if (memo.dates.length) items.push({ id: 'key-dates', label: 'Key Dates' });
    items.push({ id: 'glance', label: 'At a Glance' });
    return items;
  }, [memo, portfolioRisk]);

  // Scroll-spy for the rail.
  useEffect(() => {
    if (rail.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-90px 0px -65% 0px', threshold: 0.01 }
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

  const dealName = meta.project || 'Deal Memorandum';
  const scopeWord = brief?.scopeKey === 'full' ? 'Full access' : brief?.scopeLabel || 'Scoped access';
  const updated = brief?.updatedAt || meta.last_updated;

  return (
    <div className="memo-page">
      <div className="memo-topbar">
        <Link to={`/projects/${projectId}`} className="button ghost sm">
          <ArrowLeft size={14} /> Overview
        </Link>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          {brief && (
            <span className={brief.scopeKey === 'full' ? 'chip primary' : 'chip accent'}>
              {brief.scopeLabel}
            </span>
          )}
          <button className="button secondary sm" onClick={handleRebuild} disabled={rebuilding}>
            <RefreshCw size={14} className={rebuilding ? 'loading-spinner' : ''} />
            {rebuilding ? 'Rebuilding…' : 'Rebuild now'}
          </button>
        </div>
      </div>

      {error && <div className="error-container"><span className="error-message">{error}</span></div>}

      {!brief?.markdown ? (
        <div className="empty-state">
          <h3>No deal brief yet</h3>
          <p>Upload documents to the Data Room. Once extraction completes, the memorandum is generated automatically.</p>
          <Link className="button primary" to={`/projects/${projectId}/vdr`}>Go to Data Room</Link>
        </div>
      ) : (
        <>
          {/* Full-width header band */}
          <header className="memo-header">
            <div className="memo-header__inner">
              <div>
                <div className="memo-eyebrow">Deal Memorandum · {scopeWord}</div>
                <h1 className="memo-header__title">{dealName}</h1>
              </div>
              <div className="memo-header__meta">
                {portfolioRisk != null && (
                  <div className="memo-stat">
                    <span className="memo-stat__label">Portfolio risk</span>
                    <span className="memo-riskbadge">
                      <span className="memo-riskbadge__score">{portfolioRisk}<span>/10</span></span>
                      <span className={`chip risk-${riskBand(portfolioRisk) === 'medium' ? 'med' : riskBand(portfolioRisk)}`}>
                        {riskBand(portfolioRisk).toUpperCase()}
                      </span>
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
                    <span className="memo-stat__value" style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                      {prettyDate(updated)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Paper (left) + rail (right) */}
          <div className="memo-layout">
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
                <p className="memo-doc-title">
                  <span className="memo-recap__re">Re:</span> {dealName}
                </p>
                <p className="memo-doc-subtitle">
                  {scopeWord}{docCount != null ? ` · ${docCount} documents` : ''}{updated ? ` · Prepared ${prettyDate(updated)}` : ''}
                </p>
              </div>

              {memo.overview && (
                <section id="overview" className="memo-section">
                  <div className="memo-section__head">
                    <span className="memo-section__num">01</span>
                    <h3 className="memo-section__title">Deal Overview</h3>
                    <span className="memo-section__rule" />
                  </div>
                  <div className="memo-prose">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{memo.overview}</ReactMarkdown>
                  </div>
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
                        <div
                          className={`memo-posture__fill is-${riskBand(portfolioRisk)}`}
                          style={{ width: `${(portfolioRisk / 10) * 100}%` }}
                        />
                      </div>
                      <p className="memo-posture__caption">
                        Page-weighted mean across {docCount ?? 'all'} documents · {riskBand(portfolioRisk).toUpperCase()} ·
                        {memo.anomalyCount > 0 ? ` ${memo.anomalyCount} cross-document anomalies flagged` : ' no cross-document anomalies'}
                      </p>
                    </div>
                  </div>
                </section>
              )}
              </div>
              <footer className="memo-sheet__foot">
                <span>DealDiligence · Confidential</span>
                <span>Page 1 of 3</span>
              </footer>
            </article>

            {/* ── Page 2 ── */}
            <article className="memo-sheet">
              <div className="memo-sheet__body">
              <div className="memo-runhead">
                <span>{dealName} — Diligence Memorandum</span>
                <span>Confidential</span>
              </div>

              {memo.risks.length > 0 && (
                <section id="key-risks" className="memo-section">
                  <div className="memo-section__head">
                    <span className="memo-section__num">03</span>
                    <h3 className="memo-section__title">Key Risks</h3>
                    <span className="memo-section__rule" />
                  </div>
                  <div className="memo-risks">
                    {memo.risks.map((r, i) => (
                      <div key={i} className={`memo-risk is-${r.level.toLowerCase()}`}>
                        <div className="memo-risk__top">
                          <span className="memo-risk__level">{r.level}</span>
                          <span className="memo-risk__title">{r.title}</span>
                        </div>
                        {r.rationale && <p className="memo-risk__body">{r.rationale}</p>}
                        {r.source && (
                          <div className="memo-risk__source" title={r.source}>
                            <FileText size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} />
                            {r.source}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              </div>
              <footer className="memo-sheet__foot">
                <span>DealDiligence · Confidential</span>
                <span>Page 2 of 3</span>
              </footer>
            </article>

            {/* ── Page 3 ── */}
            <article className="memo-sheet">
              <div className="memo-sheet__body">
              <div className="memo-runhead">
                <span>{dealName} — Diligence Memorandum</span>
                <span>Confidential</span>
              </div>

              {memo.dates.length > 0 && (
                <section id="key-dates" className="memo-section">
                  <div className="memo-section__head">
                    <span className="memo-section__num">04</span>
                    <h3 className="memo-section__title">Key Dates</h3>
                    <span className="memo-section__rule" />
                  </div>
                  <div className="memo-dates">
                    {memo.dates.map((d, i) => (
                      <div key={i} className="memo-date-row">
                        <span className="memo-date-row__date">{d.date}</span>
                        <span className="memo-date-row__label" title={d.label}>{d.label}</span>
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
                    <div className="memo-glance__value">{memo.partyCount || '—'}</div>
                    <div className="memo-glance__label">Counterparties</div>
                  </div>
                  <div className="memo-glance__cell">
                    <div className="memo-glance__value">{memo.risks.filter((r) => r.level === 'HIGH').length}</div>
                    <div className="memo-glance__label">High risks</div>
                  </div>
                  <div className="memo-glance__cell">
                    <div className="memo-glance__value">{memo.anomalyCount || '—'}</div>
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
                <span>Page 3 of 3</span>
              </footer>
            </article>
            </div>

            {rail.length > 0 && (
              <nav className="memo-rail" aria-label="Memorandum sections">
                <div className="memo-rail__label">Sections</div>
                {rail.map(({ id, label }) => {
                  const Icon = id === 'key-dates' ? Calendar : id === 'posture' ? Scale : FileText;
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
                      <Icon size={13} style={{ flexShrink: 0, opacity: 0.7 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
                    </a>
                  );
                })}
              </nav>
            )}
          </div>
        </>
      )}
    </div>
  );
}
