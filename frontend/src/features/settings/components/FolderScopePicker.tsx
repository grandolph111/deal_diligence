import { FolderTree, Folder as FolderIcon, FolderOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FolderTreeNode } from '../../../types/api';

interface FolderScopePickerProps {
  folderTree: FolderTreeNode[];
  selectedFolderIds: string[];
  onChange: (folderIds: string[]) => void;
  disabled?: boolean;
}

export function FolderScopePicker({
  folderTree,
  selectedFolderIds,
  onChange,
  disabled = false,
}: FolderScopePickerProps) {
  const selectedSet = useMemo(() => new Set(selectedFolderIds), [selectedFolderIds]);

  const toggle = (id: string) => {
    const next = new Set(selectedSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  const clearAll = () => onChange([]);

  if (folderTree.length === 0) {
    return (
      <div className="folder-scope-empty">
        <FolderTree size={16} />
        <span>No folders yet. Create folders in the Data Room first.</span>
      </div>
    );
  }

  const isRestricted = selectedFolderIds.length > 0;

  return (
    <div className="folder-scope-picker">
      <div className="folder-scope-header">
        <div>
          <span className="folder-scope-status">
            {isRestricted ? (
              <>
                Restricted to <strong>{selectedFolderIds.length}</strong>{' '}
                {selectedFolderIds.length === 1 ? 'folder' : 'folders'}
              </>
            ) : (
              <>Full Data Room access</>
            )}
          </span>
          <span className="folder-scope-hint">
            {isRestricted
              ? 'Access includes selected folders and all subfolders.'
              : 'Leave blank for full access, or check folders to restrict scope.'}
          </span>
        </div>
        {isRestricted && (
          <button
            type="button"
            className="folder-scope-clear"
            onClick={clearAll}
            disabled={disabled}
          >
            Clear
          </button>
        )}
      </div>

      <div className="folder-scope-tree">
        {folderTree.map((node) => (
          <FolderNode
            key={node.id}
            node={node}
            depth={0}
            selectedSet={selectedSet}
            onToggle={toggle}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

function FolderNode({
  node,
  depth,
  selectedSet,
  onToggle,
  disabled,
}: {
  node: FolderTreeNode;
  depth: number;
  selectedSet: Set<string>;
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  const [expanded, setExpanded] = useState(depth < 1);
  const hasChildren = node.children && node.children.length > 0;
  const checked = selectedSet.has(node.id);

  return (
    <div className="folder-node">
      <div className="folder-node-row" style={{ paddingLeft: `calc(var(--space-2) + ${depth * 16}px)` }}>
        <button
          type="button"
          className="folder-node-chevron"
          onClick={() => hasChildren && setExpanded((v) => !v)}
          aria-label={hasChildren ? (expanded ? 'Collapse' : 'Expand') : undefined}
          disabled={!hasChildren}
        >
          {hasChildren ? (
            expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />
          ) : (
            <span className="folder-node-spacer" />
          )}
        </button>
        <label className="folder-node-label">
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggle(node.id)}
            disabled={disabled}
          />
          {checked ? (
            <FolderOpen size={14} className="folder-node-icon checked" />
          ) : (
            <FolderIcon size={14} className="folder-node-icon" />
          )}
          <span className="folder-node-name">{node.name}</span>
          {node._count?.documents != null && (
            <span className="folder-node-count">{node._count.documents}</span>
          )}
        </label>
      </div>
      {hasChildren && expanded && (
        <div className="folder-node-children">
          {node.children.map((child) => (
            <FolderNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedSet={selectedSet}
              onToggle={onToggle}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
