# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Vision

DealDiligence.ai is an M&A deal management platform designed to streamline the due diligence process for all parties involved in mergers and acquisitions. The platform combines project-based collaboration, Kanban task management, and a secure Virtual Data Room (VDR) with AI-powered document search capabilities.

### Target Users
- Investment bankers
- M&A lawyers and legal teams
- Corporate development teams
- Private equity and venture capital firms
- Accountants and financial advisors
- Any party involved in M&A transactions

### Core Features (End Goal)
1. **Kanban Task Management**: Track due diligence items with role-based visibility. Members and Viewers only see tasks assigned to specific tags (`restrictedToTags`).
2. **Virtual Data Room**: Secure document storage with role-based file access. Users only see files in folders they have permission to view (`restrictedFolders`).
3. **AI-Powered Search**: Intelligent document search and retrieval to help users find relevant information across deal documents. (Technical implementation TBD)

### Compliance Requirements
- SOC 2 Type 2 Compliance
- AI Regulatory Compliance (US and EU)
- Privacy Law Compliance

### Platform
- Web application only (no mobile app planned)
- Potential white-label offering in the future

---

## Current Status

**Phase 1 in progress**: Authentication complete. Kanban board and project invites currently in development.

### Development Phases
1. **Phase 1 - Core Platform** (In Progress)
   - Authentication (Auth0) - COMPLETE
   - Kanban board implementation - IN PROGRESS
   - Project invites and membership - IN PROGRESS
   - Tags and task filtering - PENDING
   - Role-based task visibility - PENDING

2. **Phase 2 - Virtual Data Room**
   - S3 document storage
   - Role-based file access
   - File metadata dashboard (scoped to user access)
   - Document search (full-text)

3. **Phase 3 - AI-Powered Search**
   - AI-assisted document search and retrieval
   - Implementation details TBD based on research

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 24.x |
| Framework | Express.js 4.x |
| Language | TypeScript 5.x |
| Database | PostgreSQL 16.x |
| ORM | Prisma 5.x |
| Authentication | Auth0 (JWT RS256) |
| Validation | Zod 3.x |

---

## Common Commands

All commands run from `backend/` directory:

```bash
# Development
npm run dev                  # Start server with hot reload (port 3001)
npm run db:local:start       # Start PostgreSQL Docker container
npm run db:migrate           # Run Prisma migrations
npm run db:studio            # Open Prisma database GUI

# Testing
npm test                     # Run all tests once
npm run test:watch           # Watch mode
npm run test:coverage        # Generate coverage report

# Build
npm run build                # Compile TypeScript
npm start                    # Run production build
```

---

## Architecture

### Module Structure

Each feature follows this pattern in `src/modules/<name>/`:
- `<name>.validators.ts` - Zod schemas for request validation
- `<name>.service.ts` - Business logic and database operations
- `<name>.controller.ts` - HTTP request handlers
- `<name>.routes.ts` - Express router with middleware

### Key Patterns

**Async Route Handling**: Always wrap controllers with `asyncHandler()`:
```typescript
router.get('/', asyncHandler(async (req, res) => { ... }))
```

**Error Handling**: Use `ApiError` static methods:
```typescript
throw ApiError.badRequest('message');
throw ApiError.notFound('Resource not found');
throw ApiError.forbidden('Insufficient permissions');
```

**Input Validation**: Parse request body with Zod schemas:
```typescript
const data = createProjectSchema.parse(req.body);
```

**RBAC Middleware**: Layer middleware for access control:
```typescript
router.patch('/:id', requireMinRole('ADMIN'), controller.updateProject);
```

### Role Hierarchy

`OWNER (4) > ADMIN (3) > MEMBER (2) > VIEWER (1)`

OWNER and ADMIN have full access. MEMBER/VIEWER roles have granular permissions via JSON field:
- `canAccessKanban` - Can view Kanban board
- `canAccessVDR` - Can view Virtual Data Room
- `canUploadDocs` - Can upload documents to VDR
- `restrictedToTags` - Only see tasks with these tags
- `restrictedFolders` - Only see documents in these folders

---

## Testing

- Framework: Vitest with supertest for HTTP testing
- Auth mocking: Use `setMockUser()` from `tests/utils/auth-mock.ts`
- Test database: Separate `.env.test` configuration
- Tests location: `backend/tests/integration/`

---

## Key Files

| File | Purpose |
|------|---------|
| `src/app.ts` | Express app setup and route mounting |
| `src/middleware/auth.ts` | JWT validation and user attachment |
| `src/middleware/permissions.ts` | RBAC implementation |
| `src/utils/ApiError.ts` | Error handling pattern |
| `prisma/schema.prisma` | Database schema |
| `docs/BACKEND.md` | Full API documentation |

---

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection string
- `AUTH0_AUDIENCE` - API identifier (e.g., `https://api.dealdiligence.ai`)
- `AUTH0_ISSUER_BASE_URL` - Auth0 tenant URL
- `FRONTEND_URL` - CORS origin

---

## Adding New Features

1. Create module folder: `src/modules/<name>/`
2. Add validators, service, controller, and routes files
3. Mount routes in `src/app.ts`
4. Add integration tests in `tests/integration/`
5. Run `npm test` to verify
