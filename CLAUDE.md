# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DealDiligence.ai is a deal management platform backend API with project-based collaboration, Kanban task management, and Virtual Data Room (VDR) infrastructure. Built with Express.js/TypeScript, PostgreSQL/Prisma, and Auth0 JWT authentication.

**Current Status**: Phase 1 complete (Projects, Members, Tasks, Tags). Phase 2 (VDR) and Phase 3 (AI search) planned.

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

MEMBER/VIEWER roles have granular permissions via JSON field (`canAccessKanban`, `canAccessVDR`, `restrictedToTags`).

## Testing

- Framework: Vitest with supertest for HTTP testing
- Auth mocking: Use `setMockUser()` from `tests/utils/auth-mock.ts`
- Test database: Separate `.env.test` configuration
- Tests location: `backend/tests/integration/`

## Key Files

| File | Purpose |
|------|---------|
| `src/app.ts` | Express app setup and route mounting |
| `src/middleware/auth.ts` | JWT validation and user attachment |
| `src/middleware/permissions.ts` | RBAC implementation |
| `src/utils/ApiError.ts` | Error handling pattern |
| `prisma/schema.prisma` | Database schema |
| `docs/BACKEND.md` | Full API documentation |

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection string
- `AUTH0_AUDIENCE` - API identifier (e.g., `https://api.dealdiligence.ai`)
- `AUTH0_ISSUER_BASE_URL` - Auth0 tenant URL
- `FRONTEND_URL` - CORS origin

## Adding New Features

1. Create module folder: `src/modules/<name>/`
2. Add validators, service, controller, and routes files
3. Mount routes in `src/app.ts`
4. Add integration tests in `tests/integration/`
5. Run `npm test` to verify
