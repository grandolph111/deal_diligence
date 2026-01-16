import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Users,
  FileText,
  Kanban,
  Settings,
  Trash2,
  Calendar,
  ArrowLeft,
} from 'lucide-react';
import { projectsService, membersService, apiClient } from '../api';
import { useAuth } from '../auth';
import type { Project, ProjectMember } from '../types/api';

/**
 * Project Overview page - shows project details, stats, and quick actions
 */
export function ProjectOverviewPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { isLoading: authLoading } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get current user's role in the project
  const currentUserMember = members.find((m) => m.user?.email);
  const userRole = currentUserMember?.role;
  const isOwner = userRole === 'OWNER';
  const isAdmin = userRole === 'ADMIN' || isOwner;

  useEffect(() => {
    if (authLoading || !apiClient.isReady() || !projectId) {
      return;
    }

    async function fetchProjectData() {
      try {
        setLoading(true);
        setError(null);

        // Fetch project and members in parallel
        const [projectData, membersData] = await Promise.all([
          projectsService.getProject(projectId!),
          membersService.getMembers(projectId!),
        ]);

        setProject(projectData);
        setMembers(membersData);
      } catch (err) {
        console.error('Failed to fetch project:', err);
        setError('Failed to load project');
      } finally {
        setLoading(false);
      }
    }

    fetchProjectData();
  }, [projectId, authLoading]);

  const handleDelete = async () => {
    if (!projectId) return;

    setIsDeleting(true);
    try {
      await projectsService.deleteProject(projectId);
      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to delete project:', err);
      setError('Failed to delete project');
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  if (authLoading || loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner" />
        <p>Loading project...</p>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="project-overview-page">
        <div className="page-header">
          <Link to="/dashboard" className="back-link">
            <ArrowLeft size={16} />
            Back to Dashboard
          </Link>
        </div>
        <div className="error-container">
          <p className="error-message">{error || 'Project not found'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="project-overview-page">
      {/* Header */}
      <div className="page-header">
        <Link to="/dashboard" className="back-link">
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>
        <div className="project-title-row">
          <div>
            <h1>{project.name}</h1>
            {project.description && <p>{project.description}</p>}
          </div>
          {isAdmin && (
            <Link
              to={`/projects/${projectId}/settings`}
              className="button secondary"
            >
              <Settings size={16} />
              Settings
            </Link>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">
            <Users size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{project.memberCount ?? members.length}</span>
            <span className="stat-label">Team Members</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Kanban size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{project.taskCount ?? 0}</span>
            <span className="stat-label">Tasks</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <FileText size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{project.documentCount ?? 0}</span>
            <span className="stat-label">Documents</span>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Calendar size={20} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{formatDate(project.createdAt)}</span>
            <span className="stat-label">Created</span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="section">
        <h2>Quick Actions</h2>
        <div className="quick-actions-grid">
          <Link
            to={`/projects/${projectId}/board`}
            className="quick-action-card"
          >
            <Kanban size={24} />
            <span>Open Kanban Board</span>
            <p>View and manage due diligence tasks</p>
          </Link>

          <Link
            to={`/projects/${projectId}/members`}
            className="quick-action-card"
          >
            <Users size={24} />
            <span>Manage Team</span>
            <p>Invite members and manage permissions</p>
          </Link>

          <Link
            to={`/projects/${projectId}/settings`}
            className="quick-action-card"
          >
            <Settings size={24} />
            <span>Project Settings</span>
            <p>Configure project details and preferences</p>
          </Link>
        </div>
      </div>

      {/* Team Members Preview */}
      <div className="section">
        <div className="section-header">
          <h2>Team Members</h2>
          <Link to={`/projects/${projectId}/members`} className="view-all-link">
            View All
          </Link>
        </div>

        <div className="members-list">
          {members.slice(0, 5).map((member) => (
            <div key={member.id} className="member-item">
              <div className="member-avatar">
                {member.user?.avatarUrl ? (
                  <img src={member.user.avatarUrl} alt={member.user.name || ''} />
                ) : (
                  <span>{(member.user?.name || member.user?.email || '?')[0].toUpperCase()}</span>
                )}
              </div>
              <div className="member-info">
                <span className="member-name">
                  {member.user?.name || member.user?.email}
                </span>
                <span className="member-role">{member.role}</span>
              </div>
            </div>
          ))}

          {members.length === 0 && (
            <p className="no-members">No team members yet</p>
          )}

          {members.length > 5 && (
            <p className="more-members">
              +{members.length - 5} more members
            </p>
          )}
        </div>
      </div>

      {/* Danger Zone - Only for Owners */}
      {isOwner && (
        <div className="section danger-zone">
          <h2>Danger Zone</h2>
          <div className="danger-content">
            <div className="danger-text">
              <strong>Delete this project</strong>
              <p>
                Once deleted, all project data including tasks, members, and
                documents will be permanently removed.
              </p>
            </div>
            <button
              className="button danger"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 size={16} />
              Delete Project
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Project</h3>
            <p>
              Are you sure you want to delete <strong>{project.name}</strong>?
              This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                className="button danger"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
