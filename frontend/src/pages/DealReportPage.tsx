import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertTriangle,
  BadgeCheck,
  CircleDashed,
  FileText,
  ListChecks,
  Printer,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  reportService,
  type DealReport,
  type ReportEntry,
  type ReportSection,
} from '../api/services/report.service';
import './deal-report.css';

/**
 * The deal report — a due-diligence issues report, one section per risk category.
 *
 * Reads like the document it becomes: the categories in the template's order,
 * each with the flagged clauses found there, the written findings a reviewer has
 * signed off, the tasks working it, and what to request from the other side.
 *
 * Two things are deliberate. Findings show the AI's draft and the attorney's
 * version side by side rather than replacing one with the other, because the
 * draft is the audit record of what the model actually said. And the export
 * carries only verified findings by default, because a document a client may
 * read should not contain text nobody has reviewed.
 */

type StatusKey = 'FLAGGED' | 'COVERED' | 'THIN' | 'OPEN' | 'NA';

const STATUS_LABEL: Record<string, string> = {
  FLAGGED: 'Flagged',
  COVERED: 'Covered',
  THIN: 'Thin',
  OPEN: 'No evidence',
  NA: 'Not applicable',
};

const pad = (n: number) => String(n).padStart(2, '0');

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

/**
 * Clause types are stored as SCREAMING_SNAKE. Lower-casing the whole thing turns
 * ROFR_ROFO_ROFN into "rofr rofo rofn", which reads as a typo in a legal
 * document. Keep short all-caps tokens as acronyms.
 */
const clauseLabel = (raw: string): string =>
  raw
    .split('_')
    .map((word) => (word.length <= 5 ? word : word.charAt(0) + word.slice(1).toLowerCase()))
    .join(' ')
    .replace(/^(.)/, (c) => c.toUpperCase());

/** The text that ships: the reviewer's version when there is one. */
const shippingText = (entry: ReportEntry) => entry.humanText ?? entry.aiDraft;

export function DealReportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [report, setReport] = useState<DealReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, string>>({});
  const docRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await reportService.getReport(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the deal report');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sections that carry something worth reading. An empty category is still in
  // the rail (it is the supplemental request), but it does not need a section.
  const sections = useMemo(() => report?.sections ?? [], [report]);
  const withContent = useMemo(
    () => sections.filter((s) => s.issues.length > 0 || s.entries.length > 0),
    [sections]
  );
  const requests = useMemo(
    () => sections.filter((s) => s.issues.length === 0 && s.entries.length === 0),
    [sections]
  );

  // Rail highlight follows the section in view.
  useEffect(() => {
    if (withContent.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 }
    );
    for (const s of withContent) {
      const el = document.getElementById(`rc-${s.riskCategoryId}`);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [withContent]);

  const saveEntry = async (
    entry: ReportEntry,
    patch: Parameters<typeof reportService.updateEntry>[2]
  ) => {
    if (!projectId) return;
    setSavingId(entry.id);
    try {
      const updated = await reportService.updateEntry(projectId, entry.id, patch);
      setReport((prev) =>
        prev
          ? {
              ...prev,
              sections: prev.sections.map((s) => ({
                ...s,
                entries: s.entries.map((e) => (e.id === updated.id ? updated : e)),
              })),
            }
          : prev
      );
      setEditing((prev) => {
        const next = { ...prev };
        delete next[entry.id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that finding');
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="report-page">
        <div className="report-skeleton" aria-busy="true" aria-live="polite">
          <div className="report-skeleton__bar" style={{ width: '38%' }} />
          <div className="report-skeleton__bar" style={{ width: '62%' }} />
          <div className="report-skeleton__block" />
          <div className="report-skeleton__block" />
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="report-page">
        <div className="report-empty" role="alert">
          <AlertTriangle size={20} aria-hidden="true" />
          <p>{error}</p>
          <button type="button" className="report-btn" onClick={() => void load()}>
            <RefreshCw size={14} aria-hidden="true" /> Try again
          </button>
        </div>
      </div>
    );
  }

  if (!report) return null;

  const { totals } = report;

  return (
    <div className={`report-page${verifiedOnly ? ' is-verified-only' : ''}`}>
      <div className="report-topbar">
        <div className="report-topbar__meta">
          <span className="report-scope">
            {report.scope.isFullAccess
              ? 'Full deal'
              : `${report.scope.categoryCount} of 26 risk categories`}
          </span>
        </div>
        <div className="report-topbar__actions">
          <label className="report-toggle">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => setVerifiedOnly(e.target.checked)}
            />
            <span>Verified findings only</span>
          </label>
          <button type="button" className="report-btn" onClick={() => void load()}>
            <RefreshCw size={14} aria-hidden="true" /> Refresh
          </button>
          <button type="button" className="report-btn is-primary" onClick={() => window.print()}>
            <Printer size={14} aria-hidden="true" /> Export PDF
          </button>
        </div>
      </div>

      {error && (
        <p className="report-inline-error" role="alert">
          {error}
        </p>
      )}

      <div className="report-layout">
        <nav className="report-rail" aria-label="Report sections">
          <p className="report-rail__label">Contents</p>
          <ol className="report-rail__list">
            {sections.map((s) => {
              const empty = s.issues.length === 0 && s.entries.length === 0;
              return (
                <li key={s.riskCategoryId}>
                  <a
                    href={empty ? '#rc-requests' : `#rc-${s.riskCategoryId}`}
                    className={`report-rail__link${
                      activeId === `rc-${s.riskCategoryId}` ? ' is-active' : ''
                    }${empty ? ' is-empty' : ''}`}
                  >
                    <span className="report-rail__num">{pad(s.order)}</span>
                    <span className="report-rail__text">{s.title}</span>
                    {s.issues.length > 0 && (
                      <span className="report-rail__count">{s.issues.length}</span>
                    )}
                  </a>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="report-doc" ref={docRef}>
          <header className="report-letterhead">
            <p className="report-letterhead__firm">DealDiligence</p>
            <h1 className="report-letterhead__title">Due Diligence Issues Report</h1>
            <dl className="report-letterhead__meta">
              <div>
                <dt>Re</dt>
                <dd>{report.project.name}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{formatDate(report.generatedAt)}</dd>
              </div>
              <div>
                <dt>Scope</dt>
                <dd>
                  {report.scope.isFullAccess
                    ? 'All risk categories'
                    : `${report.scope.categoryCount} risk categories`}
                </dd>
              </div>
            </dl>
            <p className="report-letterhead__note">
              This report highlights the issues identified in the materials reviewed. It is not a
              summary of everything reviewed. Findings marked as drafts have not yet been reviewed
              by a member of the deal team.
            </p>
          </header>

          <section className="report-summary" aria-label="At a glance">
            <div className="report-stat">
              <span className="report-stat__value">{totals.issues}</span>
              <span className="report-stat__label">Flagged clauses</span>
            </div>
            <div className="report-stat">
              <span className="report-stat__value">{totals.flagged}</span>
              <span className="report-stat__label">Categories flagged</span>
            </div>
            <div className="report-stat">
              <span className="report-stat__value">{totals.verified}</span>
              <span className="report-stat__label">Verified findings</span>
            </div>
            <div className="report-stat">
              <span className="report-stat__value">{totals.open}</span>
              <span className="report-stat__label">Awaiting documents</span>
            </div>
          </section>

          {withContent.length === 0 ? (
            <div className="report-empty">
              <FileText size={20} aria-hidden="true" />
              <p>
                Nothing flagged yet. Once documents are analyzed, the issues found in each risk
                category appear here.
              </p>
            </div>
          ) : (
            withContent.map((section) => (
              <ReportSectionBlock
                key={section.riskCategoryId}
                section={section}
                verifiedOnly={verifiedOnly}
                savingId={savingId}
                editing={editing}
                setEditing={setEditing}
                onSave={saveEntry}
              />
            ))
          )}

          {requests.length > 0 && (
            <section className="report-section report-section--requests" id="rc-requests">
              <div className="report-section__head">
                <span className="report-section__num">{pad(withContent.length + 1)}</span>
                <h2 className="report-section__title">Supplemental diligence requests</h2>
              </div>
              <p className="report-section__lede">
                Nothing in the materials speaks to these categories. Each one is a document to
                request from the other side before the review can close.
              </p>
              <ul className="report-requests">
                {requests.map((s) => (
                  <li key={s.riskCategoryId}>
                    <span className="report-requests__num">{pad(s.order)}</span>
                    <span className="report-requests__main">
                      <span className="report-requests__title">{s.reportTitle}</span>
                      <span className="report-requests__desc">{s.description}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <footer className="report-footer">
            <span>{report.project.name}</span>
            <span>Due Diligence Issues Report</span>
            <span>{formatDate(report.generatedAt)}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- section */

interface SectionProps {
  section: ReportSection;
  verifiedOnly: boolean;
  savingId: string | null;
  editing: Record<string, string>;
  setEditing: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onSave: (entry: ReportEntry, patch: Record<string, unknown>) => void | Promise<void>;
}

function ReportSectionBlock({
  section,
  verifiedOnly,
  savingId,
  editing,
  setEditing,
  onSave,
}: SectionProps) {
  const [showAll, setShowAll] = useState(false);
  const entries = verifiedOnly
    ? section.entries.filter((e) => e.status === 'VERIFIED')
    : section.entries;
  // A category can hold hundreds of flagged clauses. Show the worst first and
  // let the reviewer open the rest, rather than printing a wall nobody reads.
  const VISIBLE = 8;
  const issues = showAll ? section.issues : section.issues.slice(0, VISIBLE);
  const hidden = section.issues.length - issues.length;
  const status = (section.status as StatusKey) ?? 'OPEN';

  return (
    <section className="report-section" id={`rc-${section.riskCategoryId}`}>
      <div className="report-section__head">
        <span className="report-section__num">{pad(section.order)}</span>
        <h2 className="report-section__title">{section.reportTitle}</h2>
        <span className={`report-chip is-${status.toLowerCase()}`}>{STATUS_LABEL[status]}</span>
      </div>

      <p className="report-section__lede">{section.description}</p>

      {entries.length > 0 && (
        <div className="report-findings">
          <h3 className="report-subhead">Legal issues and discussion items</h3>
          {entries.map((entry) => (
            <FindingCard
              key={entry.id}
              entry={entry}
              saving={savingId === entry.id}
              draftValue={editing[entry.id]}
              onEdit={(value) => setEditing((prev) => ({ ...prev, [entry.id]: value }))}
              onCancel={() =>
                setEditing((prev) => {
                  const next = { ...prev };
                  delete next[entry.id];
                  return next;
                })
              }
              onSave={onSave}
            />
          ))}
        </div>
      )}

      {issues.length > 0 && (
        <div className="report-issues">
          <h3 className="report-subhead">
            Flagged clauses
            <span className="report-subhead__count">{section.issues.length}</span>
          </h3>
          <ul className="report-issue-list">
            {issues.map((issue) => (
              <li key={issue.id} className="report-issue">
                <span
                  className={`report-issue__risk is-${(issue.riskLevel ?? 'low').toLowerCase()}`}
                  title={`${issue.riskLevel ?? 'Unrated'} risk`}
                  aria-label={`${issue.riskLevel ?? 'Unrated'} risk`}
                />
                <div className="report-issue__body">
                  <p className="report-issue__title">{issue.title}</p>
                  {issue.quote && <blockquote className="report-issue__quote">{issue.quote}</blockquote>}
                  <p className="report-issue__source">
                    {issue.documentName ?? 'Unknown document'}
                    {issue.pageNumber != null && `, page ${issue.pageNumber}`}
                    {issue.clauseType && ` · ${clauseLabel(issue.clauseType)}`}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          {hidden > 0 && (
            <button type="button" className="report-more" onClick={() => setShowAll(true)}>
              Show {hidden} more flagged {hidden === 1 ? 'clause' : 'clauses'}
            </button>
          )}
          {showAll && section.issues.length > VISIBLE && (
            <button type="button" className="report-more" onClick={() => setShowAll(false)}>
              Show fewer
            </button>
          )}
        </div>
      )}

      {section.actions.length > 0 && (
        <div className="report-actions">
          <h3 className="report-subhead">Next steps and action items</h3>
          <ul className="report-action-list">
            {section.actions.map((a) => (
              <li key={a.id}>
                <ListChecks size={13} aria-hidden="true" />
                <span className="report-action__title">{a.title}</span>
                <span className={`report-action__status is-${a.status.toLowerCase()}`}>
                  {a.status.replace(/_/g, ' ').toLowerCase()}
                </span>
                {a.assignees.length > 0 && (
                  <span className="report-action__who">{a.assignees.join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- finding */

interface FindingProps {
  entry: ReportEntry;
  saving: boolean;
  draftValue: string | undefined;
  onEdit: (value: string) => void;
  onCancel: () => void;
  onSave: (entry: ReportEntry, patch: Record<string, unknown>) => void | Promise<void>;
}

function FindingCard({ entry, saving, draftValue, onEdit, onCancel, onSave }: FindingProps) {
  const isEditing = draftValue !== undefined;
  const verified = entry.status === 'VERIFIED';
  const edited = entry.humanText != null && entry.humanText !== entry.aiDraft;

  return (
    <article className={`report-finding${verified ? ' is-verified' : ''}`}>
      <header className="report-finding__head">
        <h4 className="report-finding__title">{entry.title}</h4>
        <span className={`report-status is-${entry.status.toLowerCase()}`}>
          {verified ? (
            <BadgeCheck size={13} aria-hidden="true" />
          ) : entry.status === 'IN_REVIEW' ? (
            <CircleDashed size={13} aria-hidden="true" />
          ) : (
            <Sparkles size={13} aria-hidden="true" />
          )}
          {verified ? 'Verified' : entry.status === 'IN_REVIEW' ? 'In review' : 'AI draft'}
        </span>
      </header>

      <div className="report-finding__cols">
        <div className="report-col">
          <p className="report-col__label">
            <Sparkles size={11} aria-hidden="true" /> AI draft
          </p>
          <div className="report-col__body report-col__body--ai">{entry.aiDraft}</div>
        </div>

        <div className="report-col">
          <p className="report-col__label">
            <BadgeCheck size={11} aria-hidden="true" />
            {verified && entry.verifiedBy
              ? `Verified by ${entry.verifiedBy.name ?? entry.verifiedBy.email}`
              : 'Reviewer version'}
          </p>
          {isEditing ? (
            <>
              <textarea
                className="report-col__input"
                value={draftValue}
                onChange={(e) => onEdit(e.target.value)}
                rows={8}
                aria-label="Reviewer version of this finding"
              />
              <div className="report-col__buttons">
                <button
                  type="button"
                  className="report-btn is-primary"
                  disabled={saving}
                  onClick={() => void onSave(entry, { humanText: draftValue, status: 'VERIFIED' })}
                >
                  {saving ? 'Saving' : 'Save and verify'}
                </button>
                <button
                  type="button"
                  className="report-btn"
                  disabled={saving}
                  onClick={() => void onSave(entry, { humanText: draftValue })}
                >
                  Save draft
                </button>
                <button type="button" className="report-btn is-quiet" onClick={onCancel}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="report-col__body">
                {entry.humanText ?? (
                  <span className="report-col__placeholder">
                    Nobody has reviewed this yet. It is excluded from the verified export.
                  </span>
                )}
              </div>
              <div className="report-col__buttons">
                <button
                  type="button"
                  className="report-btn"
                  onClick={() => onEdit(entry.humanText ?? entry.aiDraft)}
                >
                  {entry.humanText ? 'Edit' : 'Review and edit'}
                </button>
                {!verified && (
                  <button
                    type="button"
                    className="report-btn is-primary"
                    disabled={saving}
                    onClick={() => void onSave(entry, { status: 'VERIFIED' })}
                  >
                    Verify as written
                  </button>
                )}
                {verified && (
                  <button
                    type="button"
                    className="report-btn is-quiet"
                    disabled={saving}
                    onClick={() => void onSave(entry, { status: 'IN_REVIEW' })}
                  >
                    Withdraw verification
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="report-finding__foot">
        {entry.taskTitle && <span>From task: {entry.taskTitle}</span>}
        {edited && <span>Edited by the deal team</span>}
        {entry.verifiedAt && <span>Verified {formatDate(entry.verifiedAt)}</span>}
      </footer>

      {/* Print takes the shipping text only: one column, no draft, no chrome. */}
      <div className="report-print-only">{shippingText(entry)}</div>
    </article>
  );
}

export default DealReportPage;
