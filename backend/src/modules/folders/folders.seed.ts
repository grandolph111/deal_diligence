import { prisma } from '../../config/database';

/**
 * Default folder taxonomy for new VDR projects.
 * Based on standard M&A due diligence categories.
 */
export const DEFAULT_FOLDER_TAXONOMY = [
  {
    name: '1. Financial',
    categoryType: 'financial',
    children: [
      { name: '1.1 Historical Financials', categoryType: 'financial' },
      { name: '1.2 Projections & Forecasts', categoryType: 'financial' },
      { name: '1.3 Audit Reports', categoryType: 'financial' },
      { name: '1.4 Tax Returns', categoryType: 'financial' },
    ],
  },
  {
    name: '2. Legal',
    categoryType: 'legal',
    children: [
      { name: '2.1 Corporate Documents', categoryType: 'legal' },
      { name: '2.2 Contracts (Material)', categoryType: 'legal' },
      { name: '2.3 Litigation', categoryType: 'legal' },
      { name: '2.4 Regulatory', categoryType: 'legal' },
    ],
  },
  {
    name: '3. Operations',
    categoryType: 'operations',
    children: [],
  },
  {
    name: '4. Human Resources',
    categoryType: 'hr',
    children: [],
  },
  {
    name: '5. Intellectual Property',
    categoryType: 'ip',
    children: [],
  },
  {
    name: '6. Customers & Sales',
    categoryType: 'customers',
    children: [],
  },
  {
    name: '7. Environmental',
    categoryType: 'environmental',
    children: [],
  },
  {
    name: '8. Other',
    categoryType: 'other',
    children: [],
  },
];

interface FolderNode {
  name: string;
  categoryType: string;
  children?: FolderNode[];
}

/**
 * Seeds default VDR folder taxonomy for a project.
 * Creates the standard M&A due diligence folder structure.
 *
 * @param projectId - The project ID to create folders for
 * @returns Array of created folder IDs
 */
export async function seedDefaultFolders(projectId: string): Promise<string[]> {
  const createdFolderIds: string[] = [];

  async function createFolderTree(
    folders: FolderNode[],
    parentId: string | null = null
  ): Promise<void> {
    for (const folder of folders) {
      const createdFolder = await prisma.folder.create({
        data: {
          projectId,
          name: folder.name,
          categoryType: folder.categoryType,
          parentId,
        },
      });

      createdFolderIds.push(createdFolder.id);

      if (folder.children && folder.children.length > 0) {
        await createFolderTree(folder.children, createdFolder.id);
      }
    }
  }

  await createFolderTree(DEFAULT_FOLDER_TAXONOMY);

  return createdFolderIds;
}

