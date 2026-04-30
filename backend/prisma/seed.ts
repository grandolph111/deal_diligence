import { PrismaClient, PlatformRole, ProjectRole } from '@prisma/client';
import { generateDevPassword } from '../src/utils/generateDevPassword';

const prisma = new PrismaClient();

const DEMO_COMPANY_ID = 'demo-company';
const ACME_COMPANY_ID = 'acme-holdings';

type SeedUser = {
  auth0Id: string;
  email: string;
  name: string;
  devPassword: string;
  platformRole: PlatformRole;
  companyId: string | null;
};

const STATIC_USERS: SeedUser[] = [
  {
    auth0Id: 'dev|super-admin',
    email: 'alan@dealdiligence.com',
    name: 'Alan',
    devPassword: 'dealdone198cdx4',
    platformRole: PlatformRole.SUPER_ADMIN,
    companyId: null,
  },
  {
    auth0Id: 'dev|customer-admin',
    email: 'admin@dealdiligence.com',
    name: 'Customer Admin',
    devPassword: 'Adm!n-9fK2pQzR7vLx',
    platformRole: PlatformRole.CUSTOMER_ADMIN,
    companyId: DEMO_COMPANY_ID,
  },
  {
    auth0Id: 'dev|member',
    email: 'demo@dealdiligence.com',
    name: 'Demo Member',
    devPassword: 'Dem0-3hT8wYbN5qJe',
    platformRole: PlatformRole.MEMBER,
    companyId: DEMO_COMPANY_ID,
  },
];

async function upsertUser(u: SeedUser) {
  return prisma.user.upsert({
    where: { auth0Id: u.auth0Id },
    create: {
      auth0Id: u.auth0Id,
      email: u.email,
      name: u.name,
      devPassword: u.devPassword,
      platformRole: u.platformRole,
      companyId: u.companyId ?? undefined,
    },
    update: {
      email: u.email,
      devPassword: u.devPassword,
      platformRole: u.platformRole,
      companyId: u.companyId ?? null,
      name: u.name,
    },
  });
}

async function main() {
  // Companies
  await prisma.company.upsert({
    where: { id: DEMO_COMPANY_ID },
    create: {
      id: DEMO_COMPANY_ID,
      name: 'Demo Company',
      description: 'Default company for existing projects',
    },
    update: {},
  });
  await prisma.company.upsert({
    where: { id: ACME_COMPANY_ID },
    create: {
      id: ACME_COMPANY_ID,
      name: 'Acme Holdings',
      description: 'Second tenant for side-by-side testing',
    },
    update: {},
  });

  // Static users (Demo Company + Super Admin) — passwords stable across seeds.
  for (const u of STATIC_USERS) {
    await upsertUser(u);
  }

  // Acme users — generate fresh passwords only on FIRST seed; afterwards
  // preserve whatever's in the DB (so re-running the seed doesn't break
  // sessions you've already set up).
  const acmeAdminExisting = await prisma.user.findUnique({
    where: { auth0Id: 'dev|acme-admin' },
  });
  const acmeSmeExisting = await prisma.user.findUnique({
    where: { auth0Id: 'dev|acme-sme' },
  });

  const acmeAdminPassword = acmeAdminExisting?.devPassword ?? generateDevPassword();
  const acmeSmePassword = acmeSmeExisting?.devPassword ?? generateDevPassword();

  await upsertUser({
    auth0Id: 'dev|acme-admin',
    email: 'acme-admin@dealdiligence.com',
    name: 'Acme Admin',
    devPassword: acmeAdminPassword,
    platformRole: PlatformRole.CUSTOMER_ADMIN,
    companyId: ACME_COMPANY_ID,
  });
  await upsertUser({
    auth0Id: 'dev|acme-sme',
    email: 'acme-sme@dealdiligence.com',
    name: 'Acme SME',
    devPassword: acmeSmePassword,
    platformRole: PlatformRole.MEMBER,
    companyId: ACME_COMPANY_ID,
  });

  // Demo Member gets a ProjectMember row on the oldest Demo Company project.
  const demoMember = await prisma.user.findUnique({
    where: { email: 'demo@dealdiligence.com' },
  });
  if (demoMember) {
    const firstProject = await prisma.project.findFirst({
      where: { companyId: DEMO_COMPANY_ID },
      orderBy: { createdAt: 'asc' },
    });
    if (firstProject) {
      await prisma.projectMember.upsert({
        where: {
          projectId_userId: {
            projectId: firstProject.id,
            userId: demoMember.id,
          },
        },
        create: {
          projectId: firstProject.id,
          userId: demoMember.id,
          role: ProjectRole.MEMBER,
          acceptedAt: new Date(),
          permissions: { restrictedFolders: [] },
        },
        update: {},
      });
    }
  }

  // Acme Q4 Acquisition deal (only if it doesn't already exist).
  const existingAcmeProject = await prisma.project.findFirst({
    where: { companyId: ACME_COMPANY_ID, name: 'Acme Q4 Acquisition' },
  });
  if (!existingAcmeProject) {
    await prisma.project.create({
      data: {
        name: 'Acme Q4 Acquisition',
        description: 'Seed project for the Acme Holdings tenant.',
        companyId: ACME_COMPANY_ID,
      },
    });
  }

  console.log('Seed complete.');
  console.log('  alan@dealdiligence.com       / dealdone198cdx4           (SUPER_ADMIN)');
  console.log('  admin@dealdiligence.com      / Adm!n-9fK2pQzR7vLx        (CUSTOMER_ADMIN @ Demo Company)');
  console.log('  demo@dealdiligence.com       / Dem0-3hT8wYbN5qJe         (MEMBER @ Demo Company)');
  console.log(`  acme-admin@dealdiligence.com / ${acmeAdminPassword}  (CUSTOMER_ADMIN @ Acme Holdings)`);
  console.log(`  acme-sme@dealdiligence.com   / ${acmeSmePassword}  (MEMBER @ Acme Holdings, no folder grants yet)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
