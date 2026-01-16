import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Users, CheckSquare, FolderOpen } from 'lucide-react';
import { useAuth } from '../auth';
import { projectsService, apiClient } from '../api';
import type { Project } from '../types/api';

/**
 * Dashboard page - shows user's projects
 */
export function DashboardPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for Auth0 to finish and API client to be ready
    if (authLoading || !apiClient.isReady()) {
      return;
    }

    async function fetchProjects() {
      try {
        const data = await projectsService.getProjects();
        setProjects(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch projects:', err);
        setError('Failed to load projects');
      } finally {
        setLoading(false);
      }
    }

    fetchProjects();
  }, [authLoading]);

  return (
    <div className="dashboard-page">
      <div className="dashboard-header">
        <h1>Welcome, {user?.name || user?.email || 'User'}</h1>
        <p>Your M&A due diligence projects</p>
      </div>

      <div className="dashboard-content">
        <div className="projects-header">
          <h2>Projects</h2>
          <Link to="/projects/new" className="button primary">
            <Plus size={16} />
            New Project
          </Link>
        </div>

        {(authLoading || loading) && (
          <div className="loading-container">
            <div className="loading-spinner" />
            <p>Loading projects...</p>
          </div>
        )}

        {!authLoading && error && (
          <div className="error-container">
            <p className="error-message">{error}</p>
          </div>
        )}

        {!authLoading && !loading && !error && projects.length === 0 && (
          <div className="empty-state">
            <FolderOpen size={48} strokeWidth={1} />
            <h3>No projects yet</h3>
            <p>Create your first project to get started</p>
            <Link to="/projects/new" className="button primary">
              <Plus size={16} />
              Create Project
            </Link>
          </div>
        )}

        {!authLoading && !loading && !error && projects.length > 0 && (
          <div className="projects-grid">
            {projects.map((project) => (
              <Link
                key={project.id}
                to={`/projects/${project.id}`}
                className="project-card"
              >
                <h3>{project.name}</h3>
                {project.description && <p>{project.description}</p>}
                <div className="project-stats">
                  <span>
                    <Users size={14} />
                    {project.memberCount ?? 0} members
                  </span>
                  <span>
                    <CheckSquare size={14} />
                    {project.taskCount ?? 0} tasks
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
