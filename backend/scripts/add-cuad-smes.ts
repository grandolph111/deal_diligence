/**
 * Put two scoped subject-matter experts on the CUAD Sample Deal.
 *
 * Demo data, but the scoping is the point: each SME is granted a slice of the
 * 26 risk categories, and everything downstream follows from that one grant —
 * the data room, the deal map, the deal report, chat answers, and any Kanban
 * board they own. Neither is granted Material Contracts, which carries evidence
 * from all 100 documents; a grant that wide would make the scoping invisible.
 *
 * Idempotent: re-running updates the grants rather than duplicating members.
 *
 *   npx ts-node --transpile-only scripts/add-cuad-smes.ts [--dry]
 */

import { PlatformRole, ProjectRole } from '@prisma/client';
import { prisma } from '../src/config/database';
import { getRiskCategory } from '../src/integrations/library/risk-categories';

const PROJECT_ID = process.env.CUAD_PROJECT_ID || 'a2442cc0-994d-4798-ba55-9f2502c42d69';
const DRY = process.argv.includes('--dry');

interface Sme {
  auth0Id: string;
  email: string;
  name: string;
  devPassword: string;
  /** What this person is responsible for, in the deal's own vocabulary. */
  riskCategories: string[];
}

const SMES: Sme[] = [
  {
    auth0Id: 'dev|cuad-sme-ip',
    email: 'ip-sme@dealdiligence.com',
    name: 'Priya Raghunathan',
    devPassword: 'IpSme-4kQ2vRn8',
    riskCategories: ['14-intellectual-property', '25-data-privacy-security'],
  },
  {
    auth0Id: 'dev|cuad-sme-employment',
    email: 'employment-sme@dealdiligence.com',
    name: 'Marcus Delacroix',
    devPassword: 'EmpSme-7hT3xBw5',
    // Two of these carry no evidence yet, deliberately: they are this person's
    // responsibility, and an empty category is a supplemental diligence request
    // on the report rather than something to hide.
    riskCategories: [
      '20-employees-contractors',
      '22-employee-benefits-labor',
      '23-employment-litigation',
      '17-litigation',
    ],
  },
];

async function main() {
  const project = await prisma.project.findUnique({
    where: { id: PROJECT_ID },
    select: { id: true, name: true, companyId: true },
  });
  if (!project) throw new Error(`Project ${PROJECT_ID} not found`);
  console.log(`${project.name}${DRY ? '  — DRY RUN' : ''}\n`);

  // Fail before touching anything if a slug is wrong: a typo would silently
  // grant nothing and read as a permissions bug later.
  for (const sme of SMES) {
    const unknown = sme.riskCategories.filter((id) => !getRiskCategory(id));
    if (unknown.length) throw new Error(`${sme.email}: unknown categories ${unknown.join(', ')}`);
  }

  for (const sme of SMES) {
    const permissions = {
      canAccessKanban: true,
      canAccessVDR: true,
      canUploadDocs: true,
      restrictedRiskCategories: sme.riskCategories,
    };

    if (DRY) {
      console.log(`  would add ${sme.name} <${sme.email}>`);
      console.log(`    ${sme.riskCategories.map((c) => getRiskCategory(c)!.title).join(', ')}`);
      continue;
    }

    const user = await prisma.user.upsert({
      where: { auth0Id: sme.auth0Id },
      create: {
        auth0Id: sme.auth0Id,
        email: sme.email,
        name: sme.name,
        devPassword: sme.devPassword,
        platformRole: PlatformRole.MEMBER,
        companyId: project.companyId ?? undefined,
      },
      update: {
        email: sme.email,
        name: sme.name,
        devPassword: sme.devPassword,
        platformRole: PlatformRole.MEMBER,
        companyId: project.companyId ?? null,
      },
      select: { id: true },
    });

    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
      create: {
        projectId: project.id,
        userId: user.id,
        role: ProjectRole.MEMBER,
        permissions,
      },
      update: { role: ProjectRole.MEMBER, permissions },
    });

    // Count what they can actually reach, so the grant is verified rather than
    // assumed. This is the same join the scope service walks.
    const docs = await prisma.libraryNode.findMany({
      where: {
        projectId: project.id,
        riskCategoryId: { in: sme.riskCategories },
        sourceDocumentId: { not: null },
      },
      select: { sourceDocumentId: true },
      distinct: ['sourceDocumentId'],
    });

    console.log(`  ${sme.name} <${sme.email}>`);
    console.log(`    grants: ${sme.riskCategories.map((c) => getRiskCategory(c)!.title).join(', ')}`);
    console.log(`    sees:   ${docs.length} document(s)\n`);
  }

  const members = await prisma.projectMember.findMany({
    where: { projectId: project.id },
    include: { user: { select: { email: true, name: true } } },
    orderBy: { role: 'asc' },
  });
  console.log(`Members on ${project.name}: ${members.length}`);
  for (const m of members) {
    const perms = (m.permissions ?? {}) as { restrictedRiskCategories?: string[] };
    const scope = perms.restrictedRiskCategories?.length
      ? `${perms.restrictedRiskCategories.length} categories`
      : 'full deal';
    console.log(`  ${m.role.padEnd(6)} ${m.user.email.padEnd(32)} ${scope}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
