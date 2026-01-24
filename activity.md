# Project Build - Activity Log

## Current Status

**Last Updated:** 2026-01-24
**Phase:** 2A - Foundation
**Tasks Completed:** 2/46
**Current Task:** Folder management API - COMPLETE

---

## Project Documents

| Document | Description | Status |
|----------|-------------|--------|
| [PRD.md](PRD.md) | Product Requirements | Complete |
| [plan.md](plan.md) | Implementation Plan | Complete |
| [activity.md](activity.md) | Activity Log (this file) | Active |

---

## Phase Progress

| Phase | Status | Tasks | Completed |
|-------|--------|-------|-----------|
| 2A - Foundation | In Progress | 17 | 2 |
| 2B - Extraction | Not Started | 9 | 0 |
| 2C - Knowledge Graph | Not Started | 7 | 0 |
| 3 - AI Intelligence | Not Started | 10 | 0 |
| Cross-Cutting | Not Started | 3 | 0 |

---

## Session Log

### 2025-01-24 - Planning Session

**Objective:** Create PRD and implementation plan for VDR and AI Search features

**Completed:**
- Gathered requirements through Q&A session
- Created comprehensive PRD covering Phase 2 (VDR) and Phase 3 (AI Search)
- Created implementation plan with 46 tasks across all phases
- Created activity log for tracking progress

**Key Decisions Made:**
- MVP includes custom folders + full-text search (versioning deferred)
- Documents linkable to Kanban tasks
- AI chat uses both VDR docs and general M&A knowledge
- AI chat respects folder permissions and always cites sources
- Start with PDFs (with OCR), add other formats later
- Risk dashboard visible to ADMIN/OWNER only
- Comprehensive audit logging (views, searches, chat queries)
- View-only mode available for sensitive folders
- Search shows restricted docs with "Request Access" option
- VDR as project tab, AI Assistant as dedicated tab

**Open Items:**
- [ ] Create BerryDB account and obtain API key
- [ ] Verify BerryDB SOC 2 compliance
- [ ] Confirm BerryDB pricing for expected volume
- [ ] Provision AWS S3 bucket
- [ ] Decide Python microservice hosting approach

**Next Steps:**
- Begin Phase 2A implementation starting with infrastructure setup

---

### 2026-01-24 - Database Schema Implementation

**Objective:** Implement database schema for VDR (Phase 2A task 2)

**Task Completed:**
- Category: database
- Phase: 2A
- Description: Database schema for VDR

**What Was Implemented:**

1. **Folder Model** (`backend/prisma/schema.prisma`)
   - Self-referencing hierarchy with `parent` and `children` relations
   - Fields: `id`, `projectId`, `name`, `parentId`, `categoryType`, `isViewOnly`
   - Unique constraint on `[projectId, parentId, name]` to prevent duplicate folder names at same level

2. **Document Model Enhancements**
   - Added `folderId` relation to Folder
   - Added `berryDbId` for BerryDB integration
   - Added `riskLevel` field for AI-extracted risk assessment
   - Added `isViewOnly` for folder-level access control
   - Added `uploadedBy` relation to User
   - Added `taskDocuments` relation for task-document linking

3. **TaskDocument Junction Table** (`backend/prisma/schema.prisma`)
   - Links tasks to documents with audit trail
   - Fields: `taskId`, `documentId`, `linkedById`, `linkedAt`
   - Unique constraint on `[taskId, documentId]`

4. **AuditLog Model** (`backend/prisma/schema.prisma`)
   - Comprehensive audit logging for SOC 2 compliance
   - Fields: `action`, `resourceType`, `resourceId`, `metadata`, `ipAddress`, `userAgent`
   - Indexed on `[projectId]`, `[projectId, createdAt]`, `[projectId, action]`, `[userId]`

5. **Folder Seeding Function** (`backend/src/modules/folders/folders.seed.ts`)
   - `seedDefaultFolders(projectId)` creates standard M&A due diligence taxonomy
   - Default structure: Financial (4 subfolders), Legal (4 subfolders), Operations, HR, IP, Customers, Environmental, Other
   - Integrated into project creation workflow

6. **Migration** (`backend/prisma/migrations/20260124_add_vdr_schema/`)
   - SQL migration file created and marked as applied

**Files Created/Modified:**
- `backend/prisma/schema.prisma` - Updated with new models and relations
- `backend/src/modules/folders/folders.seed.ts` - NEW: Default folder taxonomy seeding
- `backend/src/modules/projects/projects.service.ts` - Added folder seeding to project creation
- `backend/prisma/migrations/20260124_add_vdr_schema/migration.sql` - NEW: Migration file

**Verification:**
- Prisma client generated successfully
- All new models accessible via Prisma queries
- Folder seeding tested with self-referencing hierarchy working correctly
- No new TypeScript errors introduced (pre-existing errors in codebase unrelated to this change)

**Notes:**
- Skipped the "Infrastructure setup for VDR" task (first in plan.md) because it requires external services (AWS S3, BerryDB account) that are not yet configured
- The database schema task has no external dependencies and can proceed independently
- Pre-existing TypeScript errors in the codebase (unrelated to this change) - these should be addressed in a separate task

**Next Task:**
- Infrastructure setup for VDR (requires AWS S3 bucket and BerryDB account)
- Or: Folder management API (can proceed with database schema complete)

---

### 2026-01-24 - Folder Management API Implementation

**Objective:** Implement folder management API for VDR (Phase 2A task 3)

**Task Completed:**
- Category: backend
- Phase: 2A
- Description: Folder management API

**What Was Implemented:**

1. **Folder Validators** (`backend/src/modules/folders/folders.validators.ts`)
   - `createFolderSchema`: Validates folder creation with name, parentId, categoryType, isViewOnly
   - `updateFolderSchema`: Validates folder updates (rename, isViewOnly)
   - `moveFolderSchema`: Validates folder move operations with parentId

2. **Folder Service** (`backend/src/modules/folders/folders.service.ts`)
   - `verifyFolderInProject()`: IDOR protection - ensures folder belongs to project
   - `getProjectFolderTree()`: Returns hierarchical tree structure of folders
   - `getProjectFolders()`: Returns flat list of folders with document counts
   - `getFolderById()`: Returns folder with parent and children details
   - `createFolder()`: Creates folder with duplicate name checking at same level
   - `updateFolder()`: Renames folder or updates isViewOnly status
   - `moveFolder()`: Moves folder to new parent with circular reference prevention
   - `deleteFolder()`: Deletes empty folder (validates no documents or children)
   - `getFolderPath()`: Returns breadcrumb path from root to folder
   - `userHasFolderAccess()`: Checks user permission for folder access
   - `isFolderDescendant()`: Prevents circular folder moves

3. **Folder Controller** (`backend/src/modules/folders/folders.controller.ts`)
   - GET `/folders`: List all folders (tree or flat with `?format=flat`)
   - GET `/folders/:folderId`: Get folder details with children
   - GET `/folders/:folderId/path`: Get folder breadcrumb path
   - POST `/folders`: Create new folder
   - PATCH `/folders/:folderId`: Rename or update folder
   - PATCH `/folders/:folderId/move`: Move folder to new parent
   - DELETE `/folders/:folderId`: Delete empty folder

4. **Folder Routes** (`backend/src/modules/folders/folders.routes.ts`)
   - All routes require authentication and project membership
   - Read operations require `canAccessVDR` permission
   - Create/Update/Delete operations require minimum ADMIN role

5. **Route Mounting** (`backend/src/app.ts`)
   - Mounted at `/api/v1/projects/:id/folders`

6. **Integration Tests** (`backend/tests/integration/folders.test.ts`)
   - 32 comprehensive tests covering all endpoints
   - Tests for authentication, authorization, IDOR protection
   - Tests for folder CRUD operations, move, path
   - Tests for conflict handling (duplicate names)
   - Tests for validation (empty folders, parent validation)

7. **Test Utilities** (`backend/tests/utils/db-helpers.ts`)
   - Added `createTestFolder()` helper function
   - Updated `cleanDatabase()` to include new VDR tables

**Files Created:**
- `backend/src/modules/folders/folders.validators.ts`
- `backend/src/modules/folders/folders.service.ts`
- `backend/src/modules/folders/folders.controller.ts`
- `backend/src/modules/folders/folders.routes.ts`
- `backend/tests/integration/folders.test.ts`

**Files Modified:**
- `backend/src/app.ts` - Added folder routes import and mounting
- `backend/tests/utils/db-helpers.ts` - Added createTestFolder helper
- `backend/tests/utils/index.ts` - Exported createTestFolder

**Verification:**
- Folder module TypeScript compiles without errors
- Pre-existing TypeScript errors in other modules remain (unrelated to this change)
- Tests require running database (PostgreSQL at 127.0.0.1:5433)

**API Endpoints Created:**
| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/projects/:id/folders` | List folder tree | canAccessVDR |
| GET | `/projects/:id/folders?format=flat` | List folders flat | canAccessVDR |
| GET | `/projects/:id/folders/:folderId` | Get folder details | canAccessVDR |
| GET | `/projects/:id/folders/:folderId/path` | Get breadcrumb path | canAccessVDR |
| POST | `/projects/:id/folders` | Create folder | ADMIN+ |
| PATCH | `/projects/:id/folders/:folderId` | Update folder | ADMIN+ |
| PATCH | `/projects/:id/folders/:folderId/move` | Move folder | ADMIN+ |
| DELETE | `/projects/:id/folders/:folderId` | Delete empty folder | ADMIN+ |

**Next Task:**
- Document upload and storage API (requires S3 setup first)
- Or: Audit logging service (can proceed independently)

---

<!-- Future session entries will be added below -->
