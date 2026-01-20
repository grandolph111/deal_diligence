import { useState, useCallback } from 'react';
import { tasksService } from '../../../api/services/tasks.service';
import type { Task, UpdateTaskDto } from '../../../types/api';

export function useTaskDetail(projectId: string | undefined) {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTask = useCallback(async (taskId: string) => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await tasksService.getTask(projectId, taskId);
      setTask(data);
    } catch (err) {
      setError('Failed to load task');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const updateTask = useCallback(async (taskId: string, data: UpdateTaskDto): Promise<Task> => {
    if (!projectId) throw new Error('No project ID');

    const updated = await tasksService.updateTask(projectId, taskId, data);
    setTask(updated);
    return updated;
  }, [projectId]);

  const addAssignee = useCallback(async (taskId: string, userId: string): Promise<void> => {
    if (!projectId) return;

    await tasksService.addAssignee(projectId, taskId, userId);
    await fetchTask(taskId);
  }, [projectId, fetchTask]);

  const removeAssignee = useCallback(async (taskId: string, userId: string): Promise<void> => {
    if (!projectId) return;

    await tasksService.removeAssignee(projectId, taskId, userId);
    await fetchTask(taskId);
  }, [projectId, fetchTask]);

  const addTag = useCallback(async (taskId: string, tagId: string): Promise<void> => {
    if (!projectId) return;

    await tasksService.addTag(projectId, taskId, tagId);
    await fetchTask(taskId);
  }, [projectId, fetchTask]);

  const removeTag = useCallback(async (taskId: string, tagId: string): Promise<void> => {
    if (!projectId) return;

    await tasksService.removeTag(projectId, taskId, tagId);
    await fetchTask(taskId);
  }, [projectId, fetchTask]);

  const clearTask = useCallback(() => {
    setTask(null);
    setError(null);
  }, []);

  return {
    task,
    loading,
    error,
    fetchTask,
    updateTask,
    addAssignee,
    removeAssignee,
    addTag,
    removeTag,
    clearTask,
  };
}
