import { useState, useCallback } from 'react';
import { subtasksService } from '../../../api/services/subtasks.service';
import type { Subtask, CreateSubtaskDto, UpdateSubtaskDto } from '../../../types/api';

export function useSubtasks(projectId: string | undefined, taskId: string | undefined) {
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSubtasks = useCallback(async () => {
    if (!projectId || !taskId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await subtasksService.getSubtasks(projectId, taskId);
      setSubtasks(data);
    } catch (err) {
      setError('Failed to load subtasks');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [projectId, taskId]);

  const createSubtask = useCallback(async (data: CreateSubtaskDto): Promise<Subtask> => {
    if (!projectId || !taskId) throw new Error('Missing IDs');

    const subtask = await subtasksService.createSubtask(projectId, taskId, data);
    setSubtasks(prev => [...prev, subtask]);
    return subtask;
  }, [projectId, taskId]);

  const updateSubtask = useCallback(async (subtaskId: string, data: UpdateSubtaskDto): Promise<Subtask> => {
    if (!projectId || !taskId) throw new Error('Missing IDs');

    const updated = await subtasksService.updateSubtask(projectId, taskId, subtaskId, data);
    setSubtasks(prev => prev.map(s => s.id === subtaskId ? updated : s));
    return updated;
  }, [projectId, taskId]);

  const deleteSubtask = useCallback(async (subtaskId: string): Promise<void> => {
    if (!projectId || !taskId) return;

    await subtasksService.deleteSubtask(projectId, taskId, subtaskId);
    setSubtasks(prev => prev.filter(s => s.id !== subtaskId));
  }, [projectId, taskId]);

  const reorderSubtasks = useCallback(async (subtaskIds: string[]): Promise<void> => {
    if (!projectId || !taskId) return;

    const reordered = await subtasksService.reorderSubtasks(projectId, taskId, { subtaskIds });
    setSubtasks(reordered);
  }, [projectId, taskId]);

  return {
    subtasks,
    loading,
    error,
    fetchSubtasks,
    createSubtask,
    updateSubtask,
    deleteSubtask,
    reorderSubtasks,
  };
}
