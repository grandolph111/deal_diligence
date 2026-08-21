import { Clock } from 'lucide-react';
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
    <div className="settings-stack">
      {/* Project Info Section */}
      <div className="settings-section">
        <div className="settings-section-header">
          <div>
            <h3 className="settings-section-title">Project details</h3>
            <p className="settings-section-description">
              How this deal is labelled everywhere in the platform.
            </p>
          </div>
          {project.isArchived && <span className="archived-badge">Archived</span>}
        </div>
        <div className="settings-section-body">
          <ProjectInfoForm
            project={project}
            saving={saving}
            onSave={onUpdateProject}
          />
        </div>
      </div>

      {/* Not built yet — stated once, quietly, instead of two empty cards. */}
      <div className="settings-soon">
        <Clock size={16} />
        <span>
          <strong>Notifications and integrations</strong> are not configurable yet — they
          land in a future release.
        </span>
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
