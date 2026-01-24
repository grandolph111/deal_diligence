import { prisma } from '../../config/database';
import { Folder, Prisma } from '@prisma/client';
import { CreateFolderInput, UpdateFolderInput } from './folders.validators';
import { ApiError } from '../../utils/ApiError';

/**
 * Folder with document count and children
 */
interface FolderWithMeta extends Folder {
  documentCount: number;
  children?: FolderWithMeta[];
}

/**
 * Build a tree structure from a flat list of folders
 */
function buildFolderTree(folders: (Folder & { _count: { documents: number } })[]): FolderWithMeta[] {
  const folderMap = new Map<string, FolderWithMeta>();
  const rootFolders: FolderWithMeta[] = [];

  // First pass: create all folder objects with metadata
  for (const folder of folders) {
    folderMap.set(folder.id, {
      ...folder,
      documentCount: folder._count.documents,
      children: [],
    });
  }

  // Second pass: build the tree structure
  for (const folder of folders) {
    const folderWithMeta = folderMap.get(folder.id)!;

    if (folder.parentId === null) {
      rootFolders.push(folderWithMeta);
    } else {
      const parent = folderMap.get(folder.parentId);
      if (parent) {
        parent.children!.push(folderWithMeta);
      }
    }
  }

  // Sort children by name at each level
  const sortChildren = (folders: FolderWithMeta[]) => {
    folders.sort((a, b) => a.name.localeCompare(b.name));
    for (const folder of folders) {
      if (folder.children && folder.children.length > 0) {
        sortChildren(folder.children);
      }
    }
  };

  sortChildren(rootFolders);

  return rootFolders;
}

export const foldersService = {
  /**
   * Verify a folder belongs to a project (IDOR protection)
   * @throws ApiError.notFound if folder doesn't exist or doesn't belong to project
   */
  async verifyFolderInProject(folderId: string, projectId: string): Promise<Folder> {
    const folder = await prisma.folder.findFirst({
      where: { id: folderId, projectId },
    });

    if (!folder) {
      throw ApiError.notFound('Folder not found in this project');
    }

    return folder;
  },

  /**
   * Get all folders for a project as a tree structure
   */
  async getProjectFolderTree(projectId: string): Promise<FolderWithMeta[]> {
    const folders = await prisma.folder.findMany({
      where: { projectId },
      include: {
        _count: {
          select: { documents: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return buildFolderTree(folders);
  },

  /**
   * Get all folders for a project as a flat list
   */
  async getProjectFolders(projectId: string) {
    const folders = await prisma.folder.findMany({
      where: { projectId },
      include: {
        _count: {
          select: { documents: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return folders.map((folder) => ({
      ...folder,
      documentCount: folder._count.documents,
    }));
  },

  /**
   * Get a single folder by ID
   */
  async getFolderById(folderId: string) {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: {
        _count: {
          select: { documents: true },
        },
        parent: true,
        children: {
          include: {
            _count: {
              select: { documents: true },
            },
          },
          orderBy: { name: 'asc' },
        },
      },
    });

    if (!folder) {
      return null;
    }

    return {
      ...folder,
      documentCount: folder._count.documents,
      children: folder.children.map((child) => ({
        ...child,
        documentCount: child._count.documents,
      })),
    };
  },

  /**
   * Create a new folder
   */
  async createFolder(
    projectId: string,
    data: CreateFolderInput
  ): Promise<Folder> {
    const { name, parentId, categoryType, isViewOnly } = data;

    // If parentId is provided, verify it exists in the same project
    if (parentId) {
      await this.verifyFolderInProject(parentId, projectId);
    }

    // Check for duplicate folder name at the same level
    const existing = await prisma.folder.findFirst({
      where: {
        projectId,
        parentId: parentId ?? null,
        name: {
          equals: name,
          mode: 'insensitive',
        },
      },
    });

    if (existing) {
      throw ApiError.conflict(
        'A folder with this name already exists in the same location'
      );
    }

    return prisma.folder.create({
      data: {
        projectId,
        name,
        parentId: parentId ?? null,
        categoryType,
        isViewOnly,
      },
    });
  },

  /**
   * Update a folder (rename or change view-only status)
   */
  async updateFolder(folderId: string, data: UpdateFolderInput): Promise<Folder> {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
    });

    if (!folder) {
      throw ApiError.notFound('Folder not found');
    }

    // If renaming, check for duplicate at the same level
    if (data.name && data.name !== folder.name) {
      const existing = await prisma.folder.findFirst({
        where: {
          projectId: folder.projectId,
          parentId: folder.parentId,
          name: {
            equals: data.name,
            mode: 'insensitive',
          },
          id: { not: folderId },
        },
      });

      if (existing) {
        throw ApiError.conflict(
          'A folder with this name already exists in the same location'
        );
      }
    }

    return prisma.folder.update({
      where: { id: folderId },
      data,
    });
  },

  /**
   * Move a folder to a new parent
   */
  async moveFolder(
    folderId: string,
    projectId: string,
    newParentId: string | null
  ): Promise<Folder> {
    // Verify the folder exists in this project
    const folder = await this.verifyFolderInProject(folderId, projectId);

    // If moving to a new parent, verify it exists in the same project
    if (newParentId) {
      await this.verifyFolderInProject(newParentId, projectId);

      // Prevent moving a folder into itself or its descendants
      const isDescendant = await this.isFolderDescendant(folderId, newParentId);
      if (isDescendant) {
        throw ApiError.badRequest('Cannot move a folder into itself or its descendants');
      }
    }

    // Check for duplicate name at the new location
    const existing = await prisma.folder.findFirst({
      where: {
        projectId,
        parentId: newParentId,
        name: {
          equals: folder.name,
          mode: 'insensitive',
        },
        id: { not: folderId },
      },
    });

    if (existing) {
      throw ApiError.conflict(
        'A folder with this name already exists in the destination'
      );
    }

    return prisma.folder.update({
      where: { id: folderId },
      data: { parentId: newParentId },
    });
  },

  /**
   * Check if a folder is a descendant of another folder
   */
  async isFolderDescendant(
    ancestorId: string,
    potentialDescendantId: string
  ): Promise<boolean> {
    if (ancestorId === potentialDescendantId) {
      return true;
    }

    let currentId: string | null = potentialDescendantId;

    while (currentId) {
      const result: { parentId: string | null } | null = await prisma.folder.findUnique({
        where: { id: currentId },
        select: { parentId: true },
      });

      if (!result) {
        return false;
      }

      if (result.parentId === ancestorId) {
        return true;
      }

      currentId = result.parentId;
    }

    return false;
  },

  /**
   * Delete a folder (must be empty - no documents or child folders)
   */
  async deleteFolder(folderId: string): Promise<void> {
    const folder = await prisma.folder.findUnique({
      where: { id: folderId },
      include: {
        _count: {
          select: {
            documents: true,
            children: true,
          },
        },
      },
    });

    if (!folder) {
      throw ApiError.notFound('Folder not found');
    }

    if (folder._count.documents > 0) {
      throw ApiError.badRequest(
        'Cannot delete folder with documents. Move or delete documents first.'
      );
    }

    if (folder._count.children > 0) {
      throw ApiError.badRequest(
        'Cannot delete folder with subfolders. Delete subfolders first.'
      );
    }

    await prisma.folder.delete({
      where: { id: folderId },
    });
  },

  /**
   * Get folder path (breadcrumb) from root to the specified folder
   */
  async getFolderPath(folderId: string): Promise<Array<{ id: string; name: string }>> {
    const path: Array<{ id: string; name: string }> = [];
    let currentId: string | null = folderId;

    while (currentId) {
      const result: { id: string; name: string; parentId: string | null } | null = await prisma.folder.findUnique({
        where: { id: currentId },
        select: { id: true, name: true, parentId: true },
      });

      if (!result) {
        break;
      }

      path.unshift({ id: result.id, name: result.name });
      currentId = result.parentId;
    }

    return path;
  },

  /**
   * Check if user has access to a folder based on their restrictedFolders permissions
   * OWNER and ADMIN always have access. MEMBER and VIEWER may have folder restrictions.
   */
  async userHasFolderAccess(
    folderId: string,
    userId: string,
    projectId: string
  ): Promise<boolean> {
    const membership = await prisma.projectMember.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

    if (!membership) {
      return false;
    }

    // OWNER and ADMIN have access to all folders
    if (membership.role === 'OWNER' || membership.role === 'ADMIN') {
      return true;
    }

    const permissions = membership.permissions as Record<string, unknown> | null;

    // If no restrictedFolders, user has access to all folders they can see
    if (!permissions || !permissions.restrictedFolders) {
      return true;
    }

    const restrictedFolders = permissions.restrictedFolders as string[];

    // Check if this folder or any of its ancestors is in the restricted list
    const folderPath = await this.getFolderPath(folderId);
    return folderPath.some((folder) => restrictedFolders.includes(folder.id));
  },
};
