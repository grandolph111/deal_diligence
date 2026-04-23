import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Kanban, FolderOpen, CheckCircle2 } from 'lucide-react';
import { apiClient, boardsService, membersService } from '../api';
import { useAuth } from '../auth';
import { CreateBoardModal } from '../features/kanban/components/CreateBoardModal';
import type { KanbanBoardSummary, Role } from '../types/api';

export function BoardsIndexPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();

  const [boards, setBoards] = useState<KanbanBoardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<Role>('VIEWER');

  const fetchBoards = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await boardsService.list(projectId);
      setBoards(res.boards);
    } catch (err) {
      console.error('Failed to load boards:', err);
      setError('Failed to load boards');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchRole = useCallback(async () => {
    if (!projectId || !user?.email) return;
    try {
      const members = await membersService.getMembers(projectId);
      const me = members.find((m) => m.user?.email === user.email);
      if (me) setCurrentUserRole(me.role);
    } catch {
      // non-fatal
    }
  }, [projectId, user?.email]);

  useEffect(() => {
    if (authLoading || !apiClient.isReady()) return;
    fetchBoards();
    fetchRole();
  }, [authLoading, fetchBoards, fetchRole]);

  const canCreate = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';

  if (authLoading || loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading boards…</p>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: 'var(--space-6) var(--space-8)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-6)',
        maxWidth: 1200,
        margin: '0 auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link to={`/projects/${projectId}`} className="button ghost sm">
          <ArrowLeft size={14} /> Overview
        </Link>
        {canCreate && (
          <button className="button primary" onClick={() => setShowCreate(true)}>
            <Plus size={14} /> Create Board
          </button>
        )}
      </div>

      <div>
        <h1 style={{ margin: 0 }}>Kanban Boards</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-2)', maxWidth: 720 }}>
          Each board is scoped to specific data-room folders. Members see only the boards whose
          folders are entirely within their access. Tasks on a board can only attach documents from
          its folders.
        </p>
      </div>

      {error && (
        <div className="error-container">
          <span className="error-message">{error}</span>
        </div>
      )}

      {boards.length === 0 ? (
        <div className="empty-state">
          <Kanban size={28} />
          <h3>No boards accessible</h3>
          <p>
            {canCreate
              ? 'Create a board to start organizing Kanban work by folder scope.'
              : 'Ask an admin to create a board covering the folders you work on.'}
          </p>
          {canCreate && (
            <button className="button primary" onClick={() => setShowCreate(true)}>
              <Plus size={14} /> Create first board
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {boards.map((board) => (
            <Link
              key={board.id}
              to={`/projects/${projectId}/boards/${board.id}`}
              className="card interactive"
              style={{
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--color-primary-soft)',
                    color: 'var(--color-primary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Kanban size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--text-lg)',
                      fontWeight: 500,
                      letterSpacing: 'var(--tracking-tight)',
                    }}
                  >
                    {board.name}
                  </div>
                  {board.isDefault && (
                    <span
                      className="chip primary"
                      style={{ marginTop: 2, display: 'inline-flex', gap: 4 }}
                    >
                      <CheckCircle2 size={11} /> Default
                    </span>
                  )}
                </div>
              </div>

              {board.description && (
                <p
                  style={{
                    color: 'var(--text-secondary)',
                    fontSize: 'var(--text-sm)',
                    margin: 0,
                  }}
                >
                  {board.description}
                </p>
              )}

              <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                <span
                  className="chip"
                  title={board.folders.map((f) => f.name).join(', ')}
                >
                  <FolderOpen size={11} /> {board.folders.length} folder
                  {board.folders.length === 1 ? '' : 's'}
                </span>
                <span className="chip">
                  {board.taskCount} task{board.taskCount === 1 ? '' : 's'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {projectId && (
        <CreateBoardModal
          projectId={projectId}
          isOpen={showCreate}
          onClose={() => setShowCreate(false)}
          onCreated={(board) => {
            navigate(`/projects/${projectId}/boards/${board.id}`);
          }}
        />
      )}
    </div>
  );
}
