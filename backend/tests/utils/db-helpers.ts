import { PrismaClient, ProjectRole, TaskStatus, TaskPriority, SubtaskStatus, Folder, DocumentStatus, DocumentEntity } from '@prisma/client';
import { testUsers, MockUser } from './auth-mock';

// Use a separate Prisma client for tests
const prisma = new PrismaClient();

export { prisma as testPrisma };

/**
 * Clean all test data from the database
 * Respects foreign key constraints by deleting in correct order
 */
export async function cleanDatabase(): Promise<void> {
  // Delete in reverse order of dependencies
  await prisma.taskComment.deleteMany();
  await prisma.subtask.deleteMany();
  await prisma.taskTag.deleteMany();
  await prisma.taskAttachment.deleteMany();
  await prisma.taskAssignee.deleteMany();
  await prisma.taskDocument.deleteMany();
  await prisma.task.deleteMany();
  await prisma.tag.deleteMany();
  // Phase 2B entities
  await prisma.entityRelationship.deleteMany();
  await prisma.documentEntity.deleteMany();
  await prisma.documentAnnotation.deleteMany();
  await prisma.masterEntity.deleteMany();
  await prisma.documentChunk.deleteMany();
  await prisma.document.deleteMany();
  await prisma.folder.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.pendingInvitation.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
}

/**
 * Disconnect the test database client
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

/**
 * Create a test user from mock user data
 */
export async function createTestUser(mockUser: MockUser = testUsers.owner) {
  return prisma.user.create({
    data: {
      auth0Id: mockUser.sub,
      email: mockUser.email,
      name: mockUser.name,
      avatarUrl: mockUser.picture,
    },
  });
}

/**
 * Create multiple test users at once
 */
export async function createTestUsers(mockUsers: MockUser[] = Object.values(testUsers)) {
  const users = await Promise.all(
    mockUsers.map((mockUser) =>
      prisma.user.create({
        data: {
          auth0Id: mockUser.sub,
          email: mockUser.email,
          name: mockUser.name,
          avatarUrl: mockUser.picture,
        },
      })
    )
  );
  return users;
}

/**
 * Create a test project with an owner
 */
export async function createTestProject(
  ownerId: string,
  data: { name?: string; description?: string } = {}
) {
  const project = await prisma.project.create({
    data: {
      name: data.name || 'Test Project',
      description: data.description || 'A test project for testing',
      members: {
        create: {
          userId: ownerId,
          role: ProjectRole.OWNER,
          acceptedAt: new Date(),
        },
      },
    },
    include: {
      members: true,
    },
  });
  return project;
}

/**
 * Add a member to a project
 */
export async function addProjectMember(
  projectId: string,
  userId: string,
  role: ProjectRole = ProjectRole.MEMBER,
  permissions?: Record<string, boolean>
) {
  return prisma.projectMember.create({
    data: {
      projectId,
      userId,
      role,
      permissions: permissions || null,
      acceptedAt: new Date(),
    },
  });
}

/**
 * Create a test task
 */
export async function createTestTask(
  projectId: string,
  createdById: string,
  data: {
    title?: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    dueDate?: Date;
  } = {}
) {
  return prisma.task.create({
    data: {
      projectId,
      createdById,
      title: data.title || 'Test Task',
      description: data.description || 'A test task',
      status: data.status || TaskStatus.TODO,
      priority: data.priority || TaskPriority.MEDIUM,
      dueDate: data.dueDate,
    },
    include: {
      assignees: {
        include: { user: true },
      },
      tags: {
        include: { tag: true },
      },
    },
  });
}

/**
 * Create a test tag
 */
export async function createTestTag(
  projectId: string,
  data: { name?: string; color?: string } = {}
) {
  return prisma.tag.create({
    data: {
      projectId,
      name: data.name || 'Test Tag',
      color: data.color || '#FF0000',
    },
  });
}

/**
 * Assign a user to a task
 */
export async function assignUserToTask(taskId: string, userId: string) {
  return prisma.taskAssignee.create({
    data: {
      taskId,
      userId,
    },
  });
}

/**
 * Add a tag to a task
 */
export async function addTagToTask(taskId: string, tagId: string) {
  return prisma.taskTag.create({
    data: {
      taskId,
      tagId,
    },
  });
}

/**
 * Seed a complete test scenario with users, project, members, and tasks
 */
export async function seedTestScenario() {
  // Create all test users
  const [ownerUser, adminUser, memberUser, viewerUser, outsiderUser] = await createTestUsers([
    testUsers.owner,
    testUsers.admin,
    testUsers.member,
    testUsers.viewer,
    testUsers.outsider,
  ]);

  // Create a project with the owner
  const project = await createTestProject(ownerUser.id, {
    name: 'Test Project',
    description: 'A project for testing all functionality',
  });

  // Add other members
  await addProjectMember(project.id, adminUser.id, ProjectRole.ADMIN);
  await addProjectMember(project.id, memberUser.id, ProjectRole.MEMBER, {
    canAccessKanban: true,
  });
  await addProjectMember(project.id, viewerUser.id, ProjectRole.VIEWER, {
    canAccessKanban: true,
  });

  // Create some tasks
  const tasks = await Promise.all([
    createTestTask(project.id, ownerUser.id, {
      title: 'Task 1 - TODO',
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH,
    }),
    createTestTask(project.id, adminUser.id, {
      title: 'Task 2 - In Progress',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.MEDIUM,
    }),
    createTestTask(project.id, memberUser.id, {
      title: 'Task 3 - Complete',
      status: TaskStatus.COMPLETE,
      priority: TaskPriority.LOW,
    }),
  ]);

  // Create some tags
  const tags = await Promise.all([
    createTestTag(project.id, { name: 'Bug', color: '#FF0000' }),
    createTestTag(project.id, { name: 'Feature', color: '#00FF00' }),
    createTestTag(project.id, { name: 'Urgent', color: '#FF6600' }),
  ]);

  // Assign users and tags to tasks
  await assignUserToTask(tasks[0].id, memberUser.id);
  await addTagToTask(tasks[0].id, tags[0].id);
  await addTagToTask(tasks[1].id, tags[1].id);

  return {
    users: {
      owner: ownerUser,
      admin: adminUser,
      member: memberUser,
      viewer: viewerUser,
      outsider: outsiderUser,
    },
    project,
    tasks,
    tags,
  };
}

/**
 * Create a test comment on a task
 */
export async function createTestComment(
  taskId: string,
  authorId: string,
  data: { content?: string } = {}
) {
  return prisma.taskComment.create({
    data: {
      taskId,
      authorId,
      content: data.content || 'Test comment',
    },
    include: {
      author: {
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
  });
}

/**
 * Create a test subtask
 */
export async function createTestSubtask(
  taskId: string,
  data: {
    title?: string;
    description?: string;
    status?: SubtaskStatus;
    assigneeId?: string;
    dueDate?: Date;
    order?: number;
  } = {}
) {
  return prisma.subtask.create({
    data: {
      taskId,
      title: data.title || 'Test Subtask',
      description: data.description,
      status: data.status || SubtaskStatus.TODO,
      assigneeId: data.assigneeId,
      dueDate: data.dueDate,
      order: data.order ?? 0,
    },
    include: {
      assignee: {
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
  });
}

/**
 * Create a test folder
 */
export async function createTestFolder(
  projectId: string,
  data: {
    name?: string;
    parentId?: string;
    categoryType?: string;
    isViewOnly?: boolean;
  } = {}
): Promise<Folder> {
  return prisma.folder.create({
    data: {
      projectId,
      name: data.name || 'Test Folder',
      parentId: data.parentId || null,
      categoryType: data.categoryType,
      isViewOnly: data.isViewOnly ?? false,
    },
  });
}

/**
 * Create a test document
 * Supports two signatures:
 *   createTestDocument(projectId, uploadedById, options?)
 *   createTestDocument({ projectId, uploadedById, ...options })
 */
export async function createTestDocument(
  projectIdOrData:
    | string
    | {
        projectId: string;
        uploadedById: string;
        name?: string;
        folderId?: string;
        s3Key?: string;
        mimeType?: string;
        sizeBytes?: number;
        processingStatus?: DocumentStatus;
      },
  uploadedById?: string,
  options: {
    name?: string;
    folderId?: string;
    s3Key?: string;
    mimeType?: string;
    sizeBytes?: number;
    processingStatus?: DocumentStatus;
  } = {}
) {
  // Support both old and new signature
  let data: {
    projectId: string;
    uploadedById: string;
    name?: string;
    folderId?: string;
    s3Key?: string;
    mimeType?: string;
    sizeBytes?: number;
    processingStatus?: DocumentStatus;
  };

  if (typeof projectIdOrData === 'string') {
    // Old signature: createTestDocument(projectId, uploadedById, options?)
    data = {
      projectId: projectIdOrData,
      uploadedById: uploadedById!,
      ...options,
    };
  } else {
    // New signature: createTestDocument({ projectId, uploadedById, ...options })
    data = projectIdOrData;
  }

  return prisma.document.create({
    data: {
      projectId: data.projectId,
      uploadedById: data.uploadedById,
      name: data.name || 'test-document.pdf',
      folderId: data.folderId || null,
      s3Key: data.s3Key || `test-key-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      mimeType: data.mimeType || 'application/pdf',
      sizeBytes: data.sizeBytes || 1024,
      processingStatus: data.processingStatus || 'PENDING',
    },
  });
}

/**
 * Link a document to a task
 */
export async function linkDocumentToTask(
  taskId: string,
  documentId: string,
  linkedById: string
) {
  return prisma.taskDocument.create({
    data: {
      taskId,
      documentId,
      linkedById,
    },
  });
}

/**
 * Create a test document entity
 */
export async function createTestDocumentEntity(
  documentId: string,
  data: {
    text?: string;
    entityType?: string;
    normalizedText?: string;
    pageNumber?: number;
    startOffset?: number;
    endOffset?: number;
    confidence?: number;
    source?: string;
    needsReview?: boolean;
  } = {}
): Promise<DocumentEntity> {
  return prisma.documentEntity.create({
    data: {
      documentId,
      text: data.text || 'Test Entity',
      entityType: data.entityType || 'PERSON',
      normalizedText: data.normalizedText,
      pageNumber: data.pageNumber,
      startOffset: data.startOffset ?? 0,
      endOffset: data.endOffset ?? 10,
      confidence: data.confidence ?? 0.95,
      source: data.source || 'test',
      needsReview: data.needsReview ?? false,
    },
  });
}

/**
 * Create a test document annotation (clause)
 */
export async function createTestClause(
  documentId: string,
  data: {
    clauseType?: string;
    title?: string;
    content?: string;
    pageNumber?: number;
    startOffset?: number;
    endOffset?: number;
    confidence?: number;
    source?: string;
    riskLevel?: string;
    isVerified?: boolean;
    isRejected?: boolean;
  } = {}
) {
  return prisma.documentAnnotation.create({
    data: {
      documentId,
      annotationType: 'CLAUSE',
      clauseType: data.clauseType || 'TERMINATION',
      title: data.title || 'Test Clause',
      content: data.content || 'This is a test clause content.',
      pageNumber: data.pageNumber ?? 1,
      startOffset: data.startOffset ?? 0,
      endOffset: data.endOffset ?? 100,
      confidence: data.confidence ?? 0.95,
      source: data.source || 'test',
      riskLevel: data.riskLevel ?? null,
      isVerified: data.isVerified ?? false,
      isRejected: data.isRejected ?? false,
    },
  });
}

/**
 * Create a test master entity
 */
export async function createTestMasterEntity(
  projectId: string,
  data: {
    canonicalName?: string;
    entityType?: string;
    aliases?: string[];
    metadata?: Record<string, unknown>;
  } = {}
) {
  return prisma.masterEntity.create({
    data: {
      projectId,
      canonicalName: data.canonicalName || 'Test Entity',
      entityType: data.entityType || 'ORGANIZATION',
      aliases: data.aliases || [],
      metadata: data.metadata,
    },
  });
}

/**
 * Create a test entity relationship
 */
export async function createTestEntityRelationship(
  sourceEntityId: string,
  targetEntityId: string,
  data: {
    relationshipType?: string;
    confidence?: number;
    documentId?: string;
    metadata?: Record<string, unknown>;
  } = {}
) {
  return prisma.entityRelationship.create({
    data: {
      sourceEntityId,
      targetEntityId,
      relationshipType: data.relationshipType || 'CONTRACTS_WITH',
      confidence: data.confidence ?? 0.95,
      documentId: data.documentId,
      metadata: data.metadata,
    },
  });
}
