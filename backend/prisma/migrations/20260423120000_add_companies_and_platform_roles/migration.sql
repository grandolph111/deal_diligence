-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'CUSTOMER_ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- Seed a Demo Company so existing projects can be backfilled.
INSERT INTO "Company" ("id", "name", "description", "createdAt", "updatedAt")
VALUES ('demo-company', 'Demo Company', 'Default company for existing projects', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- AlterTable User: add platform role + tenant link + dev-creds field
ALTER TABLE "User"
  ADD COLUMN "platformRole" "PlatformRole" NOT NULL DEFAULT 'MEMBER',
  ADD COLUMN "companyId" TEXT,
  ADD COLUMN "devPassword" TEXT;

-- AlterTable Project: add companyId (nullable first, backfill, then NOT NULL)
ALTER TABLE "Project" ADD COLUMN "companyId" TEXT;
UPDATE "Project" SET "companyId" = 'demo-company' WHERE "companyId" IS NULL;
ALTER TABLE "Project" ALTER COLUMN "companyId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
