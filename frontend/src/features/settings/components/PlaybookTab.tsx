import { useCallback, useEffect, useState } from 'react';
import {
  Save,
  Trash2,
  Plus,
  X,
  Flag,
  BookOpen,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { playbookService } from '../../../api';
import type { Playbook, PlaybookStandardPosition } from '../../../types/api';

const CUAD_CLAUSE_TYPES = [
  'CAP_ON_LIABILITY',
  'UNCAPPED_LIABILITY',
  'CHANGE_OF_CONTROL',
  'INDEMNIFICATION',
  'REPRESENTATIONS_AND_WARRANTIES',
  'NON_COMPETE',
  'NO_SOLICIT_EMPLOYEES',
  'NO_SOLICIT_CUSTOMERS',
  'EXCLUSIVITY',
  'GOVERNING_LAW',
  'ANTI_ASSIGNMENT',
  'IP_OWNERSHIP_ASSIGNMENT',
  'CONFIDENTIALITY',
  'TERMINATION_FOR_CONVENIENCE',
  'MOST_FAVORED_NATION',
  'LICENSE_GRANT',
  'WARRANTY_DURATION',
  'PAYMENT_TERMS',
];

/** CUAD stores clause types as SCREAMING_SNAKE; nobody wants to read that in a select. */
const CLAUSE_LABEL_OVERRIDES: Record<string, string> = {
  IP_OWNERSHIP_ASSIGNMENT: 'IP ownership / assignment',
  MOST_FAVORED_NATION: 'Most favoured nation',
  NO_SOLICIT_EMPLOYEES: 'No-solicit — employees',
  NO_SOLICIT_CUSTOMERS: 'No-solicit — customers',
  REPRESENTATIONS_AND_WARRANTIES: 'Representations and warranties',
};

function humanizeClauseType(clauseType: string): string {
  const override = CLAUSE_LABEL_OVERRIDES[clauseType];
  if (override) return override;
  const words = clauseType.toLowerCase().replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface Props {
  projectId: string;
  canEdit: boolean;
}

export function PlaybookTab({ projectId, canEdit }: Props) {
  const [playbook, setPlaybook] = useState<Playbook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await playbookService.get(projectId);
      setPlaybook(
        res.playbook ?? {
          version: 1,
          redFlags: [],
          standardPositions: [],
        }
      );
    } catch (err) {
      console.error(err);
      setError('Failed to load playbook');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleUseTemplate = async () => {
    try {
      const res = await playbookService.template(projectId);
      setPlaybook(res.playbook);
    } catch (err) {
      console.error(err);
      setError('Failed to load template');
    }
  };

  const handleSave = async () => {
    if (!playbook) return;
    try {
      setSaving(true);
      setError(null);
      await playbookService.save(projectId, playbook);
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      console.error(err);
      setError('Failed to save playbook');
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('Clear the playbook? Extractions will fall back to the absolute risk rubric.')) return;
    try {
      await playbookService.clear(projectId);
      setPlaybook({ version: 1, redFlags: [], standardPositions: [] });
      setSavedAt(new Date().toLocaleTimeString());
    } catch (err) {
      console.error(err);
      setError('Failed to clear playbook');
    }
  };

  const updatePosition = (index: number, patch: Partial<PlaybookStandardPosition>) => {
    if (!playbook) return;
    const next = [...playbook.standardPositions];
    next[index] = { ...next[index], ...patch };
    setPlaybook({ ...playbook, standardPositions: next });
  };

  const removePosition = (index: number) => {
    if (!playbook) return;
    setPlaybook({
      ...playbook,
      standardPositions: playbook.standardPositions.filter((_, i) => i !== index),
    });
  };

  const addPosition = () => {
    if (!playbook) return;
    setPlaybook({
      ...playbook,
      standardPositions: [
        ...playbook.standardPositions,
        { clauseType: 'CAP_ON_LIABILITY', fallbacks: [], riskIfDeviates: 'MEDIUM' },
      ],
    });
  };

  const updateRedFlag = (index: number, value: string) => {
    if (!playbook) return;
    const next = [...playbook.redFlags];
    next[index] = value;
    setPlaybook({ ...playbook, redFlags: next });
  };

  const removeRedFlag = (index: number) => {
    if (!playbook) return;
    setPlaybook({
      ...playbook,
      redFlags: playbook.redFlags.filter((_, i) => i !== index),
    });
  };

  const addRedFlag = () => {
    if (!playbook) return;
    setPlaybook({ ...playbook, redFlags: [...playbook.redFlags, ''] });
  };


  if (loading) {
    return (
      <div className="settings-section">
        <div className="settings-loading">
          <div className="spinner" />
          <span>Loading playbook…</span>
        </div>
      </div>
    );
  }
  if (!playbook) return null;

  const disabled = !canEdit;
  const isEmpty =
    playbook.standardPositions.length === 0 && playbook.redFlags.length === 0;

  return (
    <div className="settings-stack">
      <div className="playbook-toolbar">
        {savedAt && <span className="playbook-saved">Saved {savedAt}</span>}
        {canEdit && isEmpty && (
          <button className="button secondary sm" onClick={handleUseTemplate} disabled={saving}>
            <Sparkles size={14} /> Use template
          </button>
        )}
        {canEdit && (
          <button className="button ghost sm" onClick={handleClear} disabled={saving}>
            <Trash2 size={14} /> Clear
          </button>
        )}
        <button className="button primary sm" onClick={handleSave} disabled={disabled || saving}>
          <Save size={14} /> {saving ? 'Saving…' : 'Save playbook'}
        </button>
      </div>

      {error && (
        <div className="playbook-error">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Deal context */}
      <div className="settings-section">
        <div className="settings-section-header">
          <div>
            <h3 className="settings-section-title">Deal context</h3>
            <p className="settings-section-description">
              A one-paragraph brief on the deal and your firm's posture. Claude uses it to frame
              every extraction.
            </p>
          </div>
        </div>
        <div className="settings-section-body">
          <div className="form-group">
            <label htmlFor="dealContext" className="sr-only">
              Deal context
            </label>
            <textarea
              id="dealContext"
              value={playbook.dealContext ?? ''}
              disabled={disabled}
              onChange={(e) => setPlaybook({ ...playbook, dealContext: e.target.value })}
              rows={3}
              placeholder="E.g. Acme is a strategic acquirer focused on SaaS; we will walk away from uncapped IP indemnity."
            />
          </div>
        </div>
      </div>

      {/* Red flags */}
      <div className="settings-section">
        <div className="settings-section-header">
          <div>
            <h3 className="settings-section-title">
              Red flags{playbook.redFlags.length > 0 ? ` · ${playbook.redFlags.length}` : ''}
            </h3>
            <p className="settings-section-description">
              Any clause matching one of these is forced to HIGH risk automatically.
            </p>
          </div>
          {canEdit && (
            <button className="button secondary sm" onClick={addRedFlag}>
              <Plus size={14} /> Add flag
            </button>
          )}
        </div>
        <div className={playbook.redFlags.length ? 'settings-section-body' : 'settings-section-body flush'}>
          {playbook.redFlags.length === 0 ? (
            <div className="settings-empty">
              <span className="settings-empty-icon">
                <Flag size={18} />
              </span>
              <h4>No red flags</h4>
              <p>
                Add the terms your firm will not accept — an uncapped indemnity, a change of
                control on any equity transfer.
              </p>
              {canEdit && (
                <button className="button secondary sm" onClick={addRedFlag}>
                  <Plus size={14} /> Add the first flag
                </button>
              )}
            </div>
          ) : (
            <div className="redflag-list">
              {playbook.redFlags.map((f, i) => (
                <div key={i} className="redflag-row">
                  <span className="redflag-marker">
                    <Flag size={13} />
                  </span>
                  <input
                    value={f}
                    disabled={disabled}
                    onChange={(e) => updateRedFlag(i, e.target.value)}
                    placeholder="E.g. change of control on any equity transfer"
                    aria-label={`Red flag ${i + 1}`}
                  />
                  {canEdit && (
                    <button
                      className="icon-button destructive"
                      onClick={() => removeRedFlag(i)}
                      title="Remove red flag"
                      aria-label={`Remove red flag ${i + 1}`}
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Standard positions */}
      <div className="settings-section">
        <div className="settings-section-header">
          <div>
            <h3 className="settings-section-title">
              Standard positions
              {playbook.standardPositions.length > 0
                ? ` · ${playbook.standardPositions.length}`
                : ''}
            </h3>
            <p className="settings-section-description">
              The language you prefer per clause type, the fallbacks you will live with, and how
              badly a deviation reads.
            </p>
          </div>
          {canEdit && (
            <button className="button secondary sm" onClick={addPosition}>
              <Plus size={14} /> Add position
            </button>
          )}
        </div>
        <div
          className={
            playbook.standardPositions.length
              ? 'settings-section-body'
              : 'settings-section-body flush'
          }
        >
          {playbook.standardPositions.length === 0 ? (
            <div className="settings-empty">
              <span className="settings-empty-icon">
                <BookOpen size={18} />
              </span>
              <h4>No standard positions</h4>
              <p>
                Start from the firm template, or add clause types one at a time. Until then,
                extractions fall back to the absolute risk rubric.
              </p>
              {canEdit && (
                <button className="button secondary sm" onClick={handleUseTemplate}>
                  <Sparkles size={14} /> Use template
                </button>
              )}
            </div>
          ) : (
            <div className="position-list">
              {playbook.standardPositions.map((p, i) => (
                <div key={i} className="position-card">
                  <div className="position-head">
                    <div className="position-clause">
                      <span className="position-index">{i + 1}</span>
                      <select
                        value={p.clauseType}
                        disabled={disabled}
                        aria-label={`Clause type for position ${i + 1}`}
                        onChange={(e) => updatePosition(i, { clauseType: e.target.value })}
                      >
                        {CUAD_CLAUSE_TYPES.map((ct) => (
                          <option key={ct} value={ct}>
                            {humanizeClauseType(ct)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <select
                      value={p.riskIfDeviates}
                      disabled={disabled}
                      aria-label={`Risk if the deal deviates on position ${i + 1}`}
                      onChange={(e) =>
                        updatePosition(i, {
                          riskIfDeviates: e.target.value as 'LOW' | 'MEDIUM' | 'HIGH',
                        })
                      }
                    >
                      <option value="LOW">Deviation → Low risk</option>
                      <option value="MEDIUM">Deviation → Medium risk</option>
                      <option value="HIGH">Deviation → High risk</option>
                    </select>
                    {canEdit && (
                      <button
                        className="icon-button destructive"
                        onClick={() => removePosition(i)}
                        title="Remove position"
                        aria-label={`Remove position ${i + 1}`}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>

                  <div className="position-body">
                    <div className="position-field">
                      <label htmlFor={`pref-${i}`}>Preferred language</label>
                      <textarea
                        id={`pref-${i}`}
                        value={p.preferredLanguage ?? ''}
                        disabled={disabled}
                        onChange={(e) => updatePosition(i, { preferredLanguage: e.target.value })}
                        rows={2}
                        placeholder="The wording your firm asks for."
                      />
                    </div>

                    <div className="position-field">
                      <label htmlFor={`fallback-${i}`}>Fallbacks</label>
                      <p className="field-hint">One per line — variations you would still sign.</p>
                      <textarea
                        id={`fallback-${i}`}
                        value={p.fallbacks.join('\n')}
                        disabled={disabled}
                        onChange={(e) =>
                          updatePosition(i, {
                            fallbacks: e.target.value.split('\n').filter((l) => l.trim()),
                          })
                        }
                        rows={2}
                      />
                    </div>

                    <div className="position-field">
                      <label htmlFor={`notes-${i}`}>Notes</label>
                      <input
                        id={`notes-${i}`}
                        value={p.notes ?? ''}
                        disabled={disabled}
                        onChange={(e) => updatePosition(i, { notes: e.target.value })}
                        placeholder="Context for the reviewer."
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
