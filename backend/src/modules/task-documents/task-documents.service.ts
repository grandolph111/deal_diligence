import { prisma } from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { boardsService } from '../../services/boards.service';

/**
 * Document with basic info for task linking
 */
interface LinkedDocument {
  id: string;
  documentId: string;
  linkedAt: Date;
  linkedBy: {
    id: string;
    name: string | null;
    email: string;
  };
  document: {
    id: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    processingStatus: string;
    folderId: string | null;
  };
}

export const taskDocumentsService = {
  /**
   * Verify a task belongs to a project (IDOR protection)
   * @throws ApiError.notFound if task doesn't exist or doesn't belong to project
   */
  async verifyTaskInProject(taskId: string, projectId: string) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, projectId },
    });

    if (!task) {
      throw ApiError.notFound('Task not found in this project');
    }

    return task;
  },

  /**
   * Verify a document belongs to a project (IDOR protection)
   * @throws ApiError.notFound if document doesn't exist or doesn't belong to project
   */
  async verifyDocumentInProject(documentId: string, projectId: string) {
    const document = await prisma.document.findFirst({
      where: { id: documentId, projectId },
    });

    if (!document) {
      throw ApiError.notFound('Document not found in this project');
    }

    return document;
  },

  /**
   * Get all documents linked to a task
   */
  async getTaskDocuments(taskId: string): Promise<LinkedDocument[]> {
    const taskDocuments = await prisma.taskDocument.findMany({
      where: { taskId },
      include: {
        linkedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        document: {
          select: {
            id: true,
            name: true,
            mimeType: true,
            sizeBytes: true,
            processingStatus: true,
            folderId: true,
          },
        },
      },
      orderBy: { linkedAt: 'desc' },
    });

    return taskDocuments.map((td) => ({
      id: td.id,
      documentId: td.documentId,
      linkedAt: td.linkedAt,
      linkedBy: td.linkedBy,
      document: td.document,
    }));
  },

  /**
   * Link a document to a task
   * @throws ApiError.conflict if document is already linked to the task
   */
  async linkDocument(
    taskId: string,
    documentId: string,
    userId: string
  ): Promise<LinkedDocument> {
    // Enforce board-folder confinement: the document must be in one of
    // this task's board's folders (or any descendant). The default
    // "All Documents" board covers the whole project and bypasses this check.
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { projectId: true, boardId: true },
    });
    if (task?.boardId) {
      const board = await prisma.kanbanBoard.findUnique({
        where: { id: task.boardId },
        select: { isDefault: true, name: true },
      });
      if (!board?.isDefault) {
        const scopeFolderIds = await boardsService.expandedBoardFolderIds(
          task.boardId,
          task.projectId
        );
        if (scopeFolderIds.length > 0) {
          const doc = await prisma.document.findFirst({
            where: { id: documentId, projectId: task.projectId },
            select: { folderId: true, name: true },
          });
          if (!doc) throw ApiError.notFound('Document not found');
          if (!doc.folderId || !scopeFolderIds.includes(doc.folderId)) {
            // eslint-disable-next-line no-console
            console.warn(
              `[kanban] linkDocument REJECTED task=${taskId.slice(0, 8)} doc=${documentId.slice(0, 8)} "${doc.name}" ` +
                `— folder=${doc.folderId ?? 'ROOT'} not in board "${board?.name}" scope (${scopeFolderIds.length} folders)`
            );
            throw ApiError.badRequest(
              `"${doc.name}" is outside this board's folder scope and cannot be linked.`
            );
          }
        }
      }
    }

    // Check if already linked
    const existing = await prisma.taskDocument.findUnique({
      where: {
        taskId_documentId: {
          taskId,
          documentId,
        },
      },
    });

    if (existing) {
      throw ApiError.conflict('Document is already linked to this task');
    }

    const created = await prisma.taskDocument.create({
      data: {
        taskId,
        documentId,
        linkedById: userId,
      },
      include: {
        linkedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        document: {
          select: {
            id: true,
            name: true,
            mimeType: true,
            sizeBytes: true,
            processingStatus: true,
            folderId: true,
          },
        },
      },
    });

    // eslint-disable-next-line no-console
    console.log(
      `[kanban] linkDocument OK task=${taskId.slice(0, 8)} doc=${documentId.slice(0, 8)} "${created.document.name}"`
    );

    return {
      id: created.id,
      documentId: created.documentId,
      linkedAt: created.linkedAt,
      linkedBy: created.linkedBy,
      document: created.document,
    };
  },

  /**
   * Unlink a document from a task
   * @throws ApiError.notFound if link doesn't exist
   */
  async unlinkDocument(taskId: string, documentId: string): Promise<void> {
    const existing = await prisma.taskDocument.findUnique({
      where: {
        taskId_documentId: {
          taskId,
          documentId,
        },
      },
    });

    if (!existing) {
      throw ApiError.notFound('Document is not linked to this task');
    }

    await prisma.taskDocument.delete({
      where: {
        taskId_documentId: {
          taskId,
          documentId,
        },
      },
    });
  },

  /**
   * Get all tasks linked to a document
   */
  async getDocumentTasks(documentId: string) {
    const taskDocuments = await prisma.taskDocument.findMany({
      where: { documentId },
      include: {
        linkedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            priority: true,
          },
        },
      },
      orderBy: { linkedAt: 'desc' },
    });

    return taskDocuments.map((td) => ({
      id: td.id,
      taskId: td.taskId,
      linkedAt: td.linkedAt,
      linkedBy: td.linkedBy,
      task: td.task,
    }));
  },
};
