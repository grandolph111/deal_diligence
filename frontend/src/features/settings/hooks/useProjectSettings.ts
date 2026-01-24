import { useState, useCallback } from 'react';
import { projectsService } from '../../../api/services/projects.service';
import type { Project, UpdateProjectDto } from '../../../types/api';

export function useProjectSettings(projectId: string | undefined) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await projectsService.getProject(projectId);
      setProject(data);
    } catch (err) {
      setError('Failed to load project');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const updateProject = useCallback(async (data: UpdateProjectDto): Promise<Project> => {
    if (!projectId) throw new Error('No project ID');

    try {
      setSaving(true);
      setError(null);
      const updated = await projectsService.updateProject(projectId, data);
      setProject(updated);
      return updated;
    } catch (err) {
      setError('Failed to update project');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [projectId]);

  const archiveProject = useCallback(async (isArchived: boolean): Promise<Project> => {
    if (!projectId) throw new Error('No project ID');

    try {
      setSaving(true);
      setError(null);
      const updated = await projectsService.archiveProject(projectId, isArchived);
      setProject(updated);
      return updated;
    } catch (err) {
      setError('Failed to archive project');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [projectId]);

  const deleteProject = useCallback(async (): Promise<void> => {
    if (!projectId) throw new Error('No project ID');

    try {
      setSaving(true);
      setError(null);
      await projectsService.deleteProject(projectId);
    } catch (err) {
      setError('Failed to delete project');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [projectId]);

  const transferOwnership = useCallback(async (newOwnerId: string): Promise<void> => {
    if (!projectId) throw new Error('No project ID');

    try {
      setSaving(true);
      setError(null);
      await projectsService.transferOwnership(projectId, newOwnerId);
    } catch (err) {
      setError('Failed to transfer ownership');
      throw err;
    } finally {
      setSaving(false);
    }
  }, [projectId]);

  return {
    project,
    loading,
    saving,
    error,
    fetchProject,
    updateProject,
    archiveProject,
    deleteProject,
    transferOwnership,
  };
}
