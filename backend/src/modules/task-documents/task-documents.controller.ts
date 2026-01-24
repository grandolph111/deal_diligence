/// <reference path="../../types/express.d.ts" />
import { Request, Response } from 'express';
import { taskDocumentsService } from './task-documents.service';
import { linkDocumentSchema } from './task-documents.validators';
import { asyncHandler } from '../../utils/asyncHandler';
import { auditService } from '../audit/audit.service';

export const taskDocumentsController = {
  /**
   * GET /projects/:id/tasks/:taskId/documents
   * List all documents linked to a task
   */
  listDocuments: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const taskId = req.params.taskId as string;

    // Verify task belongs to this project (IDOR protection)
    await taskDocumentsService.verifyTaskInProject(taskId, projectId);

    const documents = await taskDocumentsService.getTaskDocuments(taskId);

    res.json(documents);
  }),

  /**
   * POST /projects/:id/tasks/:taskId/documents
   * Link a document to a task
   */
  linkDocument: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const taskId = req.params.taskId as string;
    const userId = req.user!.id;

    // Verify task belongs to this project (IDOR protection)
    await taskDocumentsService.verifyTaskInProject(taskId, projectId);

    const { documentId } = linkDocumentSchema.parse(req.body);

    // Verify document belongs to this project (IDOR protection)
    await taskDocumentsService.verifyDocumentInProject(documentId, projectId);

    const taskDocument = await taskDocumentsService.linkDocument(
      taskId,
      documentId,
      userId
    );

    // Log the link action
    await auditService.logTaskDocumentLink(req, projectId, taskId, {
      documentId,
    });

    res.status(201).json(taskDocument);
  }),

  /**
   * DELETE /projects/:id/tasks/:taskId/documents/:documentId
   * Unlink a document from a task
   */
  unlinkDocument: asyncHandler(async (req: Request, res: Response) => {
    const projectId = req.params.id as string;
    const taskId = req.params.taskId as string;
    const documentId = req.params.documentId as string;

    // Verify task belongs to this project (IDOR protection)
    await taskDocumentsService.verifyTaskInProject(taskId, projectId);

    // Verify document belongs to this project (IDOR protection)
    await taskDocumentsService.verifyDocumentInProject(documentId, projectId);

    await taskDocumentsService.unlinkDocument(taskId, documentId);

    // Log the unlink action
    await auditService.logTaskDocumentUnlink(req, projectId, taskId, {
      documentId,
    });

    res.status(204).send();
  }),
};
