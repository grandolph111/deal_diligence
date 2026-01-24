import { useState } from 'react';
import { Archive, Trash2, UserCheck } from 'lucide-react';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';
import { TransferOwnershipModal } from './TransferOwnershipModal';
import type { Project, ProjectMember, Role } from '../../../types/api';

interface DangerZoneProps {
  project: Project;
  members: ProjectMember[];
  currentUserId: string;
  currentUserRole: Role;
  saving: boolean;
  onArchive: (isArchived: boolean) => Promise<void>;
  onDelete: () => Promise<void>;
  onTransferOwnership: (newOwnerId: string) => Promise<void>;
}

export function DangerZone({
  project,
  members,
  currentUserId,
  currentUserRole,
  saving,
  onArchive,
  onDelete,
  onTransferOwnership,
}: DangerZoneProps) {
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);

  const isOwner = currentUserRole === 'OWNER';
  const isArchived = project.isArchived;

  const handleArchive = async () => {
    await onArchive(!isArchived);
  };

  const handleDelete = async () => {
    await onDelete();
    setShowDeleteModal(false);
  };

  const handleTransfer = async (newOwnerId: string) => {
    await onTransferOwnership(newOwnerId);
    setShowTransferModal(false);
  };

  return (
    <>
      <div className="settings-section danger-zone">
        <div className="settings-section-header">
          <div>
            <h3 className="settings-section-title">Danger Zone</h3>
            <p className="settings-section-description">
              Irreversible and destructive actions
            </p>
          </div>
        </div>

        <div className="danger-actions">
          {/* Archive Project */}
          <div className="danger-action">
            <div className="danger-action-info">
              <h4 className="danger-action-title">
                <Archive size={16} style={{ marginRight: '8px' }} />
                {isArchived ? 'Unarchive Project' : 'Archive Project'}
              </h4>
              <p className="danger-action-description">
                {isArchived
                  ? 'Restore this project to active status'
                  : 'Archive this project. Members can still view but not edit.'}
              </p>
            </div>
            <button
              className="button secondary"
              onClick={handleArchive}
              disabled={saving}
            >
              {saving ? 'Saving...' : isArchived ? 'Unarchive' : 'Archive'}
            </button>
          </div>

          {/* Transfer Ownership - Owner Only */}
          {isOwner && (
            <div className="danger-action">
              <div className="danger-action-info">
                <h4 className="danger-action-title">
                  <UserCheck size={16} style={{ marginRight: '8px' }} />
                  Transfer Ownership
                </h4>
                <p className="danger-action-description">
                  Transfer this project to another member. You will become an Admin.
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => setShowTransferModal(true)}
                disabled={saving}
              >
                Transfer
              </button>
            </div>
          )}

          {/* Delete Project - Owner Only */}
          {isOwner && (
            <div className="danger-action">
              <div className="danger-action-info">
                <h4 className="danger-action-title">
                  <Trash2 size={16} style={{ marginRight: '8px' }} />
                  Delete Project
                </h4>
                <p className="danger-action-description">
                  Permanently delete this project and all its data. This cannot be undone.
                </p>
              </div>
              <button
                className="button danger"
                onClick={() => setShowDeleteModal(true)}
                disabled={saving}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDeleteModal
        projectName={project.name}
        isOpen={showDeleteModal}
        deleting={saving}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
      />

      <TransferOwnershipModal
        members={members}
        currentUserId={currentUserId}
        isOpen={showTransferModal}
        transferring={saving}
        onConfirm={handleTransfer}
        onCancel={() => setShowTransferModal(false)}
      />
    </>
  );
}
