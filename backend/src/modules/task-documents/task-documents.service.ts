import { prisma } from '../../config/database';
import { ApiError } from '../../utils/ApiError';

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
