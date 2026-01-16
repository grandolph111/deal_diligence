import { Request, Response, NextFunction } from 'express';
import { ProjectRole } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';

// Hierarchy for role comparison
const ROLE_HIERARCHY: Record<ProjectRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

// Load project membership for the current user
export const loadProjectMembership = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const projectId = req.params.id || req.params.projectId;
    const userId = req.user?.id;

    if (!projectId) {
      return next();
    }

    if (!userId) {
      throw ApiError.unauthorized('User not found');
    }

    // First check if project exists
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw ApiError.notFound('Project not found');
    }

    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!membership) {
      throw ApiError.forbidden('You are not a member of this project');
    }

    req.projectMember = membership;
    next();
  } catch (error) {
    next(error);
  }
};

// Require minimum role level
export const requireRole = (...allowedRoles: ProjectRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const membership = req.projectMember;

    if (!membership) {
      return next(ApiError.forbidden('Project membership required'));
    }

    if (!allowedRoles.includes(membership.role)) {
      return next(
        ApiError.forbidden(
          `This action requires one of the following roles: ${allowedRoles.join(', ')}`
        )
      );
    }

    next();
  };
};

// Require minimum role level (hierarchical check)
export const requireMinRole = (minRole: ProjectRole) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const membership = req.projectMember;

    if (!membership) {
      return next(ApiError.forbidden('Project membership required'));
    }

    if (ROLE_HIERARCHY[membership.role] < ROLE_HIERARCHY[minRole]) {
      return next(
        ApiError.forbidden(`This action requires at least ${minRole} role`)
      );
    }

    next();
  };
};

// Check if user has a specific permission in their JSON permissions
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const membership = req.projectMember;

    if (!membership) {
      return next(ApiError.forbidden('Project membership required'));
    }

    // OWNER and ADMIN always have all permissions
    if (membership.role === 'OWNER' || membership.role === 'ADMIN') {
      return next();
    }

    const permissions = membership.permissions as Record<string, unknown> | null;

    if (!permissions || permissions[permission] !== true) {
      return next(ApiError.forbidden(`Missing permission: ${permission}`));
    }

    next();
  };
};
