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
      <div className="settings-section settings-danger">
        <div className="settings-section-header">
          <div>
            <h3 className="settings-section-title">Danger zone</h3>
            <p className="settings-section-description">
              Irreversible actions. Only owners can transfer or delete a deal.
            </p>
          </div>
        </div>

        <div className="danger-actions">
          {/* Archive Project */}
          <div className="danger-action">
            <div className="danger-action-info">
              <span className="danger-action-icon">
                <Archive size={16} />
              </span>
              <div className="danger-action-text">
                <h4 className="danger-action-title">
                  {isArchived ? 'Unarchive deal' : 'Archive deal'}
                </h4>
                <p className="danger-action-description">
                  {isArchived
                    ? 'Restore this deal to active status.'
                    : 'Members keep read access; nobody can edit until it is restored.'}
                </p>
              </div>
            </div>
            <button
              className="button secondary"
              onClick={handleArchive}
              disabled={saving}
            >
              {saving ? 'Saving…' : isArchived ? 'Unarchive' : 'Archive'}
            </button>
          </div>

          {/* Transfer Ownership - Owner Only */}
          {isOwner && (
            <div className="danger-action">
              <div className="danger-action-info">
                <span className="danger-action-icon">
                  <UserCheck size={16} />
                </span>
                <div className="danger-action-text">
                  <h4 className="danger-action-title">Transfer ownership</h4>
                  <p className="danger-action-description">
                    Hand this deal to another member. You stay on as an Admin.
                  </p>
                </div>
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
            <div className="danger-action is-destructive">
              <div className="danger-action-info">
                <span className="danger-action-icon">
                  <Trash2 size={16} />
                </span>
                <div className="danger-action-text">
                  <h4 className="danger-action-title">Delete deal</h4>
                  <p className="danger-action-description">
                    Removes every document, fact sheet, task and report. Cannot be undone.
                  </p>
                </div>
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
