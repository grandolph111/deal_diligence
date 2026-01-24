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
import { apiClient } from '../api';
import { useAuth } from '../auth';
import type { Role } from '../types/api';
import '../features/settings/settings.css';

type TabType = 'general' | 'team';

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

  // Get current user's role
  const currentUserMember = members.find((m) => m.user?.email === user?.email);
  const currentUserId = currentUserMember?.user?.id || '';
  const currentUserRole: Role = currentUserMember?.role || 'VIEWER';
  const isAdmin = currentUserRole === 'OWNER' || currentUserRole === 'ADMIN';

  // Fetch all data
  const fetchAllData = useCallback(async () => {
    if (!projectId || authLoading || !apiClient.isReady()) return;

    try {
      await Promise.all([
        fetchProject(),
        fetchMembers(),
        fetchInvitations(),
      ]);
    } catch (err) {
      // Error handled in hooks
    } finally {
      setInitialized(true);
    }
  }, [projectId, authLoading, fetchProject, fetchMembers, fetchInvitations]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Redirect non-admin users
  useEffect(() => {
    if (initialized && !isAdmin && currentUserMember) {
      navigate(`/projects/${projectId}`, { replace: true });
    }
  }, [initialized, isAdmin, currentUserMember, projectId, navigate]);

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
          <h1>Project Settings</h1>
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
          onArchiveProject={archiveProject}
          onDeleteProject={handleDeleteProject}
          onTransferOwnership={handleTransferOwnership}
        />
      )}

      {activeTab === 'team' && (
        <TeamTab
          members={members}
          invitations={invitations}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          membersLoading={membersLoading}
          invitationsLoading={invitationsLoading}
          onUpdateMember={updateMember}
          onRemoveMember={removeMember}
          onCreateInvitation={createInvitation}
          onResendInvitation={resendInvitation}
          onCancelInvitation={cancelInvitation}
          onRefresh={fetchAllData}
        />
      )}
    </div>
  );
}
