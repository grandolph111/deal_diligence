import { prisma } from '../../config/database';
import { CreateCommentInput, UpdateCommentInput } from './comments.validators';
import { ApiError } from '../../utils/ApiError';

const commentInclude = {
  author: {
    select: {
      id: true,
      email: true,
      name: true,
      avatarUrl: true,
    },
  },
};

export const commentsService = {
  async getTaskComments(taskId: string) {
    return prisma.taskComment.findMany({
      where: { taskId },
      include: commentInclude,
      orderBy: { createdAt: 'asc' },
    });
  },

  async getCommentById(commentId: string) {
    return prisma.taskComment.findUnique({
      where: { id: commentId },
      include: commentInclude,
    });
  },

  async createComment(taskId: string, authorId: string, data: CreateCommentInput) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw ApiError.notFound('Task not found');
    }

    return prisma.taskComment.create({
      data: {
        taskId,
        authorId,
        content: data.content,
      },
      include: commentInclude,
    });
  },

  async updateComment(commentId: string, authorId: string, data: UpdateCommentInput) {
    const comment = await prisma.taskComment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw ApiError.notFound('Comment not found');
    }

    if (comment.authorId !== authorId) {
      throw ApiError.forbidden('You can only edit your own comments');
    }

    return prisma.taskComment.update({
      where: { id: commentId },
      data: { content: data.content },
      include: commentInclude,
    });
  },

  async deleteComment(commentId: string, userId: string, isAdmin: boolean) {
    const comment = await prisma.taskComment.findUnique({
      where: { id: commentId },
    });

    if (!comment) {
      throw ApiError.notFound('Comment not found');
    }

    if (comment.authorId !== userId && !isAdmin) {
      throw ApiError.forbidden('You can only delete your own comments');
    }

    await prisma.taskComment.delete({
      where: { id: commentId },
    });
  },

  async getCommentCountForTask(taskId: string): Promise<number> {
    return prisma.taskComment.count({ where: { taskId } });
  },
};
