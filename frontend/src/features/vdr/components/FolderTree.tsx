import { useState, useCallback } from 'react';
import { FolderOpen, Folder, ChevronRight, ChevronDown, Plus, Lock } from 'lucide-react';
import type { FolderTreeNode } from '../../../types/api';

interface FolderTreeProps {
  folders: FolderTreeNode[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder?: (parentId: string | null) => void;
  isAdmin?: boolean;
}

interface FolderTreeItemProps {
  folder: FolderTreeNode;
  level: number;
  selectedFolderId: string | null;
  expandedIds: Set<string>;
  onSelectFolder: (folderId: string | null) => void;
  onToggleExpand: (folderId: string) => void;
  onCreateFolder?: (parentId: string | null) => void;
  isAdmin?: boolean;
}

/**
 * Individual folder tree item with expand/collapse functionality
 */
function FolderTreeItem({
  folder,
  level,
  selectedFolderId,
  expandedIds,
  onSelectFolder,
  onToggleExpand,
  onCreateFolder,
  isAdmin,
}: FolderTreeItemProps) {
  const hasChildren = folder.children && folder.children.length > 0;
  const isExpanded = expandedIds.has(folder.id);
  const isSelected = selectedFolderId === folder.id;

  const handleClick = () => {
    onSelectFolder(folder.id);
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand(folder.id);
  };

  const handleCreateSubfolder = (e: React.MouseEvent) => {
    e.stopPropagation();
    onCreateFolder?.(folder.id);
  };

  return (
    <div className="folder-tree-item">
      <div
        className={`folder-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
      >
        {/* Expand/Collapse Toggle */}
        <button
          className="folder-toggle"
          onClick={handleToggle}
          disabled={!hasChildren}
          aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
          ) : (
            <span className="folder-toggle-spacer" />
          )}
        </button>

        {/* Folder Icon */}
        <span className="folder-icon">
          {isExpanded && hasChildren ? (
            <FolderOpen size={18} />
          ) : (
            <Folder size={18} />
          )}
        </span>

        {/* Folder Name */}
        <span className="folder-name" title={folder.name}>
          {folder.name}
        </span>

        {/* View-only indicator */}
        {folder.isViewOnly && (
          <span className="folder-lock" title="View-only folder">
            <Lock size={12} />
          </span>
        )}

        {/* Create subfolder button (admin only) */}
        {isAdmin && onCreateFolder && (
          <button
            className="folder-add-btn"
            onClick={handleCreateSubfolder}
            title="Create subfolder"
          >
            <Plus size={14} />
          </button>
        )}
      </div>

      {/* Nested Children */}
      {hasChildren && isExpanded && (
        <div className="folder-children">
          {folder.children.map((child) => (
            <FolderTreeItem
              key={child.id}
              folder={child}
              level={level + 1}
              selectedFolderId={selectedFolderId}
              expandedIds={expandedIds}
              onSelectFolder={onSelectFolder}
              onToggleExpand={onToggleExpand}
              onCreateFolder={onCreateFolder}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Folder tree sidebar component
 * Displays hierarchical folder structure with expand/collapse
 */
export function FolderTree({
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  isAdmin = false,
}: FolderTreeProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    // Initially expand first level
    return new Set(folders.map((f) => f.id));
  });

  const handleToggleExpand = useCallback((folderId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const handleSelectAllDocuments = () => {
    onSelectFolder(null);
  };

  return (
    <div className="folder-tree">
      <div className="folder-tree-header">
        <h3>Folders</h3>
        {isAdmin && onCreateFolder && (
          <button
            className="button small secondary"
            onClick={() => onCreateFolder(null)}
            title="Create root folder"
          >
            <Plus size={14} />
            New
          </button>
        )}
      </div>

      <div className="folder-tree-content">
        {/* All Documents option */}
        <div
          className={`folder-row all-documents ${selectedFolderId === null ? 'selected' : ''}`}
          onClick={handleSelectAllDocuments}
        >
          <span className="folder-toggle-spacer" />
          <span className="folder-icon">
            <FolderOpen size={18} />
          </span>
          <span className="folder-name">All Documents</span>
        </div>

        {/* Folder tree */}
        {folders.length === 0 ? (
          <div className="folder-tree-empty">
            <p>No folders yet</p>
            {isAdmin && onCreateFolder && (
              <button
                className="button small primary"
                onClick={() => onCreateFolder(null)}
              >
                Create First Folder
              </button>
            )}
          </div>
        ) : (
          folders.map((folder) => (
            <FolderTreeItem
              key={folder.id}
              folder={folder}
              level={0}
              selectedFolderId={selectedFolderId}
              expandedIds={expandedIds}
              onSelectFolder={onSelectFolder}
              onToggleExpand={handleToggleExpand}
              onCreateFolder={onCreateFolder}
              isAdmin={isAdmin}
            />
          ))
        )}
      </div>
    </div>
  );
}
