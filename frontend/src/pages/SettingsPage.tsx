import { useEffect, useState, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import {
  SettingsTabs,
  GeneralTab,
  TeamTab,
  useProjectSettings,
  useTeamMembers,
  useInvitations,
} from '../features/settings';
import { PlaybookTab } from '../features/settings/components/PlaybookTab';
import { apiClient, foldersService } from '../api';
import { useAuth } from '../auth';
import type { Role, FolderTreeNode } from '../types/api';
import '../features/settings/settings.css';

type TabType = 'general' | 'team' | 'playbook';

export function SettingsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuth();

  // Get tab from URL, default to 'general'
  const activeTab = (searchParams.get('tab') as TabType) || 'general';

  // Hooks for data
  const {
    project,
    loading: projectLoading,
    saving: projectSaving,
    fetchProject,
    updateProject,
    archiveProject,
    deleteProject,
    transferOwnership,
  } = useProjectSettings(projectId);

  const {
    members,
    loading: membersLoading,
    fetchMembers,
    updateMember,
    removeMember,
  } = useTeamMembers(projectId);

  const {
    invitations,
    loading: invitationsLoading,
    fetchInvitations,
    createInvitation,
    cancelInvitation,
    resendInvitation,
  } = useInvitations(projectId);

  // Local state
  const [initialized, setInitialized] = useState(false);
  const [folderTree, setFolderTree] = useState<FolderTreeNode[]>([]);

  // Get current user's role. Platform-level Super Admin and the company's
  // Customer Admin get synthetic OWNER access even without a ProjectMember row.
  const isPlatformOwner =
    user?.platformRole === 'SUPER_ADMIN' ||
    (user?.platformRole === 'CUSTOMER_ADMIN' &&
      !!user.companyId &&
      !!project?.companyId &&
      user.companyId === project.companyId);

  const currentUserMember = members.find((m) => m.user?.email === user?.email);
  const currentUserId = currentUserMember?.user?.id || user?.id || '';
  const currentUserRole: Role = isPlatformOwner
    ? 'OWNER'
    : currentUserMember?.role || 'VIEWER';
  const isAdmin = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    if (!projectId || authLoading || !apiClient.isReady()) return;

    try {
      const [, , , tree] = await Promise.all([
        fetchProject(),
        fetchMembers(),
        fetchInvitations(),
        foldersService.getFolderTree(projectId).catch(() => [] as FolderTreeNode[]),
      ]);
      setFolderTree(tree);
    } catch (err) {
      // Error handled in hooks
    } finally {
      setInitialized(true);
    }
  }, [projectId, authLoading, fetchProject, fetchMembers, fetchInvitations]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Redirect non-admin users (skip when isPlatformOwner — they bypass membership)
  useEffect(() => {
    if (initialized && !isAdmin && !isPlatformOwner && currentUserMember) {
      navigate(`/projects/${projectId}`, { replace: true });
    }
  }, [initialized, isAdmin, isPlatformOwner, currentUserMember, projectId, navigate]);

  const handleTabChange = (tab: TabType) => {
    setSearchParams({ tab });
  };

  const handleDeleteProject = async () => {
    await deleteProject();
    navigate('/dashboard', { replace: true });
  };

  const handleTransferOwnership = async (newOwnerId: string) => {
    await transferOwnership(newOwnerId);
    await fetchMembers();
  };

  // Loading state
  if (authLoading || !initialized || projectLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading settings...</p>
      </div>
    );
  }

  // Project not found
  if (!project) {
    return (
      <div className="settings-page">
        <div className="empty-state">
          <AlertCircle size={48} className="empty-state-icon" />
          <h4 className="empty-state-title">Project Not Found</h4>
          <p className="empty-state-description">
            The project you're looking for doesn't exist or you don't have access.
          </p>
          <Link to="/dashboard" className="button primary">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Unauthorized
  if (!isAdmin) {
    return (
      <div className="settings-page">
        <div className="empty-state">
          <AlertCircle size={48} className="empty-state-icon" />
          <h4 className="empty-state-title">Access Denied</h4>
          <p className="empty-state-description">
            You don't have permission to access project settings.
          </p>
          <Link to={`/projects/${projectId}`} className="button primary">
            Go to Project
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="page-header">
        <div>
          <Link to={`/projects/${projectId}`} className="back-link">
            <ArrowLeft size={16} />
            Back to Project
          </Link>
          <h1>Project Admin</h1>
        </div>
      </div>

      <SettingsTabs activeTab={activeTab} onTabChange={handleTabChange} />

      {activeTab === 'general' && (
        <GeneralTab
          project={project}
          members={members}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          saving={projectSaving}
          onUpdateProject={async (data) => {
            await updateProject(data);
          }}
          onArchiveProject={async (isArchived) => {
            await archiveProject(isArchived);
          }}
          onDeleteProject={handleDeleteProject}
          onTransferOwnership={handleTransferOwnership}
        />
      )}

      {activeTab === 'team' && (
        <TeamTab
          members={members}
          invitations={invitations}
          folderTree={folderTree}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          membersLoading={membersLoading}
          invitationsLoading={invitationsLoading}
          onUpdateMember={async (memberId, data) => {
            await updateMember(memberId, data);
          }}
          onRemoveMember={removeMember}
          onCreateInvitation={createInvitation}
          onResendInvitation={async (invitationId) => {
            await resendInvitation(invitationId);
          }}
          onCancelInvitation={cancelInvitation}
          onRefresh={fetchAllData}
        />
      )}

      {activeTab === 'playbook' && projectId && (
        <PlaybookTab projectId={projectId} canEdit={isAdmin} />
      )}
    </div>
  );
}
