import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, UserPlus } from 'lucide-react';
import { KanbanBoard, InviteMemberModal } from '../features/kanban';
import { membersService, apiClient } from '../api';
import { useAuth } from '../auth';
import type { ProjectMember } from '../types/api';
import '../features/kanban/kanban.css';

export function KanbanPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { user, isLoading: authLoading } = useAuth();

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Get current user's membership info (match by email from Auth0)
  const currentUserMember = members.find((m) => m.user?.email === user?.email);
  const currentUserId = currentUserMember?.user?.id;
  const isAdmin = currentUserMember?.role === 'OWNER' || currentUserMember?.role === 'ADMIN';
  const canInvite = isAdmin;

  useEffect(() => {
    if (authLoading || !apiClient.isReady() || !projectId) {
      return;
    }

    async function fetchMembers() {
      try {
        setLoading(true);
        const membersData = await membersService.getMembers(projectId!);
        setMembers(membersData);
      } catch (err) {
        // Silently handle - board will still work
      } finally {
        setLoading(false);
      }
    }

    fetchMembers();
  }, [projectId, authLoading]);

  const handleInviteSuccess = async () => {
    if (!projectId) return;
    const membersData = await membersService.getMembers(projectId);
    setMembers(membersData);
  };

  if (authLoading || loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="kanban-page">
      <div className="page-header">
        <Link to={`/projects/${projectId}`} className="back-link">
          <ArrowLeft size={16} />
          Back to Project
        </Link>
        {canInvite && (
          <button className="button secondary" onClick={() => setShowInviteModal(true)}>
            <UserPlus size={16} />
            Invite Member
          </button>
        )}
      </div>

      <KanbanBoard
        projectId={projectId}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        members={members}
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
