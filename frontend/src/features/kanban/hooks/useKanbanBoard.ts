import { useState, useCallback } from 'react';
import { tasksService } from '../../../api/services/tasks.service';
import type { Task, KanbanBoard, TaskStatus, CreateTaskDto } from '../../../types/api';

export function useKanbanBoard(
  projectId: string | undefined,
  boardId?: string
) {
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBoard = useCallback(async () => {
    if (!projectId) return;

    try {
      setLoading(true);
      setError(null);
      const data = await tasksService.getKanbanBoard(projectId, boardId);
      setBoard(data);
    } catch (err) {
      setError('Failed to load board');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [projectId, boardId]);

  const createTask = useCallback(async (data: CreateTaskDto): Promise<Task> => {
    if (!projectId) throw new Error('No project ID');

    // New tasks land on the active board by default.
    const task = await tasksService.createTask(projectId, {
      ...data,
      boardId: data.boardId ?? boardId,
    });
    await fetchBoard();
    return task;
  }, [projectId, boardId, fetchBoard]);

  const updateTaskStatus = useCallback(async (taskId: string, status: TaskStatus): Promise<void> => {
    if (!projectId) return;

    await tasksService.updateTaskStatus(projectId, taskId, { status });
    await fetchBoard();
  }, [projectId, fetchBoard]);

  const deleteTask = useCallback(async (taskId: string): Promise<void> => {
    if (!projectId) return;

    await tasksService.deleteTask(projectId, taskId);
    await fetchBoard();
  }, [projectId, fetchBoard]);

  const moveTask = useCallback(async (taskId: string, newStatus: TaskStatus): Promise<void> => {
    if (!projectId || !board) return;

    // Optimistic update
    const updatedBoard = { ...board };
    let movedTask: Task | undefined;

    for (const status of Object.keys(updatedBoard) as TaskStatus[]) {
      const taskIndex = updatedBoard[status].findIndex(t => t.id === taskId);
      if (taskIndex !== -1) {
        [movedTask] = updatedBoard[status].splice(taskIndex, 1);
        break;
      }
    }

    if (movedTask) {
      movedTask = { ...movedTask, status: newStatus };
      updatedBoard[newStatus].push(movedTask);
      setBoard(updatedBoard);

      try {
        await tasksService.updateTaskStatus(projectId, taskId, { status: newStatus });
      } catch {
        await fetchBoard();
      }
    }
  }, [projectId, board, fetchBoard]);

  return {
    board,
    loading,
    error,
    fetchBoard,
    createTask,
    updateTaskStatus,
    deleteTask,
    moveTask,
  };
}
