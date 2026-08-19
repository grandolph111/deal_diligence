/**
 * AI feature readiness for a deal.
 *
 * Chat and Kanban AI answer from the knowledge library, and the library is
 * built BY extraction — upload, extract, file provisions against the diligence
 * checklist. Before any document finishes, the checklist has its structure but
 * nothing behind it, so a question routes to items with no evidence and comes
 * back empty.
 *
 * The alternative to admitting that was retrieval quietly falling back to
 * whatever handful of documents happened to be readable, which produces an
 * answer that looks complete and is not. Telling the user the feature is still
 * warming up — and how far along it is — is both honest and more useful: a
 * partial answer with no indication it is partial is the worst outcome in
 * diligence, where the whole question is what you might have missed.
 *
 * Everything here is folder-scoped, so an SME with access to two folders sees
 * readiness for the deal they can actually see, not the deal as a whole.
 */

import { prisma } from '../../config/database';
import { resolveProjectScope } from '../../services/scope.service';
import { ApiError } from '../../utils/ApiError';

export interface ProjectReadiness {
  /** Documents in the caller's scope. */
  total: number;
  complete: number;
  processing: number;
  /** Queued but not yet started, including anything sitting in a batch. */
  pending: number;
  failed: number;
  /** Provisions filed into the checklist — what retrieval actually searches. */
  evidenceCount: number;

  /** True once there is at least one extracted document to answer from. */
  ready: boolean;
  /**
   * Ready, but extraction is still running. Answers are correct for what has
   * been read and will improve — worth saying, because "I found no
   * change-of-control clause" means something different mid-ingest.
   */
  partial: boolean;
  /** Machine-readable state for the UI. */
  state: 'EMPTY' | 'PROCESSING' | 'PARTIAL' | 'READY' | 'NO_ACCESS' | 'FAILED';
  /** One sentence a user can act on. */
  message: string;
}

const describe = (r: Omit<ProjectReadiness, 'state' | 'message'>): {
  state: ProjectReadiness['state'];
  message: string;
} => {
  if (r.total === 0) {
    return {
      state: 'EMPTY',
      message:
        'Upload documents to this deal to enable AI chat and Kanban reports. They become available as soon as the first document finishes processing.',
    };
  }
  if (r.complete === 0) {
    // Every document failed — a stuck deal, not a warming-up one. Distinguishing
    // these matters: one resolves itself, the other needs somebody to look.
    if (r.failed > 0 && r.processing === 0 && r.pending === 0) {
      return {
        state: 'FAILED',
        message: `All ${r.failed} document${r.failed === 1 ? '' : 's'} failed to process. AI features need at least one successful extraction — check the document list for errors.`,
      };
    }
    return {
      state: 'PROCESSING',
      message: `Reading your documents — 0 of ${r.total} finished. AI chat and Kanban reports turn on as soon as the first one completes.`,
    };
  }
  if (r.processing > 0 || r.pending > 0) {
    return {
      state: 'PARTIAL',
      message: `${r.complete} of ${r.total} documents processed. Answers cover what has been read so far and will get more complete as the rest finish.`,
    };
  }
  return {
    state: 'READY',
    message: `All ${r.complete} documents processed.`,
  };
};

export const readinessService = {
  async getProjectReadiness(
    projectId: string,
    userId: string
  ): Promise<ProjectReadiness> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, platformRole: true, companyId: true },
    });
    if (!user) throw ApiError.unauthorized('User not found');

    const scope = await resolveProjectScope(user, projectId);

    // A member with no folder grants has nothing to be ready about. This is a
    // permissions state, not a processing state, and must not read as "still
    // loading" — the wait would never end.
    if (!scope.isFullAccess && scope.allowedFolderIds.length === 0) {
      return {
        total: 0,
        complete: 0,
        processing: 0,
        pending: 0,
        failed: 0,
        evidenceCount: 0,
        ready: false,
        partial: false,
        state: 'NO_ACCESS',
        message:
          "You haven't been granted access to any folders in this deal yet. Ask your Customer Admin to share the folders you need.",
      };
    }

    const folderFilter = scope.isFullAccess
      ? {}
      : { folderId: { in: scope.allowedFolderIds } };

    const [grouped, evidenceCount] = await Promise.all([
      prisma.document.groupBy({
        by: ['processingStatus'],
        where: { projectId, ...folderFilter },
        _count: { _all: true },
      }),
      prisma.libraryNode.count({
        where: { projectId, sourceDocumentId: { not: null } },
      }),
    ]);

    const count = (status: string): number =>
      grouped.find((g) => g.processingStatus === status)?._count._all ?? 0;

    const complete = count('COMPLETE');
    const processing = count('PROCESSING');
    // A document waiting in a batch is queued from the user's point of view;
    // the distinction between "in our queue" and "in Anthropic's" is ours.
    const pending = count('PENDING') + count('BATCHED');
    const failed = count('FAILED');
    const total = complete + processing + pending + failed;

    const base = {
      total,
      complete,
      processing,
      pending,
      failed,
      evidenceCount,
      ready: complete > 0,
      partial: complete > 0 && (processing > 0 || pending > 0),
    };

    return { ...base, ...describe(base) };
  },
};
