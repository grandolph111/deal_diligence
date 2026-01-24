import { useEffect, useRef } from 'react';
import { Edit2, Trash2, FolderPlus } from 'lucide-react';

interface FolderContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onRename: () => void;
  onDelete: () => void;
  onCreateSubfolder?: () => void;
  isAdmin: boolean;
}

/**
 * Context menu for folder actions (rename, delete, create subfolder)
 */
export function FolderContextMenu({
  isOpen,
  position,
  onClose,
  onRename,
  onDelete,
  onCreateSubfolder,
  isAdmin,
}: FolderContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Adjust horizontal position
    if (rect.right > viewportWidth) {
      menu.style.left = `${viewportWidth - rect.width - 8}px`;
    }

    // Adjust vertical position
    if (rect.bottom > viewportHeight) {
      menu.style.top = `${viewportHeight - rect.height - 8}px`;
    }
  }, [isOpen, position]);

  if (!isOpen || !isAdmin) return null;

  const handleRename = () => {
    onRename();
    onClose();
  };

  const handleDelete = () => {
    onDelete();
    onClose();
  };

  const handleCreateSubfolder = () => {
    onCreateSubfolder?.();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="folder-context-menu"
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 1000,
      }}
    >
      {onCreateSubfolder && (
        <button onClick={handleCreateSubfolder}>
          <FolderPlus size={16} />
          <span>New Subfolder</span>
        </button>
      )}
      <button onClick={handleRename}>
        <Edit2 size={16} />
        <span>Rename</span>
      </button>
      <button onClick={handleDelete} className="danger">
        <Trash2 size={16} />
        <span>Delete</span>
      </button>
    </div>
  );
}
