import { useState, useEffect, type FormEvent } from 'react';
import type { Project, UpdateProjectDto } from '../../../types/api';

interface ProjectInfoFormProps {
  project: Project;
  saving: boolean;
  onSave: (data: UpdateProjectDto) => Promise<void>;
}

export function ProjectInfoForm({ project, saving, onSave }: ProjectInfoFormProps) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description || '');
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    setName(project.name);
    setDescription(project.description || '');
    setHasChanges(false);
  }, [project]);

  useEffect(() => {
    const nameChanged = name !== project.name;
    const descChanged = description !== (project.description || '');
    setHasChanges(nameChanged || descChanged);
  }, [name, description, project.name, project.description]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!hasChanges || saving) return;

    const data: UpdateProjectDto = {};
    if (name !== project.name) data.name = name;
    if (description !== (project.description || '')) {
      data.description = description || undefined;
    }

    await onSave(data);
  };

  const handleReset = () => {
    setName(project.name);
    setDescription(project.description || '');
  };

  return (
    <form className="project-info-form" onSubmit={handleSubmit}>
      <div className="form-group">
        <label htmlFor="project-name">Project Name</label>
        <input
          id="project-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter project name"
          required
          maxLength={255}
          disabled={saving}
        />
      </div>

      <div className="form-group">
        <label htmlFor="project-description">Description</label>
        <textarea
          id="project-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter project description (optional)"
          maxLength={2000}
          disabled={saving}
        />
      </div>

      <div className="form-actions">
        {hasChanges && (
          <button
            type="button"
            className="button secondary"
            onClick={handleReset}
            disabled={saving}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          className="button primary"
          disabled={!hasChanges || saving}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
