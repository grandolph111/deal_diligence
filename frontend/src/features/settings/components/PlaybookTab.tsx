import { useCallback, useEffect, useState } from 'react';
import { Save, Trash2, Plus, X } from 'lucide-react';
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

  if (loading) return <div className="loading-container"><div className="loading-spinner" /></div>;
  if (!playbook) return null;

  const disabled = !canEdit;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <h2 style={{ margin: 0 }}>Playbook</h2>
          <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)', maxWidth: 720 }}>
            Standard positions your firm prefers for this deal. Every extraction scores risk as
            <em> deviation from the playbook</em>, not an absolute rubric. Red flags force HIGH risk on any match.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {savedAt && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', alignSelf: 'center' }}>Saved at {savedAt}</span>}
          {canEdit && playbook.standardPositions.length === 0 && playbook.redFlags.length === 0 && (
            <button className="button secondary sm" onClick={handleUseTemplate} disabled={saving}>
              Use template
            </button>
          )}
          {canEdit && (
            <button className="button ghost sm" onClick={handleClear} disabled={saving}>
              <Trash2 size={14} /> Clear
            </button>
          )}
          <button className="button primary sm" onClick={handleSave} disabled={disabled || saving}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && <div className="error-container"><span className="error-message">{error}</span></div>}

      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <label htmlFor="dealContext" style={{ fontWeight: 500 }}>Deal context</label>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginTop: 0 }}>
          One-paragraph brief on the deal and the firm's posture. The AI uses this to frame every extraction.
        </p>
        <textarea
          id="dealContext"
          value={playbook.dealContext ?? ''}
          disabled={disabled}
          onChange={(e) => setPlaybook({ ...playbook, dealContext: e.target.value })}
          rows={3}
          placeholder="E.g. Acme is a strategic acquirer focused on SaaS; we will walk away from uncapped IP indemnity."
          style={{ width: '100%', fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)' }}
        />
      </div>

      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>Red flags</h3>
          {canEdit && (
            <button className="button ghost sm" onClick={addRedFlag}>
              <Plus size={14} /> Add
            </button>
          )}
        </div>
        <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>
          Any clause matching these triggers HIGH risk automatically.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
          {playbook.redFlags.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <input
                value={f}
                disabled={disabled}
                onChange={(e) => updateRedFlag(i, e.target.value)}
                placeholder="E.g. change of control on any equity transfer"
                style={{ flex: 1 }}
              />
              {canEdit && (
                <button className="button ghost sm" onClick={() => removeRedFlag(i)}>
                  <X size={14} />
                </button>
              )}
            </div>
          ))}
          {playbook.redFlags.length === 0 && (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>No red flags yet.</p>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h3 style={{ margin: 0 }}>Standard positions</h3>
          {canEdit && (
            <button className="button ghost sm" onClick={addPosition}>
              <Plus size={14} /> Add
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
          {playbook.standardPositions.map((p, i) => (
            <div key={i} style={{ border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 'var(--space-3)', alignItems: 'center' }}>
                <select
                  value={p.clauseType}
                  disabled={disabled}
                  onChange={(e) => updatePosition(i, { clauseType: e.target.value })}
                >
                  {CUAD_CLAUSE_TYPES.map((ct) => (
                    <option key={ct} value={ct}>{ct}</option>
                  ))}
                </select>
                <select
                  value={p.riskIfDeviates}
                  disabled={disabled}
                  onChange={(e) => updatePosition(i, { riskIfDeviates: e.target.value as 'LOW' | 'MEDIUM' | 'HIGH' })}
                >
                  <option value="LOW">Risk if deviates: LOW</option>
                  <option value="MEDIUM">Risk if deviates: MEDIUM</option>
                  <option value="HIGH">Risk if deviates: HIGH</option>
                </select>
                {canEdit && (
                  <button className="button ghost sm" onClick={() => removePosition(i)}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <label style={{ display: 'block', marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Preferred language</label>
              <textarea
                value={p.preferredLanguage ?? ''}
                disabled={disabled}
                onChange={(e) => updatePosition(i, { preferredLanguage: e.target.value })}
                rows={2}
                style={{ width: '100%', marginTop: 'var(--space-1)' }}
              />
              <label style={{ display: 'block', marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                Fallbacks (one per line — acceptable variations)
              </label>
              <textarea
                value={p.fallbacks.join('\n')}
                disabled={disabled}
                onChange={(e) => updatePosition(i, { fallbacks: e.target.value.split('\n').filter((l) => l.trim()) })}
                rows={2}
                style={{ width: '100%', marginTop: 'var(--space-1)' }}
              />
              <label style={{ display: 'block', marginTop: 'var(--space-3)', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>Notes</label>
              <input
                value={p.notes ?? ''}
                disabled={disabled}
                onChange={(e) => updatePosition(i, { notes: e.target.value })}
                style={{ width: '100%', marginTop: 'var(--space-1)' }}
              />
            </div>
          ))}
          {playbook.standardPositions.length === 0 && (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
              No standard positions yet. Add one or click "Use template" above.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
