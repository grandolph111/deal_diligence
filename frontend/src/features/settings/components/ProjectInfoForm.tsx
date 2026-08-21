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
        <label htmlFor="project-name">Deal name</label>
        <input
          id="project-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Project Meridian — Acme acquisition"
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
          placeholder="One or two lines on the transaction — shown on the dashboard."
          maxLength={2000}
          disabled={saving}
        />
        <p className="field-hint">Optional. {2000 - description.length} characters left.</p>
      </div>

      <div className="form-actions">
        {hasChanges && (
          <>
            <span className="form-dirty-note">Unsaved changes</span>
            <button
              type="button"
              className="button secondary"
              onClick={handleReset}
              disabled={saving}
            >
              Discard
            </button>
          </>
        )}
        <button
          type="submit"
          className={hasChanges ? 'button primary' : 'button secondary'}
          disabled={!hasChanges || saving}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}
