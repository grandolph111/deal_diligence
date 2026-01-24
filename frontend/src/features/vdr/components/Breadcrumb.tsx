import { ChevronRight, Home } from 'lucide-react';
import type { FolderPathItem } from '../../../types/api';

interface BreadcrumbProps {
  path: FolderPathItem[];
  onNavigate: (folderId: string | null) => void;
}

/**
 * Breadcrumb navigation for folder hierarchy
 */
export function Breadcrumb({ path, onNavigate }: BreadcrumbProps) {
  return (
    <nav className="breadcrumb" aria-label="Folder navigation">
      <ol className="breadcrumb-list">
        {/* Root/All Documents */}
        <li className="breadcrumb-item">
          <button
            className="breadcrumb-link"
            onClick={() => onNavigate(null)}
            title="All Documents"
          >
            <Home size={14} />
            <span>All Documents</span>
          </button>
        </li>

        {/* Folder path items */}
        {path.map((item, index) => (
          <li key={item.id} className="breadcrumb-item">
            <ChevronRight size={14} className="breadcrumb-separator" />
            {index === path.length - 1 ? (
              // Current folder (not clickable)
              <span className="breadcrumb-current">{item.name}</span>
            ) : (
              // Navigable folder
              <button
                className="breadcrumb-link"
                onClick={() => onNavigate(item.id)}
                title={item.name}
              >
                {item.name}
              </button>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
