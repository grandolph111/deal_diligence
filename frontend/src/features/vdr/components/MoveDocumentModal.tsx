import { useState, useCallback } from 'react';
import { X, Folder, ChevronRight, ChevronDown, FolderOpen } from 'lucide-react';
import type { FolderTreeNode } from '../../../types/api';

interface MoveDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (folderId: string | null) => Promise<void>;
  documentName: string;
  currentFolderId: string | null;
  folders: FolderTreeNode[];
}

interface FolderPickerItemProps {
  folder: FolderTreeNode;
  level: number;
  selectedFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  currentFolderId: string | null;
}

function FolderPickerItem({
  folder,
  level,
  selectedFolderId,
  onSelect,
  currentFolderId,
}: FolderPickerItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = folder.children && folder.children.length > 0;
  const isSelected = selectedFolderId === folder.id;
  const isCurrent = currentFolderId === folder.id;

  return (
    <div className="folder-picker-item">
      <button
        type="button"
        className={`folder-picker-row ${isSelected ? 'selected' : ''} ${isCurrent ? 'current' : ''}`}
        style={{ paddingLeft: `${level * 20 + 12}px` }}
        onClick={() => onSelect(folder.id)}
        disabled={isCurrent}
        title={isCurrent ? 'Document is already in this folder' : folder.name}
      >
        {hasChildren ? (
          <button
            type="button"
            className="folder-picker-expand"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="folder-picker-expand-placeholder" />
        )}
        {isSelected ? <FolderOpen size={16} /> : <Folder size={16} />}
        <span className="folder-picker-name">{folder.name}</span>
        {isCurrent && <span className="folder-picker-current-badge">Current</span>}
      </button>

      {hasChildren && isExpanded && (
        <div className="folder-picker-children">
          {folder.children!.map((child) => (
            <FolderPickerItem
              key={child.id}
              folder={child}
              level={level + 1}
              selectedFolderId={selectedFolderId}
              onSelect={onSelect}
              currentFolderId={currentFolderId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MoveDocumentModal({
  isOpen,
  onClose,
  onSubmit,
  documentName,
  currentFolderId,
  folders,
}: MoveDocumentModalProps) {
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async () => {
    if (selectedFolderId === currentFolderId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await onSubmit(selectedFolderId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move document');
    } finally {
      setLoading(false);
    }
  }, [selectedFolderId, currentFolderId, onSubmit, onClose]);

  const handleSelectRoot = useCallback(() => {
    if (currentFolderId !== null) {
      setSelectedFolderId(null);
    }
  }, [currentFolderId]);

  if (!isOpen) {
    return null;
  }

  const isRootCurrent = currentFolderId === null;
  const isRootSelected = selectedFolderId === null;
  const canSubmit = selectedFolderId !== currentFolderId && !loading;

  return (
    <div className="modal-overlay">
      <div className="modal move-document-modal">
        <div className="modal-header">
          <h2>Move Document</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="move-document-info">
            Select a destination folder for <strong>{documentName}</strong>
          </p>

          {error && (
            <div className="modal-error">
              {error}
            </div>
          )}

          <div className="folder-picker">
            {/* Root (All Documents) option */}
            <button
              type="button"
              className={`folder-picker-row root ${isRootSelected ? 'selected' : ''} ${isRootCurrent ? 'current' : ''}`}
              onClick={handleSelectRoot}
              disabled={isRootCurrent}
              title={isRootCurrent ? 'Document is already at root level' : 'Move to root level'}
            >
              <span className="folder-picker-expand-placeholder" />
              {isRootSelected ? <FolderOpen size={16} /> : <Folder size={16} />}
              <span className="folder-picker-name">All Documents (Root)</span>
              {isRootCurrent && <span className="folder-picker-current-badge">Current</span>}
            </button>

            {/* Folder tree */}
            {folders.map((folder) => (
              <FolderPickerItem
                key={folder.id}
                folder={folder}
                level={0}
                selectedFolderId={selectedFolderId}
                onSelect={setSelectedFolderId}
                currentFolderId={currentFolderId}
              />
            ))}
          </div>
        </div>

        <div className="modal-footer">
          <button className="button secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={handleSubmit}
            disabled={!canSubmit}
          >
            {loading ? 'Moving...' : 'Move'}
          </button>
        </div>
      </div>
    </div>
  );
}
