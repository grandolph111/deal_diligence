import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, UserPlus, FolderOpen } from 'lucide-react';
import { KanbanBoard, InviteMemberModal } from '../features/kanban';
import { membersService, boardsService, apiClient } from '../api';
import { useAuth } from '../auth';
import type { ProjectMember, KanbanBoardDetail } from '../types/api';
import '../features/kanban/kanban.css';

export function KanbanPage() {
  const { projectId, boardId } = useParams<{ projectId: string; boardId: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [board, setBoard] = useState<KanbanBoardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Get current user's membership info (match by email from Auth0)
  const currentUserMember = members.find((m) => m.user?.email === user?.email);
  const currentUserId = currentUserMember?.user?.id;
  const isAdmin = currentUserMember?.role === 'OWNER' || currentUserMember?.role === 'ADMIN';
  const isMember = currentUserMember?.role === 'MEMBER' || isAdmin;
  const canInvite = isAdmin;

  // Handler for viewing a linked document in VDR
  const handleViewDocument = (documentId: string, folderId: string | null) => {
    // Navigate to VDR page with query params to highlight the document
    const params = new URLSearchParams();
    if (folderId) {
      params.set('folderId', folderId);
    }
    params.set('documentId', documentId);
    navigate(`/projects/${projectId}/vdr?${params.toString()}`);
  };

  useEffect(() => {
    if (authLoading || !apiClient.isReady() || !projectId || !boardId) return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const [boardData, membersData] = await Promise.all([
          boardsService.get(projectId, boardId),
          membersService.getMembers(projectId).catch(() => [] as ProjectMember[]),
        ]);
        if (cancelled) return;
        setBoard(boardData);
        setMembers(membersData);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load board';
        setError(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId, boardId, authLoading]);

  const handleInviteSuccess = async () => {
    if (!projectId) return;
    const membersData = await membersService.getMembers(projectId);
    setMembers(membersData);
  };

  if (authLoading || loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading board…</p>
      </div>
    );
  }

  if (error || !board) {
    return (
      <div className="kanban-page" style={{ padding: 'var(--space-6) var(--space-8)' }}>
        <Link to={`/projects/${projectId}/boards`} className="button ghost sm">
          <ArrowLeft size={14} /> All boards
        </Link>
        <div className="error-container" style={{ marginTop: 'var(--space-4)' }}>
          <span className="error-message">{error ?? 'Board not found'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="kanban-page">
      <div className="page-header">
        <Link to={`/projects/${projectId}/boards`} className="back-link">
          <ArrowLeft size={16} />
          All Boards
        </Link>
        {canInvite && (
          <button className="button secondary" onClick={() => setShowInviteModal(true)}>
            <UserPlus size={16} />
            Invite Member
          </button>
        )}
      </div>

      <div
        style={{
          padding: 'var(--space-4) var(--space-6) 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <h1 style={{ margin: 0 }}>{board.name}</h1>
        {board.description && (
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{board.description}</p>
        )}
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {board.folders.map((f) => (
            <span key={f.id} className="chip">
              <FolderOpen size={11} /> {f.name}
            </span>
          ))}
        </div>
      </div>

      <KanbanBoard
        projectId={projectId}
        boardId={board.id}
        // Default "All Documents" board covers the full project — don't
        // scope-filter the attach-doc picker. Named boards pass their folder set.
        boardFolderIds={board.isDefault ? undefined : board.folders.map((f) => f.id)}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        isMember={isMember}
        members={members}
        onViewDocument={handleViewDocument}
      />

      {projectId && (
        <InviteMemberModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          projectId={projectId}
          onSuccess={handleInviteSuccess}
        />
      )}
    </div>
  );
}
