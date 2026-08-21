import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { X, Plus, Layers, UserCog } from 'lucide-react';
import { boardsService, membersService } from '../../../api';
import { libraryService } from '../../../api/services/library.service';
import type { TocWorkstream } from '../../../api/services/library.service';
import type { BoardSmeOption, KanbanBoardDetail } from '../../../types/api';

interface Props {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (board: KanbanBoardDetail) => void;
  /** Admins pick who the board is for. Everyone else creates one for themselves. */
  canAssignSme: boolean;
  /** Current user's id — used to show their own scope in the non-admin case. */
  currentUserId?: string;
}

/**
 * Create a board for a specialist.
 *
 * You choose a person, not a set of risk categories. A board is one specialist's
 * slice of the deal, so its scope IS their access — which means there is no way
 * to build a board that reaches past what its owner is allowed to see, and
 * re-granting them risk categories later re-scopes the board with no action here.
 * The list below the picker is therefore a readout, not an input.
 */
export function CreateBoardModal({
  projectId,
  isOpen,
  onClose,
  onCreated,
  canAssignSme,
  currentUserId,
}: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [smes, setSmes] = useState<BoardSmeOption[]>([]);
  const [selectedSmeId, setSelectedSmeId] = useState('');
  const [ownRiskCategories, setOwnWorkstreams] = useState<Array<{ id: string; title: string }>>([]);
  const [toc, setToc] = useState<TocWorkstream[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const tocPromise = libraryService.getToc(projectId);

      if (canAssignSme) {
        const [{ smes: roster }, tocRes] = await Promise.all([
          boardsService.listSmes(projectId),
          tocPromise,
        ]);
        // Only members who actually hold risk categories can own a board.
        const eligible = roster.filter((s) => s.riskCategories.length > 0);
        setSmes(eligible);
        setToc(tocRes.riskCategories);
        if (eligible.length === 1) setSelectedSmeId(eligible[0].userId);
      } else {
        const [members, tocRes] = await Promise.all([
          membersService.getMembers(projectId),
          tocPromise,
        ]);
        const me = members.find((m) => m.user?.id === currentUserId);
        const ids = me?.permissions?.restrictedRiskCategories ?? [];
        setToc(tocRes.riskCategories);
        setOwnWorkstreams(
          ids.map((id) => ({
            id,
            title: tocRes.riskCategories.find((w) => w.id === id)?.title ?? id,
          }))
        );
      }
    } catch (err) {
      console.error('Failed to load board scope options:', err);
      setError('Could not load the deal.s risk categories');
    } finally {
      setLoading(false);
    }
  }, [projectId, canAssignSme, currentUserId]);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setSelectedSmeId('');
      setError(null);
      load();
    }
  }, [isOpen, load]);

  const selectedSme = smes.find((s) => s.userId === selectedSmeId);
  const scope = canAssignSme ? (selectedSme?.riskCategories ?? []) : ownRiskCategories;
  const hasScope = canAssignSme ? Boolean(selectedSme) : ownRiskCategories.length > 0;

  const docCount = (riskCategoryId: string) =>
    toc.find((w) => w.id === riskCategoryId)?.documentCount ?? 0;

  // Deliberately NOT summed into a total. A document supplies evidence to
  // roughly eight risk categories and is counted under each, so adding these up
  // overstates the reach — badly, once a scope covers several risk categories. The
  // per-risk category figures are each correct; only their sum is a lie.

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Board name is required');
      return;
    }
    if (canAssignSme && !selectedSmeId) {
      setError('Choose the specialist this board is for');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const board = await boardsService.create(projectId, {
        name: name.trim(),
        description: description.trim() || null,
        ...(canAssignSme ? { smeUserId: selectedSmeId } : {}),
      });
      onCreated(board);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const noEligibleSmes = canAssignSme && !loading && smes.length === 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 560, width: '90%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Plus size={18} /> Create Kanban Board
          </h3>
          <button className="button ghost sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div
          className="modal-content"
          style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}
        >
          <div className="form-group">
            <label htmlFor="board-name">Board name</label>
            <input
              id="board-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. IP Diligence"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="board-desc">Description (optional)</label>
            <textarea
              id="board-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this board covers and who should work on it."
              rows={2}
            />
          </div>

          {canAssignSme && (
            <div className="form-group">
              <label htmlFor="board-sme">Subject-matter expert</label>
              <select
                id="board-sme"
                value={selectedSmeId}
                onChange={(e) => setSelectedSmeId(e.target.value)}
                disabled={loading || noEligibleSmes}
              >
                <option value="">
                  {loading ? 'Loading team…' : 'Choose a specialist…'}
                </option>
                {smes.map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.name ? `${s.name} — ${s.email}` : s.email}
                  </option>
                ))}
              </select>
              <p
                style={{
                  color: 'var(--text-tertiary)',
                  fontSize: 'var(--text-xs)',
                  marginTop: 'var(--space-1)',
                  lineHeight: 1.6,
                }}
              >
                This board is theirs — only they and project admins can open it, and it
                covers exactly the risk categories they have been granted.
              </p>
            </div>
          )}

          {noEligibleSmes ? (
            <div
              style={{
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-4)',
                display: 'flex',
                gap: 'var(--space-3)',
                alignItems: 'flex-start',
              }}
            >
              <UserCog size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.6 }}>
                <strong style={{ display: 'block' }}>No specialists yet</strong>
                <span style={{ color: 'var(--text-secondary)' }}>
                  Invite a member and grant them risk categories in{' '}
                  <Link to={`/projects/${projectId}/settings?tab=team`}>Admin → Team</Link>, then
                  come back to give them a board.
                </span>
              </div>
            </div>
          ) : (
            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Layers size={13} />
                {canAssignSme
                  ? selectedSme
                    ? `RiskCategories ${selectedSme.name ?? selectedSme.email} can access`
                    : 'RiskCategories this board will cover'
                  : 'RiskCategories you can access'}
                {hasScope && (
                  <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>
                    ({scope.length})
                  </span>
                )}
              </label>
              <div
                style={{
                  marginTop: 'var(--space-2)',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                  maxHeight: 240,
                  overflowY: 'auto',
                }}
              >
                {!hasScope ? (
                  <div
                    style={{
                      padding: 'var(--space-4)',
                      color: 'var(--text-tertiary)',
                      fontSize: 'var(--text-sm)',
                    }}
                  >
                    {canAssignSme
                      ? 'Choose a specialist to see the scope their board will cover.'
                      : 'You have not been granted any risk categories yet. Ask an admin for access.'}
                  </div>
                ) : (
                  scope.map((ws, i) => (
                    <div
                      key={ws.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-2) var(--space-3)',
                        borderBottom:
                          i === scope.length - 1
                            ? 'none'
                            : '1px solid var(--border-primary)',
                      }}
                    >
                      <span style={{ flex: 1, minWidth: 0 }}>{ws.title}</span>
                      <span
                        style={{
                          color: 'var(--text-muted)',
                          fontSize: 'var(--text-xs)',
                          fontVariantNumeric: 'tabular-nums',
                          minWidth: 58,
                          textAlign: 'right',
                        }}
                      >
                        {docCount(ws.id)} doc{docCount(ws.id) === 1 ? '' : 's'}
                      </span>
                    </div>
                  ))
                )}
              </div>
              {hasScope && (
                <p
                  style={{
                    color: 'var(--text-tertiary)',
                    fontSize: 'var(--text-xs)',
                    marginTop: 'var(--space-2)',
                    lineHeight: 1.6,
                  }}
                >
                  Counts overlap — a document usually supplies evidence to several
                  riskCategories. Change this scope in{' '}
                  <Link to={`/projects/${projectId}/settings?tab=team`}>Admin → Team</Link> and the
                  board follows.
                </p>
              )}
            </div>
          )}

          {error && (
            <div className="error-container">
              <span className="error-message">{error}</span>
            </div>
          )}
        </div>

        <div
          className="modal-actions"
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 'var(--space-2)',
            padding: 'var(--space-4)',
          }}
        >
          <button className="button secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={handleCreate}
            disabled={saving || !name.trim() || !hasScope}
          >
            {saving ? 'Creating…' : 'Create Board'}
          </button>
        </div>
      </div>
    </div>
  );
}
