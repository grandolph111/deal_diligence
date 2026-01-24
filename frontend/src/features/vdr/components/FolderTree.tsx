import { useState, useCallback } from 'react';
import {
  FolderOpen,
  Folder,
  ChevronRight,
  ChevronDown,
  Plus,
  Lock,
  MoreVertical,
} from 'lucide-react';
import { FolderContextMenu } from './FolderContextMenu';
import type { FolderTreeNode } from '../../../types/api';

interface FolderTreeProps {
  folders: FolderTreeNode[];
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  onCreateFolder?: (parentId: string | null) => void;
  onRenameFolder?: (folderId: string, currentName: string) => void;
  onDeleteFolder?: (folderId: string, folderName: string, hasChildren: boolean, documentCount: number) => void;
  isAdmin?: boolean;
  documentCounts?: Map<string, number>;
}

interface FolderTreeItemProps {
  folder: FolderTreeNode;
  level: number;
  selectedFolderId: string | null;
  expandedIds: Set<string>;
  onSelectFolder: (folderId: string | null) => void;
  onToggleExpand: (folderId: string) => void;
  onCreateFolder?: (parentId: string | null) => void;
  onRenameFolder?: (folderId: string, currentName: string) => void;
  onDeleteFolder?: (folderId: string, folderName: string, hasChildren: boolean, documentCount: number) => void;
  isAdmin?: boolean;
  documentCounts?: Map<string, number>;
}

interface ContextMenuState {
  isOpen: boolean;
  position: { x: number; y: number };
  folderId: string | null;
  folderName: string;
  hasChildren: boolean;
  documentCount: number;
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
  onRenameFolder,
  onDeleteFolder,
  isAdmin,
  documentCounts,
}: FolderTreeItemProps) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    position: { x: 0, y: 0 },
    folderId: null,
    folderName: '',
    hasChildren: false,
    documentCount: 0,
  });

  const hasChildren = folder.children && folder.children.length > 0;
  const isExpanded = expandedIds.has(folder.id);
  const isSelected = selectedFolderId === folder.id;
  const documentCount = documentCounts?.get(folder.id) ?? 0;

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

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAdmin) return;

    setContextMenu({
      isOpen: true,
      position: { x: e.clientX, y: e.clientY },
      folderId: folder.id,
      folderName: folder.name,
      hasChildren,
      documentCount,
    });
  };

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isAdmin) return;

    const button = e.currentTarget as HTMLElement;
    const rect = button.getBoundingClientRect();

    setContextMenu({
      isOpen: true,
      position: { x: rect.right, y: rect.bottom },
      folderId: folder.id,
      folderName: folder.name,
      hasChildren,
      documentCount,
    });
  };

  const closeContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  };

  const handleRename = () => {
    onRenameFolder?.(folder.id, folder.name);
  };

  const handleDelete = () => {
    onDeleteFolder?.(folder.id, folder.name, hasChildren, documentCount);
  };

  return (
    <div className="folder-tree-item">
      <div
        className={`folder-row ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
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

        {/* Document count badge */}
        {documentCount > 0 && (
          <span className="folder-count" title={`${documentCount} document${documentCount === 1 ? '' : 's'}`}>
            {documentCount}
          </span>
        )}

        {/* View-only indicator */}
        {folder.isViewOnly && (
          <span className="folder-lock" title="View-only folder">
            <Lock size={12} />
          </span>
        )}

        {/* Actions (admin only) */}
        {isAdmin && (
          <div className="folder-actions">
            {/* Create subfolder button */}
            {onCreateFolder && (
              <button
                className="folder-action-btn"
                onClick={handleCreateSubfolder}
                title="Create subfolder"
              >
                <Plus size={14} />
              </button>
            )}
            {/* More actions menu */}
            <button
              className="folder-action-btn"
              onClick={handleMoreClick}
              title="More actions"
            >
              <MoreVertical size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Context Menu */}
      <FolderContextMenu
        isOpen={contextMenu.isOpen}
        position={contextMenu.position}
        onClose={closeContextMenu}
        onRename={handleRename}
        onDelete={handleDelete}
        onCreateSubfolder={onCreateFolder ? () => onCreateFolder(folder.id) : undefined}
        isAdmin={isAdmin ?? false}
      />

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
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              isAdmin={isAdmin}
              documentCounts={documentCounts}
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
  onRenameFolder,
  onDeleteFolder,
  isAdmin = false,
  documentCounts,
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

  // Calculate total document count
  const totalDocumentCount = documentCounts
    ? Array.from(documentCounts.values()).reduce((sum, count) => sum + count, 0)
    : 0;

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
          {totalDocumentCount > 0 && (
            <span className="folder-count" title={`${totalDocumentCount} total document${totalDocumentCount === 1 ? '' : 's'}`}>
              {totalDocumentCount}
            </span>
          )}
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
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              isAdmin={isAdmin}
              documentCounts={documentCounts}
            />
          ))
        )}
      </div>
    </div>
  );
}
