# Project Build - Activity Log

## Current Status

**Last Updated:** 2026-01-24
**Phase:** 2A - Foundation
**Tasks Completed:** 1/46
**Current Task:** Database schema for VDR - COMPLETE

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
| 2A - Foundation | In Progress | 17 | 1 |
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

<!-- Future session entries will be added below -->
