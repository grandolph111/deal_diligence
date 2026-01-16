import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { projectsService } from '../api';
import type { CreateProjectDto } from '../types/api';

/**
 * Create Project page - form to create a new project
 */
export function CreateProjectPage() {
  const navigate = useNavigate();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateProjectDto>({
    name: '',
    description: '',
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      setError('Project name is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const project = await projectsService.createProject({
        name: formData.name.trim(),
        description: formData.description?.trim() || undefined,
      });

      // Navigate to the new project
      navigate(`/projects/${project.id}`);
    } catch (err) {
      console.error('Failed to create project:', err);
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid = formData.name.trim().length > 0;

  return (
    <div className="create-project-page">
      <div className="page-header">
        <Link to="/dashboard" className="back-link">
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>
        <h1>Create New Project</h1>
        <p>Set up a new M&A due diligence project</p>
      </div>

      <form onSubmit={handleSubmit} className="create-project-form">
        <div className="form-card">
          <div className="form-section">
            <h2>Project Details</h2>

            <div className="form-group">
              <label htmlFor="name">
                Project Name <span className="required">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Acme Corp Acquisition"
                maxLength={255}
                autoFocus
                disabled={isSubmitting}
              />
              <span className="form-hint">
                Choose a clear, descriptive name for your deal
              </span>
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Brief description of the deal (optional)"
                rows={4}
                maxLength={2000}
                disabled={isSubmitting}
              />
              <span className="form-hint">
                Add context about the transaction, timeline, or key details
              </span>
            </div>
          </div>

          {error && (
            <div className="error-container">
              <p className="error-message">{error}</p>
            </div>
          )}

          <div className="form-actions">
            <Link to="/dashboard" className="button secondary">
              Cancel
            </Link>
            <button
              type="submit"
              className="button primary"
              disabled={!isValid || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={16} className="spinner" />
                  Creating...
                </>
              ) : (
                'Create Project'
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
