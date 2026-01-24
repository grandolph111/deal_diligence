import { ProjectInfoForm } from './ProjectInfoForm';
import { DangerZone } from './DangerZone';
import type { Project, ProjectMember, UpdateProjectDto, Role } from '../../../types/api';

interface GeneralTabProps {
  project: Project;
  members: ProjectMember[];
  currentUserId: string;
  currentUserRole: Role;
  saving: boolean;
  onUpdateProject: (data: UpdateProjectDto) => Promise<void>;
  onArchiveProject: (isArchived: boolean) => Promise<void>;
  onDeleteProject: () => Promise<void>;
  onTransferOwnership: (newOwnerId: string) => Promise<void>;
}

export function GeneralTab({
  project,
  members,
  currentUserId,
  currentUserRole,
  saving,
  onUpdateProject,
  onArchiveProject,
  onDeleteProject,
  onTransferOwnership,
}: GeneralTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Project Info Section */}
      <div className="settings-section">
        <div className="settings-section-header">
          <div>
            <h3 className="settings-section-title">Project Information</h3>
            <p className="settings-section-description">
              Basic information about your project
            </p>
          </div>
          {project.isArchived && (
            <span className="archived-badge">Archived</span>
          )}
        </div>
        <ProjectInfoForm
          project={project}
          saving={saving}
          onSave={onUpdateProject}
        />
      </div>

      {/* Notifications Section (Placeholder) */}
      <div className="settings-section">
        <div className="settings-section-header">
          <div>
            <h3 className="settings-section-title">Notifications</h3>
            <p className="settings-section-description">
              Configure how you receive notifications
            </p>
          </div>
        </div>
        <div className="placeholder-section">
          <h4>Coming Soon</h4>
          <p>Notification preferences will be available in a future update.</p>
        </div>
      </div>

      {/* Integrations Section (Placeholder) */}
      <div className="settings-section">
        <div className="settings-section-header">
          <div>
            <h3 className="settings-section-title">Integrations</h3>
            <p className="settings-section-description">
              Connect external services
            </p>
          </div>
        </div>
        <div className="placeholder-section">
          <h4>Coming Soon</h4>
          <p>Integration options will be available in a future update.</p>
        </div>
      </div>

      {/* Danger Zone */}
      <DangerZone
        project={project}
        members={members}
        currentUserId={currentUserId}
        currentUserRole={currentUserRole}
        saving={saving}
        onArchive={onArchiveProject}
        onDelete={onDeleteProject}
        onTransferOwnership={onTransferOwnership}
      />
    </div>
  );
}
