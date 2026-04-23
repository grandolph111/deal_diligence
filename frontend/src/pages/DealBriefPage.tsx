import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Edit3,
  Save,
  X,
  Calendar,
  FileText,
  ShieldAlert,
  BookOpen,
  Users,
  ListChecks,
  TrendingUp,
  Link2,
  AlertTriangle,
  Layers,
  Gavel,
  NotebookPen,
  LibraryBig,
  type LucideIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import GithubSlugger from 'github-slugger';
import { apiClient, briefService } from '../api';
import { useAuth } from '../auth';
import type { DealBrief } from '../types/api';

const HUMAN_SECTION_IDS = ['team-notes', 'custom-context'] as const;
type HumanSectionId = (typeof HUMAN_SECTION_IDS)[number];

const HUMAN_SECTION_LABELS: Record<HumanSectionId, string> = {
  'team-notes': 'Deal Team Notes',
  'custom-context': 'Custom Context',
};

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

/**
 * Pull the YAML-ish frontmatter off the top of the brief, strip all marker
 * comments + placeholder comments, and return clean markdown ready for
 * rendering.
 */
const parseBriefMarkdown = (raw: string | null | undefined): ParsedBrief => {
  if (!raw) return { meta: {}, body: '' };

  let remaining = raw.trim();
  const meta: BriefMeta = {};

  // Match leading `---\n<frontmatter>\n---`
  const fmMatch = remaining.match(/^---\s*\n([\s\S]*?)\n---\s*/);
  if (fmMatch) {
    const block = fmMatch[1];
    for (const line of block.split('\n')) {
      const m = line.match(/^\s*([a-z_][a-z0-9_]*)\s*:\s*(.*?)\s*$/i);
      if (m) meta[m[1]] = m[2];
    }
    remaining = remaining.slice(fmMatch[0].length);
  }

  // Strip AI/human section markers — we don't want them rendered as text.
  remaining = remaining.replace(
    /<!--\s*(ai|human):(start|end):[a-z-]+\s*-->/g,
    ''
  );
  // Strip remaining HTML comments (placeholder hints, content-team notes, etc.)
  remaining = remaining.replace(/<!--[\s\S]*?-->/g, '');
  // Collapse 3+ blank lines
  remaining = remaining.replace(/\n{3,}/g, '\n\n').trim();

  return { meta, body: remaining };
};

const extractHumanSection = (
  markdown: string | null,
  id: HumanSectionId
): string => {
  if (!markdown) return '';
  const re = new RegExp(
    `<!-- human:start:${id} -->([\\s\\S]*?)<!-- human:end:${id} -->`,
    'g'
  );
  const match = re.exec(markdown);
  if (!match) return '';
  // Strip any placeholder HTML comments inside the section.
  return match[1].replace(/<!--[\s\S]*?-->/g, '').trim();
};

const riskChipClass = (score: number | null): string => {
  if (score == null) return 'chip';
  if (score >= 7) return 'chip risk-high';
  if (score >= 4) return 'chip risk-med';
  return 'chip risk-low';
};

const formatDate = (raw: string | undefined): string | null => {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

/**
 * Section configuration keyed by normalized heading text.
 * - icon: shown in the rendered H1 + in the TOC.
 * - accent: CSS var color used as the left border / icon tint.
 * - aliases: alternate heading strings the backend prompt may emit.
 */
interface SectionMeta {
  icon: LucideIcon;
  accent: string;
  aliases?: readonly string[];
}

const SECTION_META: Record<string, SectionMeta> = {
  'deal snapshot': { icon: BookOpen, accent: 'var(--color-primary)' },
  'deal team notes': { icon: NotebookPen, accent: 'var(--color-accent)' },
  'custom context': { icon: NotebookPen, accent: 'var(--color-accent)' },
  'parties': { icon: Users, accent: 'var(--color-primary)' },
  'key clauses': {
    icon: ListChecks,
    accent: 'var(--color-primary)',
    aliases: ['key clauses (cross-document)'],
  },
  'top risks': { icon: TrendingUp, accent: 'var(--risk-high)' },
  'key dates': { icon: Calendar, accent: 'var(--color-primary)' },
  'cross-document anomalies': {
    icon: AlertTriangle,
    accent: 'var(--risk-med)',
    aliases: ['anomalies'],
  },
  'document registry': { icon: LibraryBig, accent: 'var(--color-primary)' },
  'inter-document relationships': {
    icon: Link2,
    accent: 'var(--color-primary)',
    aliases: ['relationships'],
  },
  'risk assessment': { icon: ShieldAlert, accent: 'var(--risk-high)' },
  'executive summary': { icon: BookOpen, accent: 'var(--color-primary)' },
  'citations': { icon: Gavel, accent: 'var(--color-primary)' },
  'entities': { icon: Layers, accent: 'var(--color-primary)' },
};

const DEFAULT_SECTION: SectionMeta = {
  icon: FileText,
  accent: 'var(--color-primary)',
};

const resolveSectionMeta = (heading: string): SectionMeta => {
  const normalized = heading.trim().toLowerCase();
  const direct = SECTION_META[normalized];
  if (direct) return direct;
  for (const meta of Object.values(SECTION_META)) {
    if (meta.aliases?.includes(normalized)) return meta;
  }
  // Partial match (e.g. "Key Clauses (cross-document)" → "key clauses")
  for (const key of Object.keys(SECTION_META)) {
    if (normalized.startsWith(key)) return SECTION_META[key];
  }
  return DEFAULT_SECTION;
};

/**
 * Extract H1 headings from markdown in document order, with slugs matching
 * what rehype-slug will generate (both use the `github-slugger` algorithm,
 * so the TOC slugs always match the DOM ids — no drift).
 */
interface TocItem {
  slug: string;
  text: string;
  meta: SectionMeta;
}
const extractToc = (markdown: string): TocItem[] => {
  const out: TocItem[] = [];
  const slugger = new GithubSlugger();
  const lines = markdown.split('\n');
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^#\s+(.+?)\s*$/);
    if (!m) continue;
    const text = m[1].trim();
    const slug = slugger.slug(text);
    out.push({ slug, text, meta: resolveSectionMeta(text) });
  }
  return out;
};

/** Get children as a plain string for slug/meta lookups. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const childrenToText = (children: any): string => {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(childrenToText).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return childrenToText((children as { props: { children: unknown } }).props.children);
  }
  return '';
};

export function DealBriefPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { isLoading: authLoading } = useAuth();
  const [brief, setBrief] = useState<DealBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rebuilding, setRebuilding] = useState(false);
  const [editing, setEditing] = useState<HumanSectionId | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchBrief = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await briefService.get(projectId);
      setBrief(res);
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
      console.error('Rebuild failed:', err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Rebuild failed — check server logs.';
      setError(message);
    } finally {
      setRebuilding(false);
    }
  };

  const startEdit = (id: HumanSectionId) => {
    setEditing(id);
    setEditDraft(extractHumanSection(brief?.markdown ?? null, id));
  };

  const cancelEdit = () => {
    setEditing(null);
    setEditDraft('');
  };

  const handleSave = async () => {
    if (!projectId || !editing) return;
    try {
      setSaving(true);
      await briefService.saveHumanSection(projectId, editing, editDraft);
      await fetchBrief();
      setEditing(null);
      setEditDraft('');
    } catch (err) {
      console.error('Save failed:', err);
      setError('Failed to save section.');
    } finally {
      setSaving(false);
    }
  };

  const { meta, body: renderedMarkdown } = useMemo(
    () => parseBriefMarkdown(brief?.markdown ?? null),
    [brief?.markdown]
  );

  const toc = useMemo(() => extractToc(renderedMarkdown), [renderedMarkdown]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  // Track which section is in the viewport for TOC highlighting.
  useEffect(() => {
    if (toc.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target?.id) setActiveSlug(visible[0].target.id);
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.01 }
    );
    toc.forEach(({ slug }) => {
      const el = document.getElementById(slug);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [toc, renderedMarkdown]);

  const portfolioRisk =
    meta.portfolio_risk == null
      ? null
      : typeof meta.portfolio_risk === 'number'
        ? meta.portfolio_risk
        : Number.parseInt(String(meta.portfolio_risk), 10) || null;

  const docCount =
    meta.doc_count == null
      ? null
      : typeof meta.doc_count === 'number'
        ? meta.doc_count
        : Number.parseInt(String(meta.doc_count), 10) || null;

  // Slug-aware ReactMarkdown components. IDs are assigned by rehype-slug —
  // we just decorate each heading with its section icon + accent border.
  const markdownComponents = useMemo(
    () => ({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      h1: ({ children, ...props }: any) => {
        const text = childrenToText(children);
        const sectionMeta = resolveSectionMeta(text);
        const Icon = sectionMeta.icon;
        return (
          <h1
            {...props}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              scrollMarginTop: 'calc(var(--header-height, 64px) + 16px)',
              borderBottom: `2px solid ${sectionMeta.accent}`,
              paddingBottom: '0.4em',
              marginTop: '2em',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-secondary)',
                color: sectionMeta.accent,
                flexShrink: 0,
              }}
            >
              <Icon size={18} />
            </span>
            <span>{children}</span>
          </h1>
        );
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      h2: ({ children, ...props }: any) => (
        <h2
          {...props}
          style={{
            scrollMarginTop: 'calc(var(--header-height, 64px) + 16px)',
            borderLeft: '3px solid var(--color-primary)',
            paddingLeft: 'var(--space-3)',
            borderBottom: 'none',
            marginTop: '1.6em',
          }}
        >
          {children}
        </h2>
      ),
    }),
    []
  );

  if (authLoading || loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading deal brief…</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 'var(--space-6) var(--space-8)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to={`/projects/${projectId}`} className="button ghost sm">
          <ArrowLeft size={14} /> Overview
        </Link>
        <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
          {brief && (
            <span className={brief.scopeKey === 'full' ? 'chip primary' : 'chip accent'}>
              {brief.scopeLabel}
            </span>
          )}
          {brief?.updatedAt && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              Last rebuilt: {new Date(brief.updatedAt).toLocaleString()}
            </span>
          )}
          <button
            className="button secondary sm"
            onClick={handleRebuild}
            disabled={rebuilding}
          >
            <RefreshCw size={14} className={rebuilding ? 'loading-spinner' : ''} />
            {rebuilding ? 'Rebuilding…' : 'Rebuild now'}
          </button>
        </div>
      </div>

      {error && <div className="error-container"><span className="error-message">{error}</span></div>}

      {!brief?.markdown ? (
        <div className="empty-state">
          <h3>No deal brief yet</h3>
          <p>
            Upload documents to the Data Room. Once extraction completes, the brief will be
            generated automatically.
          </p>
          <Link className="button primary" to={`/projects/${projectId}/vdr`}>
            Go to Data Room
          </Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            {/* Metadata header card — rendered from parsed frontmatter. */}
            <div
              className="card"
              style={{
                padding: 'var(--space-5) var(--space-6)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 'var(--space-4)',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--text-xl)',
                    fontWeight: 600,
                    letterSpacing: 'var(--tracking-tight)',
                    lineHeight: 1.2,
                  }}
                >
                  {meta.project || 'Deal Brief'}
                </div>
                <div
                  style={{
                    marginTop: 'var(--space-1)',
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-wide)',
                  }}
                >
                  Deal Brief · {meta.scope || brief.scopeLabel || 'full'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-5)', flexWrap: 'wrap', alignItems: 'center' }}>
                {portfolioRisk != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <ShieldAlert size={16} style={{ color: 'var(--text-tertiary)' }} />
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Portfolio risk</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginTop: 2 }}>
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600 }}>
                          {portfolioRisk}
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>/10</span>
                        </span>
                        <span className={riskChipClass(portfolioRisk)}>
                          {portfolioRisk >= 7 ? 'HIGH' : portfolioRisk >= 4 ? 'MEDIUM' : 'LOW'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {docCount != null && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <FileText size={16} style={{ color: 'var(--text-tertiary)' }} />
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Documents</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-lg)', fontWeight: 600 }}>
                        {docCount}
                      </div>
                    </div>
                  </div>
                )}
                {(brief.updatedAt || meta.last_updated) && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Calendar size={16} style={{ color: 'var(--text-tertiary)' }} />
                    <div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Last updated</div>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
                        {formatDate(brief.updatedAt ?? meta.last_updated)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sticky TOC + rendered brief body side-by-side */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: toc.length > 0 ? '220px 1fr' : '1fr',
                gap: 'var(--space-5)',
                alignItems: 'flex-start',
              }}
            >
              {toc.length > 0 && (
                <nav
                  aria-label="Deal brief sections"
                  style={{
                    position: 'sticky',
                    top: 'calc(var(--header-height, 64px) + 16px)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    paddingTop: 'var(--space-2)',
                  }}
                >
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      textTransform: 'uppercase',
                      letterSpacing: 'var(--tracking-wide)',
                      color: 'var(--text-tertiary)',
                      padding: 'var(--space-2) var(--space-3)',
                    }}
                  >
                    Sections
                  </div>
                  {toc.map(({ slug, text, meta: sectionMeta }) => {
                    const Icon = sectionMeta.icon;
                    const isActive = slug === activeSlug;
                    return (
                      <a
                        key={slug}
                        href={`#${slug}`}
                        onClick={(e) => {
                          e.preventDefault();
                          const el = document.getElementById(slug);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            setActiveSlug(slug);
                          }
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          padding: 'var(--space-2) var(--space-3)',
                          borderRadius: 'var(--radius-sm)',
                          borderLeft: `2px solid ${isActive ? sectionMeta.accent : 'transparent'}`,
                          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                          background: isActive ? 'var(--bg-tertiary)' : 'transparent',
                          fontSize: 'var(--text-sm)',
                          fontWeight: isActive ? 500 : 400,
                          textDecoration: 'none',
                          transition: 'background-color var(--transition-base), color var(--transition-base)',
                        }}
                      >
                        <Icon size={14} style={{ color: sectionMeta.accent, flexShrink: 0 }} />
                        <span
                          style={{
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {text}
                        </span>
                      </a>
                    );
                  })}
                </nav>
              )}

              <div className="card" style={{ padding: 'var(--space-6) var(--space-8)' }}>
                <div className="markdown-body">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSlug]}
                    components={markdownComponents}
                  >
                    {renderedMarkdown}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          </div>

          <aside style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <h3 style={{ fontFamily: 'var(--font-display)', margin: 0 }}>Human sections</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginTop: 0 }}>
              Anything you write here persists across AI rebuilds.
            </p>

            {HUMAN_SECTION_IDS.map((id) => {
              const content = extractHumanSection(brief.markdown, id);
              const isEditing = editing === id;
              return (
                <div key={id} className="card" style={{ padding: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <h4 style={{ margin: 0 }}>{HUMAN_SECTION_LABELS[id]}</h4>
                    {!isEditing ? (
                      <button className="button ghost sm" onClick={() => startEdit(id)}>
                        <Edit3 size={12} /> Edit
                      </button>
                    ) : (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="button ghost sm" onClick={cancelEdit} disabled={saving}>
                          <X size={12} /> Cancel
                        </button>
                        <button className="button primary sm" onClick={handleSave} disabled={saving}>
                          <Save size={12} /> Save
                        </button>
                      </div>
                    )}
                  </div>
                  {isEditing ? (
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={10}
                      style={{ width: '100%', marginTop: 'var(--space-3)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)' }}
                    />
                  ) : (
                    <div style={{ marginTop: 'var(--space-3)', whiteSpace: 'pre-wrap', fontSize: 'var(--text-sm)', color: content ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                      {content || '(empty — click Edit to add notes)'}
                    </div>
                  )}
                </div>
              );
            })}
          </aside>
        </div>
      )}
    </div>
  );
}
